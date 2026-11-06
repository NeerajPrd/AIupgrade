"""Lead capture for website-widget (agent API) conversations.

Flow, run in the background after the chat reply has been returned:
  1. Cheap gate (done by the caller): the visitor's message contains a phone or email.
  2. One LLM call over the recent conversation extracts name, business, phone, email,
     interest and language. If it fails (e.g. Gemini 429), the regex matches are used
     instead so a lead is never lost.
  3. Upsert the conversation's single lead row (unique on history_id, row-locked).
  4. Email the client on first creation, and once more each time the visitor adds new
     contact details. An unchanged lead is never emailed again.

Logs carry ids and flags only; contact details are never logged at INFO level.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol, Tuple

from loguru import logger

from src.services.leads.detection import find_contacts, guess_language
from src.services.leads.email_template import BRAND, build_html, build_subject
from src.services.leads.extraction import LEAD_FIELDS, LLMCall, extract_lead_fields

CONTACT_FIELDS = ("name", "business_name", "phone", "email")
# Phone / email accumulate (a visitor may give a second number); the rest take the newest value.
_ACCUMULATING = {"phone": 64, "email": 320}

STATUS_SENT = "sent"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"

TRANSCRIPT_LIMIT = 200

# send(to, subject, html, reply_to) -> True if sent, False if skipped (SMTP not configured). Raises on failure.
EmailSender = Callable[[List[str], str, str, Optional[str]], Awaitable[bool]]


def _split(value: Optional[str]) -> List[str]:
    return [p.strip() for p in (value or "").split(",") if p.strip()]


def _norm(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum() or ch == "@")


def _accumulate(old: Optional[str], new: Optional[str], limit: int) -> Optional[str]:
    items = _split(old)
    seen = {_norm(i) for i in items}
    for item in _split(new):
        if _norm(item) not in seen:
            candidate = ", ".join(items + [item])
            if len(candidate) > limit:
                break
            items.append(item)
            seen.add(_norm(item))
    return ", ".join(items) or None


def merge_fields(
    existing: Optional[Dict[str, Optional[str]]], incoming: Dict[str, Optional[str]]
) -> Tuple[Dict[str, Optional[str]], List[str]]:
    """Merge newly extracted fields into the stored lead. Returns (merged, changed contact fields).

    Empty incoming values never erase stored ones, so a later, vaguer extraction can't lose details.
    """
    existing = existing or {}
    merged: Dict[str, Optional[str]] = {}
    changed: List[str] = []
    for key in LEAD_FIELDS:
        old, new = existing.get(key), incoming.get(key)
        if key in _ACCUMULATING:
            value = _accumulate(old, new, _ACCUMULATING[key])
        else:
            value = new or old
        merged[key] = value
        if key in CONTACT_FIELDS and (value or None) != (old or None):
            if key in _ACCUMULATING and {_norm(v) for v in _split(value)} == {_norm(v) for v in _split(old)}:
                continue  # only formatting differs
            changed.append(key)
    return merged, changed


def plan_upsert(
    existing: Optional[Dict[str, Optional[str]]], incoming: Dict[str, Optional[str]]
) -> Tuple[Dict[str, Optional[str]], List[str]]:
    """Fields to store and the contact fields that are new. For a new lead, every given contact field is new."""
    merged, changed = merge_fields(existing, incoming)
    if existing is None:
        changed = [k for k in CONTACT_FIELDS if merged.get(k)]
    return merged, changed


def fallback_fields(message: str, visitor_texts: List[str]) -> Dict[str, Optional[str]]:
    """What we can get without the LLM: the regex matches and a script-based language guess."""
    matches = find_contacts(message)
    return {
        "name": None,
        "business_name": None,
        "phone": ", ".join(matches.phones) or None,
        "email": ", ".join(matches.emails) or None,
        "interest": None,
        "language": guess_language(visitor_texts),
    }


def ensure_regex_contacts(fields: Dict[str, Optional[str]], message: str) -> Dict[str, Optional[str]]:
    """The LLM sometimes drops a number; keep everything the regex found in the visitor's message."""
    matches = find_contacts(message)
    out = dict(fields)
    if matches.phones and not out.get("phone"):
        out["phone"] = ", ".join(matches.phones)
    if matches.emails:
        have = {_norm(e) for e in _split(out.get("email"))}
        missing = [e for e in matches.emails if _norm(e) not in have]
        if missing:
            out["email"] = ", ".join(_split(out.get("email")) + missing)
    return out


class LeadStore(Protocol):
    async def get_agent(self, agent_id: uuid.UUID) -> Any: ...
    async def load_transcript(self, history_id: uuid.UUID) -> List[Dict[str, Any]]: ...
    async def upsert(
        self, agent_id: uuid.UUID, history_id: uuid.UUID, incoming: Dict[str, Optional[str]]
    ) -> Tuple[Any, bool, List[str]]: ...
    async def record_notification(self, lead_id: uuid.UUID, status: str, error: Optional[str]) -> None: ...


@dataclass
class LeadResult:
    lead_id: Optional[uuid.UUID] = None
    created: bool = False
    changed_fields: List[str] = field(default_factory=list)
    used_fallback: bool = False
    notify_status: Optional[str] = None


def lead_to_dict(lead: Any) -> Dict[str, Optional[str]]:
    return {key: getattr(lead, key, None) for key in LEAD_FIELDS}


def notify_recipients(agent: Any) -> List[str]:
    if not getattr(agent, "lead_notify_enabled", False):
        return []
    return [e.strip() for e in (getattr(agent, "lead_notify_emails", None) or []) if e and e.strip()]


async def process_lead(
    store: LeadStore,
    *,
    agent_id: uuid.UUID,
    history_id: uuid.UUID,
    message: str,
    llm_call: Optional[LLMCall],
    send_email: EmailSender,
) -> LeadResult:
    result = LeadResult()
    if not find_contacts(message).found:
        return result

    agent = await store.get_agent(agent_id)
    if agent is None:
        return result

    transcript = await store.load_transcript(history_id)
    visitor_texts = [str(t.get("content") or "") for t in transcript if t.get("role") == "user"]
    if message not in visitor_texts:
        visitor_texts.append(message)

    fields: Optional[Dict[str, Optional[str]]] = None
    if llm_call is not None:
        try:
            fields = await extract_lead_fields(transcript or [{"role": "user", "content": message}], llm_call)
        except Exception as err:
            logger.warning(
                "Lead extraction LLM call failed for history {} ({}); using regex fallback",
                history_id,
                type(err).__name__,
            )
    if fields is None:
        fields = fallback_fields(message, visitor_texts)
        result.used_fallback = True
    fields = ensure_regex_contacts(fields, message)
    if not fields.get("language"):
        fields["language"] = guess_language(visitor_texts)

    lead, created, changed = await store.upsert(agent_id, history_id, fields)
    result.lead_id, result.created, result.changed_fields = lead.id, created, changed
    logger.info(
        "Lead {} for agent {} history {}: created={} changed={} fallback={}",
        lead.id, agent_id, history_id, created, changed, result.used_fallback,
    )

    if not created and not changed:
        return result  # unchanged lead: never email twice

    recipients = notify_recipients(agent)
    if not recipients:
        return result

    lead_data = lead_to_dict(lead)
    # "Updated" only if the client already received this lead; otherwise (alerts were off, SMTP
    # unconfigured, or the send failed) the first email they get presents it as new.
    updated = not created and getattr(lead, "notify_status", None) == STATUS_SENT
    subject = build_subject(lead_data, updated=updated)
    html = build_html(
        lead_data,
        transcript,
        agent_name=getattr(agent, "name", "") or "",
        captured_at=getattr(lead, "updated_at", None) if updated else getattr(lead, "created_at", None),
        updated=updated,
        changed_fields=changed,
    )
    reply_to = (_split(lead_data.get("email")) or [None])[0]

    try:
        sent = await send_email(recipients, subject, html, reply_to)
        status, error = (STATUS_SENT, None) if sent else (STATUS_SKIPPED, "SMTP not configured")
    except Exception as err:
        status, error = STATUS_FAILED, f"{type(err).__name__}: {err}"[:1000]
    result.notify_status = status
    await store.record_notification(lead.id, status, error)
    log = logger.info if status == STATUS_SENT else logger.warning
    log("Lead {} notification ({}) {} to {} recipient(s)", lead.id, "update" if updated else "new", status, len(recipients))
    return result


# --------------------------------------------------------------------------- #
# Postgres implementation
# --------------------------------------------------------------------------- #
class SqlLeadStore:
    def __init__(self, session):
        self.session = session

    async def get_agent(self, agent_id):
        from src.models.sql.models import Agent

        return await self.session.get(Agent, agent_id)

    async def load_transcript(self, history_id):
        from sqlalchemy import select

        from src.models.sql.models import AgentChat

        rows = await self.session.execute(
            select(AgentChat.role, AgentChat.content, AgentChat.created_at)
            .where(AgentChat.history_id == history_id)
            .order_by(AgentChat.created_at.asc())
            .limit(TRANSCRIPT_LIMIT)
        )
        return [{"role": r.role, "content": r.content, "created_at": r.created_at} for r in rows.all()]

    async def _locked(self, history_id):
        from sqlalchemy import select

        from src.models.sql.lead import Lead

        res = await self.session.execute(select(Lead).where(Lead.history_id == history_id).with_for_update())
        return res.scalar_one_or_none()

    async def upsert(self, agent_id, history_id, incoming):
        from sqlalchemy import select
        from sqlalchemy.dialects.postgresql import insert

        from src.models.sql.lead import Lead

        lead = await self._locked(history_id)
        if lead is None:
            merged, new_fields = plan_upsert(None, incoming)
            now = datetime.now(timezone.utc)
            stmt = (
                insert(Lead)
                .values(id=uuid.uuid4(), agent_id=agent_id, history_id=history_id, created_at=now, updated_at=now, **merged)
                .on_conflict_do_nothing(index_elements=["history_id"])
                .returning(Lead.id)
            )
            new_id = (await self.session.execute(stmt)).scalar_one_or_none()
            if new_id is not None:
                await self.session.commit()
                lead = (await self.session.execute(select(Lead).where(Lead.id == new_id))).scalar_one()
                return lead, True, new_fields
            lead = await self._locked(history_id)  # lost the race: another task inserted it

        before = lead_to_dict(lead)
        merged, changed = plan_upsert(before, incoming)
        if merged != before:
            for key, value in merged.items():
                setattr(lead, key, value)
            lead.updated_at = datetime.now(timezone.utc)
        await self.session.commit()
        return lead, False, changed

    async def record_notification(self, lead_id, status, error):
        from sqlalchemy import update

        from src.models.sql.lead import Lead

        await self.session.execute(
            update(Lead)
            .where(Lead.id == lead_id)
            .values(notified_at=datetime.now(timezone.utc), notify_status=status, notify_error=error)
        )
        await self.session.commit()


async def smtp_send(to: List[str], subject: str, html: str, reply_to: Optional[str] = None) -> bool:
    from src.core.handler.email_handler import SMTPHandler
    from src.services.email_service import EmailService

    handler = SMTPHandler()
    try:
        return await EmailService(handler).send_html_email(
            to, subject, html, reply_to=reply_to, from_name=BRAND
        )
    finally:
        await handler.disconnect_client()


async def process_lead_in_background(postgres_manager, agent_id: str, history_id: str, message: str) -> None:
    """Entry point for FastAPI BackgroundTasks. Never raises: a lead failure must not surface anywhere."""
    try:
        agent_uuid, history_uuid = uuid.UUID(str(agent_id)), uuid.UUID(str(history_id))
        async with postgres_manager.get_session() as session:
            store = SqlLeadStore(session)
            agent = await store.get_agent(agent_uuid)
            if agent is None:
                return
            await process_lead(
                store,
                agent_id=agent_uuid,
                history_id=history_uuid,
                message=message,
                llm_call=_llm_for(agent),
                send_email=smtp_send,
            )
    except Exception:
        logger.exception("Lead processing failed for history {}", history_id)


def _llm_for(agent):
    from src.services.leads.extraction import default_llm_call

    return default_llm_call(agent.user_id, agent.id)
