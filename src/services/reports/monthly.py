"""Monthly client report for a website-widget agent.

For one agent and one calendar month (Asia/Kathmandu) it reports:
  * how many website conversations there were, and how many leads were captured,
  * the questions visitors asked most (similar questions grouped by ONE LLM call;
    if that call fails, an exact-match count is used so the report still goes out),
  * the questions the assistant could not answer (replies where it said it did not
    have the information),
and attaches the full conversations as a Word document (src/services/agents/export.py).

Everything except `load_report_data` is pure, so it is unit-tested without a database.
"""

import calendar
import json
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from html import escape
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from loguru import logger

from src.services.agents.conversation_usage import KATHMANDU_TZ, SOURCE_AGENT_API, start_of_day_kathmandu
from src.services.leads.detection import has_contact_info
from src.services.leads.email_template import BRAND, FONT_STACK

LLMCall = Callable[[List[Dict[str, str]]], Awaitable[Any]]

TOP_QUESTIONS_LIMIT = 10
UNANSWERED_LIMIT = 30
# Keeps the single LLM call small enough for a free-tier request.
MAX_QUESTIONS_FOR_LLM = 300
MAX_QUESTION_CHARS = 200

_PERIOD_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


# ---------------------------------------------------------------- periods

def parse_period(period: str) -> Tuple[int, int]:
    match = _PERIOD_RE.match(period or "")
    if not match:
        raise ValueError("month must look like 2026-10")
    return int(match.group(1)), int(match.group(2))


def previous_period(today: date) -> str:
    """The calendar month before `today`, as 'YYYY-MM'."""
    last_day_of_previous = today.replace(day=1) - timedelta(days=1)
    return last_day_of_previous.strftime("%Y-%m")


def period_bounds(period: str) -> Tuple[datetime, datetime]:
    """[start, end) of the month in Asia/Kathmandu, as aware datetimes."""
    year, month = parse_period(period)
    start = date(year, month, 1)
    end = date(year + (month == 12), month % 12 + 1, 1)
    return start_of_day_kathmandu(start), start_of_day_kathmandu(end)


def period_label(period: str) -> str:
    year, month = parse_period(period)
    return f"{calendar.month_name[month]} {year}"


# ---------------------------------------------------------------- unanswered questions

# Replies in which the assistant admits it does not have the information. Covers the wording in
# the agents' instructions, the built-in knowledge-base guardrail, and Nepali / Romanized Nepali.
_UNANSWERED_PATTERNS = [
    r"(?:do not|don['’]?t|does not|doesn['’]?t)\s+(?:currently\s+|yet\s+)?have\s+(?:\w+\s+){0,3}(?:information|info|details)\b",
    r"can only answer questions related to my specific expertise",
    r"\b(?:i am|i['’]m|i was)\s+(?:unable|not able)\s+to\s+(?:find|answer|help with)",
    r"\bno information (?:about|on|regarding)\b",
    r"जानकारी\s*(?:मसँग\s*|हामीसँग\s*)?(?:उपलब्ध\s*)?छैन",
    r"थाहा\s*छैन",
    r"\bja{1,2}nka{1,2}ri\s+(?:uplabdha\s+)?(?:chh?aina|xaina)\b",
    r"\btha{1,2}ha{0,2}\s+(?:chh?aina|xaina)\b",
]
_UNANSWERED_RE = re.compile("|".join(_UNANSWERED_PATTERNS), re.IGNORECASE)


def is_unanswered_reply(reply: str) -> bool:
    return bool(reply and _UNANSWERED_RE.search(reply))


def _normalise(text: str) -> str:
    return re.sub(r"[\W_]+", " ", (text or "").lower()).strip()


def _clip(text: str, limit: int = MAX_QUESTION_CHARS) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def find_unanswered(conversations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """[{"question", "count"}] for visitor messages whose reply said the information was missing."""
    counts: Counter = Counter()
    wording: Dict[str, str] = {}
    for convo in conversations:
        last_question = None
        for msg in convo.get("messages", []):
            content = msg.get("content") or ""
            if msg.get("role") == "user":
                last_question = content
            elif msg.get("role") == "assistant" and last_question and is_unanswered_reply(content):
                key = _normalise(last_question)
                # A visitor replying with their phone number is not an unanswered question.
                if key and not has_contact_info(last_question):
                    counts[key] += 1
                    wording.setdefault(key, _clip(last_question))
                last_question = None
    return [{"question": wording[key], "count": n} for key, n in counts.most_common(UNANSWERED_LIMIT)]


# ---------------------------------------------------------------- top questions

def visitor_questions(conversations: List[Dict[str, Any]]) -> List[str]:
    """Visitor messages worth counting: not contact details, not one-word replies."""
    questions = []
    for convo in conversations:
        for msg in convo.get("messages", []):
            if msg.get("role") != "user":
                continue
            text = _clip(msg.get("content") or "")
            if len(_normalise(text)) < 4 or has_contact_info(text):
                continue
            questions.append(text)
    return questions


def fallback_top_questions(questions: List[str]) -> List[Dict[str, Any]]:
    """No LLM: count messages that are identical apart from case and punctuation."""
    counts: Counter = Counter()
    wording: Dict[str, str] = {}
    for q in questions:
        key = _normalise(q)
        counts[key] += 1
        wording.setdefault(key, q)
    return [{"question": wording[key], "count": n} for key, n in counts.most_common(TOP_QUESTIONS_LIMIT)]


def build_grouping_messages(questions: List[str]) -> List[Dict[str, str]]:
    system = (
        "You analyse messages that website visitors sent to a business's chat assistant. "
        "Messages may be in English, Nepali (Devanagari) or Romanized Nepali. "
        "Group messages that ask the same thing, even when worded or spelled differently or in different languages. "
        "Ignore greetings, thanks, and messages that are not questions or requests. "
        f"Return ONLY a JSON array of at most {TOP_QUESTIONS_LIMIT} objects, most frequent first, in the form "
        '[{"question": "<the question, short and clear, in English>", "count": <number of messages in the group>}]. '
        "Count only the messages given; never invent questions."
    )
    listing = "\n".join(f"{i}. {q}" for i, q in enumerate(questions, 1))
    return [{"role": "system", "content": system}, {"role": "user", "content": f"Messages:\n{listing}"}]


def parse_grouping(raw: Any, total_questions: int) -> List[Dict[str, Any]]:
    """Parse the model's reply (tolerates ```json fences and prose). Raises ValueError if unusable."""
    data = raw
    if not isinstance(raw, list):
        match = re.search(r"\[.*\]", str(raw or ""), re.DOTALL)
        if not match:
            raise ValueError("LLM reply contained no JSON array")
        data = json.loads(match.group(0))
    if not isinstance(data, list):
        raise ValueError("LLM reply JSON is not an array")
    groups = []
    for item in data:
        if not isinstance(item, dict):
            continue
        question = _clip(str(item.get("question") or ""))
        try:
            count = int(item.get("count"))
        except (TypeError, ValueError):
            continue
        # A count larger than the number of messages is invented; clamp rather than report it.
        if question and count > 0:
            groups.append({"question": question, "count": min(count, total_questions)})
    if not groups:
        raise ValueError("LLM reply had no usable groups")
    groups.sort(key=lambda g: g["count"], reverse=True)
    return groups[:TOP_QUESTIONS_LIMIT]


async def top_questions(questions: List[str], llm_call: Optional[LLMCall]) -> Tuple[List[Dict[str, Any]], bool]:
    """(groups, grouped_by_llm). At most one LLM call; any failure falls back to exact-match counting."""
    if not questions:
        return [], False
    if llm_call is not None:
        sample = questions[:MAX_QUESTIONS_FOR_LLM]
        try:
            raw = await llm_call(build_grouping_messages(sample))
            return parse_grouping(raw, len(sample)), True
        except Exception as err:
            logger.warning("Monthly report: grouping questions with the LLM failed ({}); using plain counts.",
                           type(err).__name__)
    return fallback_top_questions(questions), False


# ---------------------------------------------------------------- report

@dataclass
class MonthlyReport:
    agent_name: str
    period: str
    conversations: int
    leads: int
    top_questions: List[Dict[str, Any]] = field(default_factory=list)
    questions_grouped: bool = False
    unanswered: List[Dict[str, Any]] = field(default_factory=list)
    html: str = ""
    docx: bytes = b""

    @property
    def label(self) -> str:
        return period_label(self.period)

    @property
    def subject(self) -> str:
        return f"Your website chat report for {self.label} – {self.agent_name}"

    @property
    def docx_filename(self) -> str:
        safe = re.sub(r"[^A-Za-z0-9]+", "_", self.agent_name).strip("_") or "assistant"
        return f"{safe}_{self.period}_conversations.docx"

    def summary(self) -> Dict[str, Any]:
        return {
            "agent_name": self.agent_name,
            "period": self.period,
            "period_label": self.label,
            "conversations": self.conversations,
            "leads": self.leads,
            "top_questions": self.top_questions,
            "questions_grouped": self.questions_grouped,
            "unanswered": self.unanswered,
        }


def _question_rows(items: List[Dict[str, Any]], empty_text: str) -> str:
    if not items:
        return f'<p style="margin:0;color:#9aa0a6;">{escape(empty_text)}</p>'
    rows = "".join(
        f'<tr><td style="padding:8px 12px;color:#202124;border-top:1px solid #eef0f2;">{escape(item["question"])}</td>'
        f'<td style="padding:8px 12px;color:#5f6368;border-top:1px solid #eef0f2;text-align:right;white-space:nowrap;">'
        f'{int(item["count"])}</td></tr>'
        for item in items
    )
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'style="border:1px solid #e0e3e7;border-radius:8px;border-collapse:separate;">'
        '<tr><td style="padding:8px 12px;color:#5f6368;font-size:12px;">Question</td>'
        '<td style="padding:8px 12px;color:#5f6368;font-size:12px;text-align:right;">Times asked</td></tr>'
        f"{rows}</table>"
    )


def build_report_html(report: MonthlyReport) -> str:
    def tile(number: int, label: str) -> str:
        return (
            '<td width="50%" style="padding:6px;">'
            '<div style="border:1px solid #e0e3e7;border-radius:8px;padding:14px 16px;">'
            f'<div style="font-size:26px;font-weight:600;color:#0b7a5c;">{number}</div>'
            f'<div style="color:#5f6368;">{escape(label)}</div></div></td>'
        )

    grouping_note = (
        "Similar questions are grouped together, whichever language they were asked in."
        if report.questions_grouped
        else "Questions are counted exactly as visitors typed them."
    )
    title = f"Website chat report – {report.label}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:{FONT_STACK};font-size:14px;line-height:1.5;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:{FONT_STACK};">
  <tr><td style="background:#0b7a5c;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:600;">{BRAND}</td></tr>
  <tr><td style="padding:24px 24px 8px 24px;">
    <h1 style="margin:0 0 6px 0;font-size:20px;color:#202124;">{escape(title)}</h1>
    <p style="margin:0;color:#5f6368;">Here is what visitors asked {escape(report.agent_name)} on your website in {escape(report.label)}.</p>
  </td></tr>
  <tr><td style="padding:6px 18px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      {tile(report.conversations, "Conversations")}{tile(report.leads, "Leads captured")}
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px 4px 24px;">
    <h2 style="margin:0;font-size:16px;color:#202124;">Most asked questions</h2>
    <p style="margin:2px 0 8px 0;color:#5f6368;font-size:13px;">{escape(grouping_note)}</p>
    {_question_rows(report.top_questions, "No questions were asked this month.")}
  </td></tr>
  <tr><td style="padding:14px 24px 4px 24px;">
    <h2 style="margin:0;font-size:16px;color:#202124;">Questions the assistant could not answer</h2>
    <p style="margin:2px 0 8px 0;color:#5f6368;font-size:13px;">Send us the answers to these and we will add them to your assistant's knowledge base.</p>
    {_question_rows(report.unanswered, "None this month: the assistant had an answer for every question.")}
  </td></tr>
  <tr><td style="padding:14px 24px 22px 24px;color:#5f6368;">The full conversations are attached as a Word document.</td></tr>
  <tr><td style="padding:14px 24px;background:#fafbfc;color:#9aa0a6;font-size:12px;border-top:1px solid #eef0f2;">
    Sent by {BRAND}. Dates and times are in Nepal time. Questions? Call or WhatsApp +977 9841135432 (6 AM to 10 PM) or email spirit.monkeytech@gmail.com.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


async def build_report(
    agent_name: str,
    period: str,
    conversations: List[Dict[str, Any]],
    leads: int,
    llm_call: Optional[LLMCall],
) -> MonthlyReport:
    """conversations: [{"title", "created_at", "messages": [{"role", "content", "created_at"}]}]"""
    from src.services.agents.export import build_conversations_docx

    groups, grouped = await top_questions(visitor_questions(conversations), llm_call)
    report = MonthlyReport(
        agent_name=agent_name,
        period=period,
        conversations=len(conversations),
        leads=leads,
        top_questions=groups,
        questions_grouped=grouped,
        unanswered=find_unanswered(conversations),
    )
    report.html = build_report_html(report)
    report.docx = build_conversations_docx(agent_name, report.label, conversations).getvalue()
    return report


# ---------------------------------------------------------------- database

def _local_iso(ts: datetime) -> str:
    """Nepal-time ISO string, so the Word export shows times the client recognises."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(KATHMANDU_TZ).isoformat()


async def load_report_data(session, agent_id, period: str) -> Tuple[List[Dict[str, Any]], int]:
    """(website conversations that got a reply, leads captured) for the agent in the month."""
    from sqlalchemy import func, select

    from src.models.sql.lead import Lead
    from src.models.sql.models import AgentChat, AgentChatHistory

    start, end = period_bounds(period)
    histories = (
        await session.execute(
            select(AgentChatHistory)
            .where(
                AgentChatHistory.agent_id == agent_id,
                AgentChatHistory.source == SOURCE_AGENT_API,
                AgentChatHistory.created_at >= start,
                AgentChatHistory.created_at < end,
            )
            .order_by(AgentChatHistory.created_at.asc())
        )
    ).scalars().all()

    by_history: Dict[Any, List[Dict[str, Any]]] = {h.id: [] for h in histories}
    if histories:
        messages = (
            await session.execute(
                select(AgentChat)
                .where(AgentChat.history_id.in_(list(by_history)))
                .order_by(AgentChat.created_at.asc())
            )
        ).scalars().all()
        for m in messages:
            by_history[m.history_id].append(
                {"role": m.role, "content": m.content, "created_at": _local_iso(m.created_at)}
            )

    conversations = []
    for h in histories:
        msgs = by_history[h.id]
        # Same rule as the chat count: a conversation counts once the assistant has replied.
        if not any(m["role"] == "assistant" for m in msgs):
            continue
        first_question = next((m["content"] for m in msgs if m["role"] == "user" and m["content"]), "")
        conversations.append(
            {
                "title": _clip(first_question, 70) or "Website conversation",
                "created_at": _local_iso(h.created_at),
                "messages": msgs,
            }
        )

    leads = (
        await session.execute(
            select(func.count()).select_from(Lead).where(
                Lead.agent_id == agent_id, Lead.created_at >= start, Lead.created_at < end
            )
        )
    ).scalar() or 0
    return conversations, int(leads)


async def send_report_email(recipients: List[str], report: MonthlyReport) -> bool:
    """True if sent, False if SMTP is not configured. Raises on a send failure."""
    from src.core.handler.email_handler import SMTPHandler
    from src.services.email_service import EmailService

    handler = SMTPHandler()
    try:
        return await EmailService(handler).send_html_email(
            recipients,
            report.subject,
            report.html,
            from_name=BRAND,
            attachments=[
                (report.docx_filename, report.docx, "vnd.openxmlformats-officedocument.wordprocessingml.document")
            ],
        )
    finally:
        await handler.disconnect_client()
