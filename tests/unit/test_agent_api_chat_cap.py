"""Tests for the per-agent chat cap and conversation_id checks on the public agent API.

The router runs in a minimal FastAPI app with the DB, limiter, chat service and
orchestrator replaced by fakes, so no database or LLM is needed.
"""
import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.v1.routers.agents import agent_api as agent_api_module
from src.core.database import get_db
from src.models.sql.agent_api import AgentAPI

API_KEY = "agapi_test_key"
SLUG = "nepalland"


class FakeDB:
    def __init__(self, api_record, agent):
        self.api_record, self.agent = api_record, agent

    async def execute(self, stmt):
        record = self.api_record
        return SimpleNamespace(scalar_one_or_none=lambda: record)

    async def get(self, model, key):
        return self.agent

    async def commit(self):
        pass


class FakeLimiter:
    def __init__(self, allow=True):
        self.allow_result = allow

    async def allow(self, key, limit, window_s):
        return self.allow_result


class FakeChatService:
    def __init__(self):
        self.created = []

    async def create_conversation(self, user_id, agent_id, title=None, source=None):
        self.created.append({"agent_id": agent_id, "source": source})
        return str(uuid.uuid4())


class FakeOrchestrator:
    def __init__(self):
        self.calls = []

    async def stream_chat(self, **kwargs):
        self.calls.append(kwargs)
        for token in ("Hello", " there"):
            yield token


@pytest.fixture
def setup(monkeypatch):
    agent = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4(), chat_cap=None, chat_cap_starts_at=None)
    api_record = SimpleNamespace(
        id=uuid.uuid4(),
        agent_id=agent.id,
        is_active=True,
        api_key_hash=AgentAPI.hash_key(API_KEY),
        rate_limit_per_minute=60,
        timeout_seconds=30,
        total_calls=0,
        last_called_at=None,
    )
    state = SimpleNamespace(used=0, count_calls=[], owned_ids=set())

    async def fake_count(db, agent_id, since):
        state.count_calls.append(since)
        return state.used

    async def fake_belongs(db, conversation_id, agent_id):
        return conversation_id in state.owned_ids

    monkeypatch.setattr(agent_api_module, "count_new_conversations", fake_count)
    monkeypatch.setattr(agent_api_module, "conversation_belongs_to_agent", fake_belongs)

    app = FastAPI()
    app.include_router(agent_api_module.router, prefix="/api/v1")
    app.state.limiter = FakeLimiter()
    app.state.agent_chat_service = FakeChatService()
    app.state.chat_orchestrator = FakeOrchestrator()

    async def override_db():
        yield FakeDB(api_record, agent)

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    def post(body):
        return client.post(f"/api/v1/agent-api/{SLUG}/chat", json=body, headers={"X-API-Key": API_KEY})

    return SimpleNamespace(app=app, agent=agent, state=state, post=post)


def test_null_cap_is_unlimited_and_skips_counting(setup):
    setup.state.used = 10_000
    r = setup.post({"message": "hi"})
    assert r.status_code == 200
    assert r.json()["response"] == "Hello there"
    assert setup.state.count_calls == []


def test_new_conversation_is_tagged_agent_api(setup):
    setup.post({"message": "hi"})
    assert setup.app.state.agent_chat_service.created[0]["source"] == "agent_api"


def test_under_cap_allows_new_conversation(setup):
    setup.agent.chat_cap, setup.agent.chat_cap_starts_at = 200, date(2026, 10, 15)
    setup.state.used = 199
    r = setup.post({"message": "hi"})
    assert r.status_code == 200
    assert setup.state.count_calls == [date(2026, 10, 15)]


def test_at_cap_refuses_new_conversation_with_402(setup):
    setup.agent.chat_cap, setup.agent.chat_cap_starts_at = 200, date(2026, 10, 15)
    setup.state.used = 200
    r = setup.post({"message": "hi"})
    assert r.status_code == 402
    assert r.json()["detail"]["code"] == "chat_cap_reached"
    assert setup.app.state.agent_chat_service.created == []
    assert setup.app.state.chat_orchestrator.calls == []


def test_at_cap_follow_up_still_allowed_and_not_recounted(setup):
    setup.agent.chat_cap = 200
    setup.state.used = 500
    conv_id = str(uuid.uuid4())
    setup.state.owned_ids.add(conv_id)
    r = setup.post({"message": "and another thing", "conversation_id": conv_id})
    assert r.status_code == 200
    assert r.json()["conversation_id"] == conv_id
    assert setup.state.count_calls == []  # follow-ups never hit the counter
    assert setup.app.state.agent_chat_service.created == []
    assert setup.app.state.chat_orchestrator.calls[0]["history_id"] == conv_id


def test_unknown_or_foreign_conversation_id_is_404(setup):
    setup.agent.chat_cap = 1
    setup.state.used = 1
    r = setup.post({"message": "hi", "conversation_id": str(uuid.uuid4())})
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "conversation_not_found"
    assert setup.app.state.chat_orchestrator.calls == []


def test_made_up_conversation_id_cannot_bypass_cap(setup):
    setup.agent.chat_cap = 1
    setup.state.used = 1
    r = setup.post({"message": "hi", "conversation_id": "anything"})
    assert r.status_code == 404
    assert setup.app.state.agent_chat_service.created == []


def test_rate_limit_still_429_and_checked_before_cap(setup):
    setup.agent.chat_cap = 1
    setup.state.used = 1
    setup.app.state.limiter.allow_result = False
    r = setup.post({"message": "hi"})
    assert r.status_code == 429
    assert setup.state.count_calls == []


def test_invalid_key_still_401(setup):
    from fastapi.testclient import TestClient as _TC

    r = _TC(setup.app).post(f"/api/v1/agent-api/{SLUG}/chat", json={"message": "hi"}, headers={"X-API-Key": "wrong"})
    assert r.status_code == 401
