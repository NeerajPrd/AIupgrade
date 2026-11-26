"""Website-chat spending limits and anti-spam: cost maths, budget blocking, 80%/100% alerts (once
each per month), visitor limits, message/conversation caps, and what is sent to the model."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.v1.routers.agents import agent_api as agent_api_module
from src.core.database import get_db
from src.models.sql.agent_api import AgentAPI
from src.services.limiter.memory_limiter import MemoryRateLimiter
from src.services.spend import tracker as tracker_module
from src.services.spend import usage as spend_usage
from src.services.spend.tracker import SpendTracker, levels_reached, period_utc
from src.services.spend.usage import Prices, UsageCollector, UsageEntry, cost_nano_usd, usd_to_nano

PRICES = Prices(input_per_1m=0.30, output_per_1m=2.50, embed_per_1m=0.15)


# ---------------------------------------------------------------- cost calculation

def test_cost_counts_thinking_as_output_and_adds_embeddings():
    usage = UsageCollector([
        UsageEntry("generate", "gemini-2.5-flash", prompt_tokens=1_000_000),
        UsageEntry("generate", "gemini-2.5-flash", output_tokens=200_000, thinking_tokens=800_000),
        UsageEntry("embed", "gemini-embedding-2", embed_tokens=1_000_000),
    ])
    # $0.30 input + 1M output-priced tokens at $2.50 + $0.15 embeddings = $2.95
    assert cost_nano_usd(usage, PRICES) == usd_to_nano(2.95)


def test_a_typical_chat_costs_fractions_of_a_cent_and_is_not_rounded_away():
    usage = UsageCollector([UsageEntry("generate", "m", prompt_tokens=1500, output_tokens=150, thinking_tokens=100),
                            UsageEntry("embed", "e", embed_tokens=8)])
    nano = cost_nano_usd(usage, PRICES)
    assert nano == 1500 * 300 + 250 * 2500 + 8 * 150  # 1,076,200 nano-USD = $0.0010762
    assert 0.001 < nano / 1e9 < 0.0011


def test_prices_come_from_settings():
    settings = SimpleNamespace(GEMINI_PRICE_INPUT_PER_1M=1, GEMINI_PRICE_OUTPUT_PER_1M="4", GEMINI_PRICE_EMBED_PER_1M=0.5)
    assert Prices.from_settings(settings) == Prices(1.0, 4.0, 0.5)


def test_embedding_tokens_are_estimated_when_the_api_gives_none():
    assert spend_usage.estimate_embed_tokens("fee kati ho?") == 3
    assert spend_usage.estimate_embed_tokens("तपाईंको सेवा") == 9  # 34 bytes of UTF-8
    assert spend_usage.estimate_embed_tokens("") == 1


def test_alert_levels():
    budget = usd_to_nano(3)
    assert levels_reached(usd_to_nano(2.39), budget) == []
    assert levels_reached(usd_to_nano(2.40), budget) == [80]
    assert levels_reached(usd_to_nano(3.00), budget) == [80, 100]
    assert levels_reached(0, 0) == [80, 100]


# ---------------------------------------------------------------- tracker (store + cache)

class MemoryStore:
    def __init__(self):
        self.rows = {}

    def _row(self, agent_id, period):
        return self.rows.setdefault((agent_id, period), {"cost": 0, "requests": 0, 80: None, 100: None})

    async def get_cost(self, agent_id, period):
        return self.rows.get((agent_id, period), {"cost": 0})["cost"]

    async def add(self, agent_id, period, cost_nano, collector):
        row = self._row(agent_id, period)
        row["cost"] += cost_nano
        row["requests"] += 1
        return row["cost"]

    async def claim_alert(self, agent_id, period, level):
        row = self.rows.get((agent_id, period))
        if row is None or row[level] is not None:
            return False
        row[level] = datetime.now(timezone.utc)
        return True

    async def release_alert(self, agent_id, period, level):
        self.rows[(agent_id, period)][level] = None


class MemoryCache:
    def __init__(self):
        self.data = {}

    async def get(self, key):
        return self.data.get(key)

    async def set(self, key, value, ttl_s=None):
        self.data[key] = value

    async def delete(self, key):
        self.data.pop(key, None)


def _agent(budget=None, **extra):
    fields = dict(id=uuid.uuid4(), user_id=uuid.uuid4(), name="Sample Assistant", monthly_budget_usd=budget,
                  chat_cap=None, chat_cap_starts_at=None, contact_details=None, lead_whatsapp_number=None)
    fields.update(extra)
    return SimpleNamespace(**fields)


@pytest.fixture
def tracker():
    return SpendTracker(store=MemoryStore(), cache=MemoryCache(), default_budget_usd=3.0, alert_email="info@spirit-monkey.com")


async def test_record_updates_database_and_cache(tracker):
    agent = _agent()
    total = await tracker.record(agent, UsageCollector(), 500)
    assert total == 500
    assert tracker.cache.data[tracker_module.cache_key(agent.id, period_utc())] == 500
    assert await tracker.record(agent, UsageCollector(), 250) == 750


async def test_spend_survives_a_cache_restart(tracker):
    agent = _agent()
    await tracker.record(agent, UsageCollector(), 900)
    tracker.cache.data.clear()  # Redis restarted
    assert await tracker.spent_nano(agent.id) == 900  # rebuilt from the database
    assert tracker.cache.data  # and put back into the cache


async def test_budget_uses_agent_value_or_default(tracker):
    assert tracker.budget_nano(_agent()) == usd_to_nano(3)
    assert tracker.budget_nano(_agent(budget=0.001)) == 1_000_000
    agent = _agent(budget=0.001)
    assert not await tracker.is_over_budget(agent)
    await tracker.record(agent, UsageCollector(), 1_000_000)
    assert await tracker.is_over_budget(agent)


@pytest.fixture
def outbox():
    sent = []

    async def send(recipients, subject, html):
        sent.append((recipients, subject, html))
        return True

    return SimpleNamespace(sent=sent, send=send)


async def test_80_and_100_percent_alerts_fire_once_each(tracker, outbox):
    agent = _agent(budget=1.0)
    total = await tracker.record(agent, UsageCollector(), usd_to_nano(0.5))
    assert await tracker.send_alerts(agent, total, outbox.send) is None  # 50%: nothing

    total = await tracker.record(agent, UsageCollector(), usd_to_nano(0.3))  # 80%
    assert await tracker.send_alerts(agent, total, outbox.send) == 80
    assert await tracker.send_alerts(agent, total, outbox.send) is None  # not again
    total = await tracker.record(agent, UsageCollector(), usd_to_nano(0.1))  # 90%
    assert await tracker.send_alerts(agent, total, outbox.send) is None

    total = await tracker.record(agent, UsageCollector(), usd_to_nano(0.2))  # 110%
    assert await tracker.send_alerts(agent, total, outbox.send) == 100
    assert await tracker.send_alerts(agent, total, outbox.send) is None

    assert [s[1] for s in outbox.sent] == [f"Budget 80% used: Sample Assistant ({period_utc()})",
                                           f"Budget used up: Sample Assistant ({period_utc()})"]
    assert all(s[0] == ["info@spirit-monkey.com"] for s in outbox.sent)
    assert "$1.1000 of $1.00 (110.0%)" in outbox.sent[1][2]


async def test_jumping_straight_past_100_sends_one_email(tracker, outbox):
    agent = _agent(budget=0.001)
    total = await tracker.record(agent, UsageCollector(), 2_000_000)
    assert await tracker.send_alerts(agent, total, outbox.send) == 100
    assert len(outbox.sent) == 1
    assert await tracker.send_alerts(agent, total, outbox.send) is None  # 80% was claimed too


async def test_failed_alert_is_retried_next_time(tracker, outbox):
    agent = _agent(budget=1.0)
    total = await tracker.record(agent, UsageCollector(), usd_to_nano(0.85))

    async def broken(recipients, subject, html):
        raise RuntimeError("SMTP down")

    assert await tracker.send_alerts(agent, total, broken) is None
    assert await tracker.send_alerts(agent, total, outbox.send) == 80


async def test_no_alert_address_means_no_email_and_no_claim(outbox):
    tracker = SpendTracker(store=MemoryStore(), cache=None, default_budget_usd=1.0, alert_email="")
    agent = _agent()
    total = await tracker.record(agent, UsageCollector(), usd_to_nano(2))
    assert await tracker.send_alerts(agent, total, outbox.send) is None
    assert outbox.sent == []
    tracker.alert_email = "info@spirit-monkey.com"  # set later: the alert still goes out
    assert await tracker.send_alerts(agent, total, outbox.send) == 100


# ---------------------------------------------------------------- the chat endpoint

API_KEY = "agapi_test_key"
SLUG = "sample-bot"


class FakeDB:
    def __init__(self, api_record, agent):
        self.api_record, self.agent = api_record, agent

    async def execute(self, stmt):
        return SimpleNamespace(scalar_one_or_none=lambda: self.api_record)

    async def get(self, model, key):
        return self.agent

    async def commit(self):
        pass


class FakeChatService:
    def __init__(self):
        self.created, self.messages = [], []

    async def create_conversation(self, user_id, agent_id, title=None, source=None):
        self.created.append(agent_id)
        return str(uuid.uuid4())

    async def add_message(self, history_id, role, content, metadata=None):
        self.messages.append((role, content))


class FakeOrchestrator:
    """Pretends to call Gemini: records token usage the way the Gemini client does."""

    def __init__(self, prompt_tokens=2000, output_tokens=300, thinking_tokens=100):
        self.calls = []
        self.usage = SimpleNamespace(prompt_token_count=prompt_tokens, candidates_token_count=output_tokens,
                                     thoughts_token_count=thinking_tokens)

    async def stream_chat(self, **kwargs):
        self.calls.append(kwargs)
        spend_usage.record_generate("gemini-2.5-flash", self.usage)
        spend_usage.record_embed("gemini-embedding-2", kwargs["message"])
        yield "AI answer"


@pytest.fixture
def chat(monkeypatch, tracker):
    agent = _agent(budget=None, lead_whatsapp_number="+9779800000000", hide_branding=False)
    api_record = SimpleNamespace(id=uuid.uuid4(), agent_id=agent.id, is_active=True, api_key_hash=AgentAPI.hash_key(API_KEY),
                                 rate_limit_per_minute=1000, timeout_seconds=30, total_calls=0, last_called_at=None)
    state = SimpleNamespace(user_messages=0, leads=[], alerts=[])

    async def fake_user_messages(db, conversation_id):
        return state.user_messages

    async def fake_belongs(db, conversation_id, agent_id):
        return True

    async def fake_lead(postgres_manager, agent_id, history_id, message):
        state.leads.append(message)

    async def fake_alerts(tracker_, agent_, spent):
        state.alerts.append(await tracker_.send_alerts(agent_, spent, lambda *a: _ok()))

    async def _ok():
        return True

    monkeypatch.setattr(agent_api_module, "count_user_messages", fake_user_messages)
    monkeypatch.setattr(agent_api_module, "conversation_belongs_to_agent", fake_belongs)
    monkeypatch.setattr(agent_api_module, "process_lead_in_background", fake_lead)
    monkeypatch.setattr(agent_api_module, "send_alerts_in_background", fake_alerts)
    monkeypatch.setattr(agent_api_module.Prices, "from_settings", classmethod(lambda cls, settings=None: PRICES))

    app = FastAPI()
    app.include_router(agent_api_module.router, prefix="/api/v1")
    app.state.limiter = MemoryRateLimiter()
    app.state.agent_chat_service = FakeChatService()
    app.state.chat_orchestrator = FakeOrchestrator()
    app.state.spend_tracker = tracker
    app.state.postgres_manager = object()

    async def override_db():
        yield FakeDB(api_record, agent)

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    def post(message="How much is the Growth plan?", session="s1", ip=None, conversation_id=None):
        body = {"message": message, "session_id": session}
        if conversation_id:
            body["conversation_id"] = conversation_id
        headers = {"X-API-Key": API_KEY}
        if ip:
            headers["X-Forwarded-For"] = ip
        return client.post(f"/api/v1/agent-api/{SLUG}/chat", json=body, headers=headers)

    return SimpleNamespace(app=app, agent=agent, state=state, post=post, tracker=tracker,
                           orch=app.state.chat_orchestrator, chats=app.state.agent_chat_service)


def test_chat_cost_is_recorded(chat):
    r = chat.post()
    assert r.status_code == 200 and r.json()["response"] == "AI answer"
    row = chat.tracker.store.rows[(chat.agent.id, period_utc())]
    # 2000 input + 400 output-priced tokens + estimated embedding of the 28-byte message (7 tokens)
    assert row["cost"] == 2000 * 300 + 400 * 2500 + 7 * 150
    assert row["requests"] == 1


def test_model_gets_the_reply_and_history_caps(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "MAX_OUTPUT_TOKENS", 800)
    monkeypatch.setattr(agent_api_module.system_setting, "THINKING_BUDGET_TOKENS", 200)
    monkeypatch.setattr(agent_api_module.system_setting, "MAX_HISTORY_MESSAGES", 10)
    chat.post()
    call = chat.orch.calls[0]
    assert (call["max_output_tokens"], call["thinking_budget"], call["max_history_messages"]) == (800, 200, 10)
    assert call["knowledge_base_only"] is True


def test_over_budget_agent_gets_the_friendly_message_and_no_ai_call(chat):
    chat.agent.monthly_budget_usd = 0.001
    chat.agent.contact_details = "Call 01-5555555 or email hello@example.com"
    first = chat.post()  # under budget: one AI call, which costs about $0.0016
    assert first.json()["response"] == "AI answer"
    assert chat.state.alerts == [100]  # crossed 100%: one alert

    blocked = chat.post("Do you have a free trial?")
    body = blocked.json()
    assert blocked.status_code == 200
    assert body["response"] == ("Our assistant is unavailable right now. Please contact us directly.\n\n"
                                "Call 01-5555555 or email hello@example.com")
    assert body["notice"] == "budget_exhausted"
    assert len(chat.orch.calls) == 1  # Gemini was not called again
    assert body["handoff"] == {"whatsapp": "9779800000000"}  # the WhatsApp button still shows
    assert chat.chats.messages[-2:] == [("user", "Do you have a free trial?"), ("assistant", body["response"])]
    assert chat.state.alerts[-1] is None  # the 100% alert is not sent twice


def test_blocked_message_falls_back_to_whatsapp_or_nothing(chat):
    chat.agent.monthly_budget_usd = 0
    assert chat.post().json()["response"].endswith("\n\nWhatsApp: +9779800000000")
    chat.agent.lead_whatsapp_number = None
    assert chat.post().json()["response"] == "Our assistant is unavailable right now. Please contact us directly."


def test_lead_capture_still_works_when_blocked(chat):
    chat.agent.monthly_budget_usd = 0
    chat.post("mero naam Sita ho, number 9841234567")
    chat.post("What are your hours?")
    assert chat.state.leads == ["mero naam Sita ho, number 9841234567"]
    assert chat.orch.calls == []


def test_visitor_limit_per_minute(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "VISITOR_MESSAGES_PER_MINUTE", 10)
    codes = [chat.post(session="spammer", ip="203.0.113.7").status_code for _ in range(11)]
    assert codes == [200] * 10 + [429]
    r = chat.post(session="spammer", ip="203.0.113.7")
    assert r.json()["detail"]["code"] == "visitor_rate_limited" and r.headers["Retry-After"] == "60"
    assert chat.post(session="someone-else", ip="203.0.113.7").status_code == 200  # another visitor
    assert chat.post(session="spammer", ip="198.51.100.9").status_code == 200  # another IP


def test_visitor_limit_per_day(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "VISITOR_MESSAGES_PER_MINUTE", 100)
    monkeypatch.setattr(agent_api_module.system_setting, "VISITOR_MESSAGES_PER_DAY", 3)
    codes = [chat.post(session="v1").status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]
    assert chat.post(session="v1").json()["detail"]["code"] == "visitor_daily_limit"


def test_visitor_ip_is_the_proxy_appended_one(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "VISITOR_MESSAGES_PER_MINUTE", 2)
    # A visitor can put anything in front of X-Forwarded-For; only the right-most (Caddy's) counts.
    assert chat.post(session="x", ip="1.1.1.1, 203.0.113.7").status_code == 200
    assert chat.post(session="x", ip="2.2.2.2, 203.0.113.7").status_code == 200
    assert chat.post(session="x", ip="3.3.3.3, 203.0.113.7").status_code == 429


def test_long_messages_are_rejected_without_an_ai_call(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "MAX_USER_MESSAGE_CHARS", 1000)
    assert chat.post("x" * 1000).status_code == 200
    r = chat.post("x" * 1001)
    assert r.status_code == 413 and r.json()["detail"]["code"] == "message_too_long"
    assert len(chat.orch.calls) == 1


def test_conversation_message_limit(chat, monkeypatch):
    monkeypatch.setattr(agent_api_module.system_setting, "MAX_MESSAGES_PER_CONVERSATION", 30)
    chat.state.user_messages = 29
    assert chat.post(conversation_id=str(uuid.uuid4())).json()["response"] == "AI answer"
    chat.state.user_messages = 30
    r = chat.post("one more question", conversation_id=str(uuid.uuid4())).json()
    assert r["notice"] == "conversation_limit" and "leave your phone number or email" in r["response"]
    r = chat.post("ok call me on 9841234567", conversation_id=str(uuid.uuid4())).json()
    assert r["response"] == "Thank you! Our team will contact you soon."
    assert len(chat.orch.calls) == 1
    assert chat.state.leads == ["ok call me on 9841234567"]


def test_no_tracker_means_no_budget_checks(chat):
    chat.app.state.spend_tracker = None  # e.g. tests or tools that build the app without it
    assert chat.post().json()["response"] == "AI answer"


# ---------------------------------------------------------------- history and reply caps in the orchestrator

async def test_orchestrator_sends_only_recent_history_and_caps_the_reply(monkeypatch):
    from src.services.agents import chat_orchestrator as orch_module
    from src.services.agents.chat_orchestrator import ChatOrchestrator

    history = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"m{i}"} for i in range(15)]
    seen = {}

    class Chats:
        async def get_history(self, history_id):
            return history

        async def add_message(self, *a, **k):
            pass

    class Agents:
        async def get_agent(self, agent_id):
            return {"name": "x", "instructions": "Be helpful.", "config": {}}

    async def fake_generate(messages, llm_config):
        seen["messages"], seen["config"] = messages, llm_config
        yield "ok"

    async def no_embeddings(**kwargs):
        raise RuntimeError("no embeddings in unit tests")

    async def analyzer(*a, **k):
        return ["rag"]

    import src.services.embeddings as embeddings
    monkeypatch.setattr(embeddings, "get_embedding_service", no_embeddings)
    monkeypatch.setattr(orch_module, "generate_general_response_with_retry", fake_generate)
    monkeypatch.setattr(orch_module, "analyze_and_select_tools", analyzer)
    orch = ChatOrchestrator(agent_manager=Agents(), vector_store=SimpleNamespace(postgres_manager=None), chat_service=Chats())

    async def build(agent_id, agent, user_id):
        from src.schemas.llm import BaseLLMConfig
        return SimpleNamespace(config=BaseLLMConfig(provider="gemini", model="gemini-2.5-flash")), "gemini-2.5-flash"

    monkeypatch.setattr(orch, "_build_llm_service_for_agent", build)
    async for _ in orch.stream_chat(user_id=str(uuid.uuid4()), agent_id=str(uuid.uuid4()), history_id=str(uuid.uuid4()),
                                    message="m14", knowledge_base_only=True, max_history_messages=10,
                                    max_output_tokens=800, thinking_budget=200):
        pass
    sent = [m["content"] for m in seen["messages"][1:]]  # after the system prompt
    assert sent[0] == "m6" and sent[-1] == "m14" and len(sent) == 9  # last 10, trimmed to start with the visitor
    assert seen["messages"][1]["role"] == "user"
    assert (seen["config"].max_tokens, seen["config"].thinking_budget) == (800, 200)
