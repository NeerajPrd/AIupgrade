"""Monthly client report: periods, unanswered detection, question grouping (and its fallback),
the email body, the once-per-month scheduler rule, and the admin endpoints."""
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.api.v1.routers.admin import leads as leads_module
from src.api.v1.routers.admin import reports as reports_module
from src.core.database import get_db
from src.services.reports import monthly, scheduler


def convo(*turns):
    return {
        "title": "t",
        "created_at": "2026-10-05T10:00:00+05:45",
        "messages": [
            {"role": role, "content": content, "created_at": "2026-10-05T10:00:00+05:45"} for role, content in turns
        ],
    }


# ---------------------------------------------------------------- periods

def test_previous_period_handles_january():
    assert monthly.previous_period(date(2026, 11, 1)) == "2026-10"
    assert monthly.previous_period(date(2027, 1, 3)) == "2026-12"


def test_period_bounds_are_kathmandu_midnights():
    start, end = monthly.period_bounds("2026-12")
    assert start.isoformat() == "2026-12-01T00:00:00+05:45"
    assert end.isoformat() == "2027-01-01T00:00:00+05:45"
    assert monthly.period_label("2026-10") == "October 2026"


@pytest.mark.parametrize("bad", ["2026-13", "2026-1", "October", "", "2026-10-01"])
def test_bad_period_rejected(bad):
    with pytest.raises(ValueError):
        monthly.parse_period(bad)


# ---------------------------------------------------------------- unanswered

@pytest.mark.parametrize("reply", [
    "I don't have that information right now, but our team can help.",
    "I do not have information about that.",
    "Sorry, I don't currently have specific details on refunds.",
    "I apologize, but I can only answer questions related to my specific expertise.",
    "माफ गर्नुहोस्, मसँग त्यो जानकारी छैन।",
    "Maile tyo jankari chaina, hamro team lai sodhnu hola.",
    "Malai thaha chhaina.",
])
def test_unanswered_replies_detected(reply):
    assert monthly.is_unanswered_reply(reply)


@pytest.mark.parametrize("reply", [
    "Plans start at NPR 7,500 for 6 months.",
    "Yes! We have information about all three plans.",
    "You don't need any technical knowledge.",
    "हाम्रो कार्यालय सानेपामा छ।",
    "",
])
def test_normal_replies_not_flagged(reply):
    assert not monthly.is_unanswered_reply(reply)


def test_find_unanswered_pairs_reply_with_its_question_and_counts_repeats():
    conversations = [
        convo(("user", "Do you offer refunds?"), ("assistant", "I don't have that information right now."),
              ("user", "ok what is the price"), ("assistant", "NPR 7,500 for 6 months.")),
        convo(("user", "do you offer refunds"), ("assistant", "I do not have that information.")),
        # A phone number followed by an apology is not an unanswered question.
        convo(("user", "my number is 9841234567"), ("assistant", "Thanks! I don't have that information though.")),
    ]
    assert monthly.find_unanswered(conversations) == [{"question": "Do you offer refunds?", "count": 2}]


# ---------------------------------------------------------------- top questions

def test_visitor_questions_skip_contact_details_and_tiny_replies():
    conversations = [convo(("user", "price kati ho?"), ("assistant", "..."), ("user", "ok"),
                           ("user", "call me on 9841234567"), ("user", "a@b.com"))]
    assert monthly.visitor_questions(conversations) == ["price kati ho?"]


async def test_top_questions_uses_one_llm_call():
    calls = []

    async def llm(messages):
        calls.append(messages)
        return '```json\n[{"question": "How much does it cost?", "count": 2}, {"question": "Free trial?", "count": 1}]\n```'

    groups, grouped = await monthly.top_questions(["price?", "fee kati ho?", "trial cha?"], llm)
    assert grouped is True and len(calls) == 1
    assert groups == [{"question": "How much does it cost?", "count": 2}, {"question": "Free trial?", "count": 1}]
    assert "fee kati ho?" in calls[0][1]["content"]


async def test_top_questions_falls_back_when_llm_fails():
    async def llm(messages):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    groups, grouped = await monthly.top_questions(["Price?", "price", "Where are you located?"], llm)
    assert grouped is False
    assert groups[0] == {"question": "Price?", "count": 2}
    assert {"question": "Where are you located?", "count": 1} in groups


async def test_top_questions_falls_back_on_garbage_reply():
    async def llm(messages):
        return "Sure! Here are the questions."

    groups, grouped = await monthly.top_questions(["Price?"], llm)
    assert grouped is False and groups == [{"question": "Price?", "count": 1}]


async def test_no_questions_makes_no_llm_call():
    async def llm(messages):
        raise AssertionError("must not be called")

    assert await monthly.top_questions([], llm) == ([], False)


def test_parse_grouping_never_reports_more_than_was_asked():
    groups = monthly.parse_grouping([{"question": "Price?", "count": 5000}, {"question": "", "count": 3},
                                     {"question": "x", "count": "many"}], total_questions=12)
    assert groups == [{"question": "Price?", "count": 12}]


# ---------------------------------------------------------------- report body

async def test_build_report_counts_and_escapes():
    conversations = [
        convo(("user", "<b>fee</b> कति हो?"), ("assistant", "NPR 7,500 for 6 months.")),
        convo(("user", "Do you do SEO?"), ("assistant", "I don't have that information right now.")),
    ]
    report = await monthly.build_report("Skill Square Assistant", "2026-10", conversations, leads=1, llm_call=None)
    assert report.conversations == 2 and report.leads == 1
    assert report.unanswered == [{"question": "Do you do SEO?", "count": 1}]
    assert "October 2026" in report.html and "Spirit Monkey" in report.html
    assert "&lt;b&gt;fee&lt;/b&gt; कति हो?" in report.html and "<b>fee</b>" not in report.html
    assert "Nirmala UI" in report.html
    assert report.docx[:2] == b"PK"  # a real .docx (zip) attachment
    assert report.docx_filename == "Skill_Square_Assistant_2026-10_conversations.docx"
    assert "Fagoon" not in report.html and "Gemini" not in report.html


# ---------------------------------------------------------------- scheduler

class FakeStore:
    def __init__(self, agents, already=()):
        self.agents, self.rows = agents, {key: "sent" for key in already}
        self.finished = []

    async def due_agents(self):
        return self.agents

    async def claim(self, agent_id, period):
        if (agent_id, period) in self.rows:
            return False
        self.rows[(agent_id, period)] = "sending"
        return True

    async def finish(self, agent_id, period, status, *, error=None, conversations=None, leads=None):
        self.rows[(agent_id, period)] = status
        self.finished.append((agent_id, period, status, error))


def _agent(emails=("owner@client.com",)):
    return SimpleNamespace(id=uuid.uuid4(), name="Bot", user_id=uuid.uuid4(), lead_notify_emails=list(emails))


def _report(conversations=3):
    return monthly.MonthlyReport(agent_name="Bot", period="2026-10", conversations=conversations, leads=1)


@pytest.fixture
def mailbox():
    sent = []

    async def send(recipients, report):
        sent.append((recipients, report.period))
        return True

    return SimpleNamespace(sent=sent, send=send)


async def _generate(agent, period):
    return _report()


async def test_scheduler_sends_last_months_report_once(mailbox):
    agent = _agent()
    store = FakeStore([agent])
    assert await scheduler.run_due_reports(store, _generate, mailbox.send, today=date(2026, 11, 1)) == 1
    assert mailbox.sent == [(["owner@client.com"], "2026-10")]
    assert store.rows[(agent.id, "2026-10")] == "sent"
    # Next hourly check, another worker, or a restart: nothing more goes out.
    assert await scheduler.run_due_reports(store, _generate, mailbox.send, today=date(2026, 11, 2)) == 0
    assert len(mailbox.sent) == 1


async def test_scheduler_does_nothing_after_the_first_week(mailbox):
    store = FakeStore([_agent()])
    assert await scheduler.run_due_reports(store, _generate, mailbox.send, today=date(2026, 11, 11)) == 0
    assert mailbox.sent == [] and store.rows == {}


async def test_scheduler_skips_agents_without_recipients_and_empty_months(mailbox):
    no_email, quiet = _agent(emails=()), _agent()
    store = FakeStore([no_email, quiet])

    async def generate(agent, period):
        return _report(conversations=0)

    assert await scheduler.run_due_reports(store, generate, mailbox.send, today=date(2026, 11, 1)) == 0
    assert mailbox.sent == []
    assert (no_email.id, "2026-10") not in store.rows
    assert store.rows[(quiet.id, "2026-10")] == "skipped"


async def test_scheduler_records_failure_and_carries_on(mailbox):
    broken, fine = _agent(), _agent()
    store = FakeStore([broken, fine])

    async def generate(agent, period):
        if agent is broken:
            raise RuntimeError("database went away")
        return _report()

    assert await scheduler.run_due_reports(store, generate, mailbox.send, today=date(2026, 11, 1)) == 1
    assert store.rows[(broken.id, "2026-10")] == "failed"
    assert store.rows[(fine.id, "2026-10")] == "sent"


# ---------------------------------------------------------------- admin endpoints

class FakeDB:
    def __init__(self, agent, leads=()):
        self.agent, self.leads = agent, list(leads)

    async def get(self, model, key):
        return self.agent if key == self.agent.id else None

    async def execute(self, stmt):
        leads = self.leads
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: leads))


ADMIN = {"X-Test-Role": "admin"}


@pytest.fixture
def api(monkeypatch):
    agent = SimpleNamespace(id=uuid.uuid4(), name="Bot", user_id=uuid.uuid4(), lead_notify_enabled=True,
                            lead_notify_emails=["owner@client.com"], lead_whatsapp_number=None)
    when = datetime(2026, 11, 6, 9, 0, tzinfo=timezone.utc)
    lead = SimpleNamespace(
        id=uuid.uuid4(), agent_id=agent.id, history_id=uuid.uuid4(), name="=cmd|' /C calc'!A0", business_name="सीता ट्रेक्स",
        phone="+9779841234567", email="sita@example.com", interest="trial, pricing", language="Nepali",
        created_at=when, updated_at=when, notified_at=when, notify_status="sent", notify_error=None,
    )
    state = SimpleNamespace(sent=[], recorded=[], smtp=True, generated=[])

    async def fake_generate(postgres_manager, agent_, period):
        state.generated.append(period)
        report = monthly.MonthlyReport(agent_name=agent_.name, period=period, conversations=4, leads=2,
                                       top_questions=[{"question": "Price?", "count": 3}])
        report.html = "<html>report</html>"
        return report

    async def fake_send(recipients, report):
        state.sent.append((recipients, report.period))
        return True

    class FakeStoreForManual:
        def __init__(self, postgres_manager):
            pass

        async def record_manual_send(self, agent_id, period, conversations, leads):
            state.recorded.append((agent_id, period))

    monkeypatch.setattr(reports_module.report_scheduler, "generate_for_agent", fake_generate)
    monkeypatch.setattr(reports_module.report_scheduler, "SqlReportStore", FakeStoreForManual)
    monkeypatch.setattr(reports_module, "send_report_email", fake_send)
    monkeypatch.setattr(reports_module, "today_kathmandu", lambda: date(2026, 11, 11))
    monkeypatch.setattr(type(reports_module.system_setting), "smtp_configured", property(lambda self: state.smtp))

    app = FastAPI()
    app.state.postgres_manager = object()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        role = request.headers.get("X-Test-Role")
        request.state.user = SimpleNamespace(role=role) if role else None
        return await call_next(request)

    app.include_router(leads_module.router, prefix="/api/v1")
    app.include_router(reports_module.router, prefix="/api/v1")

    async def override_db():
        yield FakeDB(agent, [lead])

    app.dependency_overrides[get_db] = override_db
    return SimpleNamespace(client=TestClient(app), agent=agent, state=state,
                           url=f"/api/v1/admin/agents/{agent.id}")


def test_report_endpoints_require_admin(api):
    assert api.client.post(f"{api.url}/monthly-report", json={}).status_code == 401
    assert api.client.post(f"{api.url}/monthly-report", json={}, headers={"X-Test-Role": "user"}).status_code == 403
    assert api.client.get(f"{api.url}/leads/export.csv", headers={"X-Test-Role": "user"}).status_code == 403


def test_preview_defaults_to_last_month_and_sends_nothing(api):
    r = api.client.post(f"{api.url}/monthly-report", json={}, headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["period"] == "2026-10" and body["conversations"] == 4 and body["leads"] == 2
    assert body["sent"] is False and body["html"] == "<html>report</html>"
    assert api.state.sent == [] and api.state.recorded == []


def test_send_emails_the_client_and_records_it(api):
    r = api.client.post(f"{api.url}/monthly-report", json={"month": "2026-09", "send": True}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["sent"] is True
    assert api.state.sent == [(["owner@client.com"], "2026-09")]
    assert api.state.recorded == [(api.agent.id, "2026-09")]


def test_send_refused_without_recipients_or_smtp(api):
    api.state.smtp = False
    r = api.client.post(f"{api.url}/monthly-report", json={"send": True}, headers=ADMIN)
    assert r.status_code == 503
    api.state.smtp, api.agent.lead_notify_emails = True, []
    r = api.client.post(f"{api.url}/monthly-report", json={"send": True}, headers=ADMIN)
    assert r.status_code == 422
    assert api.state.sent == [] and api.state.generated == []


@pytest.mark.parametrize("month", ["2026-12", "2026-13", "last month"])
def test_future_or_malformed_month_rejected(api, month):
    r = api.client.post(f"{api.url}/monthly-report", json={"month": month}, headers=ADMIN)
    assert r.status_code == 422


def test_leads_csv_opens_in_excel_and_is_formula_safe(api):
    r = api.client.get(f"{api.url}/leads/export.csv?date_from=2026-11-01&date_to=2026-11-30", headers=ADMIN)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="leads_2026-11-01_to_2026-11-30.csv"' in r.headers["content-disposition"]
    assert r.content.startswith(b"\xef\xbb\xbf")  # BOM, so Excel reads Nepali text as UTF-8
    text = r.content.decode("utf-8-sig")
    header, row = text.strip().split("\r\n")
    assert header.startswith("Date (Nepal time),Name,Business,Phone,Email")
    assert row.startswith("2026-11-06 14:45,")  # 09:00 UTC in Nepal time
    assert "'=cmd|" in row  # a formula typed by a visitor is neutralised
    assert "\t+9779841234567" in row and "सीता ट्रेक्स" in row
    assert '"trial, pricing"' in row
