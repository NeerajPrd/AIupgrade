"""Lead capture: regex gate, LLM extraction parsing, upsert/merge, notification rules, LLM fallback.

Runs without a database: an in-memory LeadStore mirrors SqlLeadStore (same plan_upsert logic).
"""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from src.services.leads import service as svc
from src.services.leads.detection import (
    find_emails,
    find_phones,
    guess_language,
    has_contact_info,
)
from src.services.leads.email_template import (
    FONT_STACK,
    build_html,
    build_subject,
    format_kathmandu,
)
from src.services.leads.extraction import build_extraction_messages, parse_extraction


# --------------------------------------------------------------------------- #
# regex detection
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "text",
    [
        "9841234567",
        "my number is 984-123-4567",
        "984 123 4567",
        "+977 9841234567",
        "+977-9841234567",
        "977 9841234567",
        "00977 9841234567",
        "+977-98-41234567",
        "call me on 9841234567.",
        "मेरो नम्बर ९८४१२३४५६७ हो",
    ],
)
def test_nepali_mobile_formats_normalised(text):
    assert find_phones(text) == ["+9779841234567"]


def test_ntc_ncell_and_other_mobile_prefixes():
    assert find_phones("9801234567 / 9741234567") == ["+9779801234567", "+9779741234567"]


@pytest.mark.parametrize(
    "text, expected",
    [
        ("office: 01-4123456", "014123456"),
        ("01 4123456", "014123456"),
        ("(01) 4123456", "014123456"),
        ("Pokhara 061-523456", "061523456"),
        ("+977-1-4123456", "014123456"),
        ("+977 61 523456", "061523456"),
        ("+977-01-4123456", "014123456"),
    ],
)
def test_landline_formats(text, expected):
    assert find_phones(text) == [expected]


@pytest.mark.parametrize(
    "text",
    [
        "How much is it? NPR 7,500 per month?",
        "Rs. 15000 is too much",
        "Price 98000 for a year",
        "total 1,25,000",
        "We started in 2026",
        "2026-11-06",
        "2082-07-20 BS",
        "01/11/2026",
        "meet at 10:30",
        "order 12345678901",
        "961234567",          # too short
        "98412345678",        # too long
        "9612345678",         # not a 97/98 mobile
        "plan for 50 users, 2 branches",
    ],
)
def test_no_false_positive_phones(text):
    assert find_phones(text) == []
    assert has_contact_info(text) is False


def test_emails_found_and_lowercased():
    text = "Mail Ram.Sharma+biz@Example.com.np or info@shop.com."
    assert find_emails(text) == ["ram.sharma+biz@example.com.np", "info@shop.com"]
    assert has_contact_info("reach me at a@b.co") is True


def test_not_an_email():
    assert find_emails("follow @spiritmonkey on insta, or name@localhost") == []


def test_mixed_message_finds_both():
    text = "I'm Hari from Everest Traders, 9851234567, hari@everest.com"
    assert find_phones(text) == ["+9779851234567"]
    assert find_emails(text) == ["hari@everest.com"]


def test_guess_language():
    assert guess_language(["नमस्ते"]) == "Nepali"
    assert guess_language(["hello", "price?"]) == "English"


# --------------------------------------------------------------------------- #
# LLM reply parsing
# --------------------------------------------------------------------------- #
def test_parse_extraction_handles_fences_and_nulls():
    raw = '```json\n{"name": "Sita", "business_name": null, "phone": "9841234567", "email": "", ' \
          '"interest": "Wants a chatbot trial", "language": "Nepali"}\n```'
    out = parse_extraction(raw)
    assert out == {
        "name": "Sita", "business_name": None, "phone": "9841234567", "email": None,
        "interest": "Wants a chatbot trial", "language": "Nepali",
    }


def test_parse_extraction_rejects_non_json():
    with pytest.raises(ValueError):
        parse_extraction("Sorry, I can't help with that.")


def test_extraction_prompt_labels_speakers():
    msgs = build_extraction_messages([{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}])
    assert msgs[0]["role"] == "system"
    assert "VISITOR: hi" in msgs[1]["content"] and "ASSISTANT: hello" in msgs[1]["content"]


# --------------------------------------------------------------------------- #
# merge / upsert
# --------------------------------------------------------------------------- #
def _fields(**kw):
    base = {k: None for k in ("name", "business_name", "phone", "email", "interest", "language")}
    base.update(kw)
    return base


def test_new_lead_reports_given_contact_fields():
    merged, changed = svc.plan_upsert(None, _fields(name="Sita", phone="+9779841234567", interest="trial"))
    assert merged["name"] == "Sita"
    assert changed == ["name", "phone"]


def test_merge_keeps_existing_values_when_new_extraction_is_vaguer():
    existing = _fields(name="Sita", phone="+9779841234567", interest="trial")
    merged, changed = svc.plan_upsert(existing, _fields(phone="+9779841234567"))
    assert merged["name"] == "Sita" and merged["interest"] == "trial"
    assert changed == []


def test_merge_ignores_phone_formatting_differences():
    existing = _fields(phone="+9779841234567")
    _, changed = svc.plan_upsert(existing, _fields(phone="+977-9841234567"))
    assert changed == []


def test_merge_accumulates_second_phone_and_new_email():
    existing = _fields(phone="+9779841234567")
    merged, changed = svc.plan_upsert(existing, _fields(phone="+9779801111111", email="a@b.com"))
    assert merged["phone"] == "+9779841234567, +9779801111111"
    assert merged["email"] == "a@b.com"
    assert changed == ["phone", "email"]


def test_interest_change_alone_is_not_a_contact_change():
    existing = _fields(phone="+9779841234567", interest="pricing")
    merged, changed = svc.plan_upsert(existing, _fields(interest="wants a demo"))
    assert merged["interest"] == "wants a demo"
    assert changed == []


# --------------------------------------------------------------------------- #
# process_lead with an in-memory store
# --------------------------------------------------------------------------- #
class MemoryStore:
    def __init__(self, agent, transcript=None):
        self.agent = agent
        self.transcript = transcript or []
        self.leads = {}  # history_id -> lead namespace
        self.notifications = []

    async def get_agent(self, agent_id):
        return self.agent if agent_id == self.agent.id else None

    async def load_transcript(self, history_id):
        return list(self.transcript)

    async def upsert(self, agent_id, history_id, incoming):
        lead = self.leads.get(history_id)
        now = datetime.now(timezone.utc)
        if lead is None:
            merged, changed = svc.plan_upsert(None, incoming)
            lead = SimpleNamespace(id=uuid.uuid4(), agent_id=agent_id, history_id=history_id, created_at=now,
                                   updated_at=now, notified_at=None, notify_status=None, notify_error=None, **merged)
            self.leads[history_id] = lead
            return lead, True, changed
        merged, changed = svc.plan_upsert(svc.lead_to_dict(lead), incoming)
        for k, v in merged.items():
            setattr(lead, k, v)
        return lead, False, changed

    async def record_notification(self, lead_id, status, error):
        lead = next(l for l in self.leads.values() if l.id == lead_id)
        lead.notify_status, lead.notify_error, lead.notified_at = status, error, datetime.now(timezone.utc)
        self.notifications.append((status, error))


class Mailer:
    def __init__(self, result=True, error=None):
        self.sent, self.result, self.error = [], result, error

    async def __call__(self, to, subject, html, reply_to):
        if self.error:
            raise self.error
        self.sent.append(SimpleNamespace(to=to, subject=subject, html=html, reply_to=reply_to))
        return self.result


def _llm_returning(payload):
    calls = []

    async def call(messages):
        calls.append(messages)
        return payload

    call.calls = calls
    return call


async def _rate_limited(messages):
    raise RuntimeError("Error code: 429 - RESOURCE_EXHAUSTED: quota exceeded, retry in 30s")


@pytest.fixture
def agent():
    return SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Spirit Monkey Assistant",
                           lead_notify_enabled=True, lead_notify_emails=["owner@client.com"])


async def _run(store, agent, history_id, message, llm, mailer):
    store.transcript.append({"role": "user", "content": message, "created_at": datetime.now(timezone.utc)})
    return await svc.process_lead(store, agent_id=agent.id, history_id=history_id, message=message,
                                  llm_call=llm, send_email=mailer)


async def test_message_without_contact_does_nothing(agent):
    store, mailer, llm = MemoryStore(agent), Mailer(), _llm_returning("{}")
    result = await _run(store, agent, uuid.uuid4(), "How much is it? NPR 7,500?", llm, mailer)
    assert result.lead_id is None
    assert llm.calls == [] and store.leads == {} and mailer.sent == []


async def test_new_lead_is_created_and_emailed_once(agent):
    store, mailer = MemoryStore(agent), Mailer()
    llm = _llm_returning('{"name": "Sita Sharma", "business_name": "Himalayan Treks", "phone": "9841234567", '
                         '"email": null, "interest": "Free trial", "language": "Nepali"}')
    hid = uuid.uuid4()
    result = await _run(store, agent, hid, "म सीता, मेरो नम्बर 9841234567", llm, mailer)

    assert result.created and not result.used_fallback
    assert len(llm.calls) == 1
    lead = store.leads[hid]
    assert (lead.name, lead.business_name, lead.phone) == ("Sita Sharma", "Himalayan Treks", "9841234567")
    assert lead.notify_status == "sent"
    assert len(mailer.sent) == 1
    mail = mailer.sent[0]
    assert mail.to == ["owner@client.com"]
    assert mail.subject == "New lead from your website chat – Sita Sharma"
    assert "Spirit Monkey" in mail.html and "Fagoon" not in mail.html
    assert "मेरो नम्बर" in mail.html  # transcript included, Nepali intact
    assert "Nirmala UI" in mail.html


async def test_same_unchanged_lead_is_never_emailed_twice(agent):
    store, mailer = MemoryStore(agent), Mailer()
    llm = _llm_returning('{"name": "Sita", "phone": "9841234567"}')
    hid = uuid.uuid4()
    await _run(store, agent, hid, "9841234567", llm, mailer)
    await _run(store, agent, hid, "again: 984-123-4567", llm, mailer)
    await _run(store, agent, hid, "+977 9841234567 please call", llm, mailer)
    assert len(store.leads) == 1
    assert len(mailer.sent) == 1


async def test_new_contact_details_send_one_update_email(agent):
    store, mailer = MemoryStore(agent), Mailer()
    hid = uuid.uuid4()
    await _run(store, agent, hid, "9841234567", _llm_returning('{"name": "Sita", "phone": "9841234567"}'), mailer)
    later = _llm_returning('{"name": "Sita", "phone": "9841234567", "email": "sita@treks.com"}')
    result = await _run(store, agent, hid, "email: sita@treks.com", later, mailer)
    await _run(store, agent, hid, "sita@treks.com once more", later, mailer)

    assert result.changed_fields == ["email"]
    assert len(mailer.sent) == 2
    assert mailer.sent[1].subject == "Lead updated from your website chat – Sita"
    assert mailer.sent[1].reply_to == "sita@treks.com"


async def test_llm_failure_falls_back_to_regex(agent):
    store, mailer = MemoryStore(agent), Mailer()
    hid = uuid.uuid4()
    result = await _run(store, agent, hid, "contact 9851234567 or hari@everest.com", _rate_limited, mailer)
    assert result.used_fallback
    lead = store.leads[hid]
    assert lead.phone == "+9779851234567"
    assert lead.email == "hari@everest.com"
    assert lead.language == "English"
    assert mailer.sent[0].subject == "New lead from your website chat – +9779851234567"


async def test_bad_llm_json_falls_back_too(agent):
    store, mailer = MemoryStore(agent), Mailer()
    hid = uuid.uuid4()
    result = await _run(store, agent, hid, "९८४१२३४५६७ मा फोन गर्नुहोस्", _llm_returning("no json here"), mailer)
    assert result.used_fallback
    assert store.leads[hid].phone == "+9779841234567"
    assert store.leads[hid].language == "Nepali"


async def test_regex_contact_kept_when_llm_omits_it(agent):
    store, mailer = MemoryStore(agent), Mailer()
    hid = uuid.uuid4()
    await _run(store, agent, hid, "I'm Ram, 9841234567", _llm_returning('{"name": "Ram", "phone": null}'), mailer)
    assert store.leads[hid].phone == "+9779841234567"


async def test_notifications_disabled_stores_lead_without_email(agent):
    agent.lead_notify_enabled = False
    store, mailer = MemoryStore(agent), Mailer()
    hid = uuid.uuid4()
    await _run(store, agent, hid, "9841234567", _llm_returning('{"phone": "9841234567"}'), mailer)
    assert hid in store.leads
    assert store.leads[hid].notify_status is None
    assert mailer.sent == []


async def test_send_failure_is_recorded(agent):
    store, mailer = MemoryStore(agent), Mailer(error=ConnectionError("smtp down"))
    hid = uuid.uuid4()
    result = await _run(store, agent, hid, "9841234567", _llm_returning('{"phone": "9841234567"}'), mailer)
    assert result.notify_status == "failed"
    assert store.leads[hid].notify_status == "failed"
    assert "smtp down" in store.leads[hid].notify_error


async def test_unconfigured_smtp_recorded_as_skipped(agent):
    store, mailer = MemoryStore(agent), Mailer(result=False)
    hid = uuid.uuid4()
    await _run(store, agent, hid, "9841234567", _llm_returning('{"phone": "9841234567"}'), mailer)
    assert store.leads[hid].notify_status == "skipped"


async def test_lead_not_yet_delivered_is_presented_as_new(agent):
    store, failing = MemoryStore(agent), Mailer(error=ConnectionError("down"))
    hid = uuid.uuid4()
    await _run(store, agent, hid, "9841234567", _llm_returning('{"phone": "9841234567"}'), failing)
    ok = Mailer()
    await _run(store, agent, hid, "x@y.com", _llm_returning('{"phone": "9841234567", "email": "x@y.com"}'), ok)
    assert ok.sent[0].subject.startswith("New lead from your website chat")


async def test_background_entry_point_never_raises():
    class Broken:
        def get_session(self):
            raise RuntimeError("db down")

    await svc.process_lead_in_background(Broken(), str(uuid.uuid4()), str(uuid.uuid4()), "9841234567")


async def test_no_pii_in_info_logs(agent):
    from loguru import logger

    lines = []
    sink = logger.add(lambda m: lines.append(m), level="INFO")
    try:
        store, mailer = MemoryStore(agent), Mailer()
        llm = _llm_returning('{"name": "Sita Sharma", "phone": "9841234567", "email": "sita@treks.com"}')
        await _run(store, agent, uuid.uuid4(), "9841234567 sita@treks.com", llm, mailer)
    finally:
        logger.remove(sink)
    text = "".join(lines)
    assert lines
    assert "9841234567" not in text and "sita@treks.com" not in text and "Sita Sharma" not in text


# --------------------------------------------------------------------------- #
# email template
# --------------------------------------------------------------------------- #
def test_template_escapes_html_and_uses_kathmandu_time():
    ts = datetime(2026, 11, 6, 9, 0, tzinfo=timezone.utc)  # 14:45 in Kathmandu
    html = build_html(_fields(name="<b>x</b>"), [{"role": "user", "content": "<script>alert(1)</script>"}],
                      agent_name="Bot", captured_at=ts, updated=False)
    assert "<script>alert" not in html and "&lt;script&gt;" in html
    assert "&lt;b&gt;x&lt;/b&gt;" in html
    assert format_kathmandu(ts) == "6 Nov 2026, 2:45 PM (Nepal time)"
    assert 'charset="utf-8"' in html
    assert "Nirmala UI" in FONT_STACK


def test_subject_falls_back_to_phone_then_email():
    assert build_subject(_fields(phone="+9779841234567"), updated=False).endswith("– +9779841234567")
    assert build_subject(_fields(email="a@b.com"), updated=True) == "Lead updated from your website chat – a@b.com"


# --------------------------------------------------------------------------- #
# optional: real Postgres (SqlLeadStore upsert, unique history_id, row lock)
# --------------------------------------------------------------------------- #
async def test_sql_store_against_live_postgres():
    import os

    url = os.environ.get("FAGOON_TEST_PG_URL")
    if not url:
        pytest.skip("set FAGOON_TEST_PG_URL to a migrated, disposable Postgres to run")

    from src.core.database.postgres import PostgresManager
    from src.models.sql.models import Agent, AgentChat, AgentChatHistory, User

    manager = PostgresManager(url)
    user_id, agent_id, history_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    try:
        async with manager.get_session() as s:
            s.add(User(id=user_id, name="t", email=f"{user_id}@test.local", password_hash="x"))
            s.add(Agent(id=agent_id, user_id=user_id, name="t", lead_notify_enabled=True,
                        lead_notify_emails=["owner@client.com"]))
            await s.flush()
            s.add(AgentChatHistory(id=history_id, agent_id=agent_id, user_id=user_id, source="agent_api"))
            await s.flush()
            s.add(AgentChat(id=uuid.uuid4(), history_id=history_id, role="user", content="9841234567"))
            await s.commit()

        mailer = Mailer()
        for message, llm in [
            ("9841234567", _llm_returning('{"name": "Sita", "phone": "9841234567"}')),
            ("9841234567", _llm_returning('{"name": "Sita", "phone": "9841234567"}')),
            ("sita@treks.com", _rate_limited),
        ]:
            async with manager.get_session() as s:
                await svc.process_lead(svc.SqlLeadStore(s), agent_id=agent_id, history_id=history_id,
                                       message=message, llm_call=llm, send_email=mailer)

        assert [m.subject.split(" –")[0] for m in mailer.sent] == [
            "New lead from your website chat", "Lead updated from your website chat"]
        from sqlalchemy import select

        from src.models.sql.lead import Lead
        async with manager.get_session() as s:
            leads = (await s.execute(select(Lead).where(Lead.history_id == history_id))).scalars().all()
            assert len(leads) == 1
            assert leads[0].email == "sita@treks.com" and leads[0].notify_status == "sent"
    finally:
        async with manager.get_session() as s:
            await s.delete(await s.get(User, user_id))
            await s.commit()
        await manager.close()
