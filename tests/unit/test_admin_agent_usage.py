"""Tests for the admin-only usage and chat cap endpoints."""
import uuid
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.api.v1.routers.admin import agent_usage as admin_module
from src.core.database import get_db


class FakeDB:
    def __init__(self, agent):
        self.agent, self.committed = agent, False

    async def get(self, model, key):
        return self.agent if self.agent and key == self.agent.id else None

    async def commit(self):
        self.committed = True


@pytest.fixture
def setup(monkeypatch):
    agent = SimpleNamespace(id=uuid.uuid4(), name="Nepalland", chat_cap=None, chat_cap_starts_at=None)
    db = FakeDB(agent)

    async def fake_summary(db_, a):
        return {"agent_id": str(a.id), "chat_cap": a.chat_cap,
                "chat_cap_starts_at": a.chat_cap_starts_at.isoformat() if a.chat_cap_starts_at else None}

    monkeypatch.setattr(admin_module, "usage_summary", fake_summary)
    monkeypatch.setattr(admin_module, "today_kathmandu", lambda: date(2026, 10, 8))

    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        role = request.headers.get("X-Test-Role")
        request.state.user = SimpleNamespace(role=role) if role else None
        return await call_next(request)

    app.include_router(admin_module.router, prefix="/api/v1")

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    return SimpleNamespace(client=TestClient(app), agent=agent, db=db)


def _usage_url(agent_id):
    return f"/api/v1/admin/agents/{agent_id}/conversation-usage"


def _cap_url(agent_id):
    return f"/api/v1/admin/agents/{agent_id}/chat-cap"


def test_requires_login(setup):
    assert setup.client.get(_usage_url(setup.agent.id)).status_code == 401


def test_non_admin_forbidden(setup):
    r = setup.client.get(_usage_url(setup.agent.id), headers={"X-Test-Role": "user"})
    assert r.status_code == 403
    r = setup.client.patch(_cap_url(setup.agent.id), json={"chat_cap": 5}, headers={"X-Test-Role": "user"})
    assert r.status_code == 403
    assert setup.agent.chat_cap is None


def test_admin_gets_usage(setup):
    r = setup.client.get(_usage_url(setup.agent.id), headers={"X-Test-Role": "admin"})
    assert r.status_code == 200
    assert r.json()["agent_id"] == str(setup.agent.id)


def test_unknown_agent_404(setup):
    r = setup.client.get(_usage_url(uuid.uuid4()), headers={"X-Test-Role": "admin"})
    assert r.status_code == 404


def test_set_cap_with_start_date(setup):
    r = setup.client.patch(
        _cap_url(setup.agent.id),
        json={"chat_cap": 200, "chat_cap_starts_at": "2026-10-15"},
        headers={"X-Test-Role": "admin"},
    )
    assert r.status_code == 200
    assert setup.agent.chat_cap == 200
    assert setup.agent.chat_cap_starts_at == date(2026, 10, 15)
    assert setup.db.committed


def test_set_cap_without_start_defaults_to_today_kathmandu(setup):
    setup.client.patch(_cap_url(setup.agent.id), json={"chat_cap": 200}, headers={"X-Test-Role": "admin"})
    assert setup.agent.chat_cap_starts_at == date(2026, 10, 8)


def test_null_cap_clears_limit_and_omitted_fields_untouched(setup):
    setup.agent.chat_cap, setup.agent.chat_cap_starts_at = 200, date(2026, 10, 15)
    setup.client.patch(_cap_url(setup.agent.id), json={"chat_cap": None}, headers={"X-Test-Role": "admin"})
    assert setup.agent.chat_cap is None
    assert setup.agent.chat_cap_starts_at == date(2026, 10, 15)


def test_negative_cap_rejected(setup):
    r = setup.client.patch(_cap_url(setup.agent.id), json={"chat_cap": -1}, headers={"X-Test-Role": "admin"})
    assert r.status_code == 422
    assert setup.agent.chat_cap is None


def test_admin_route_is_not_public_agent_api_path():
    # The auth middleware treats any path containing "/agent-api/" as public.
    from src.api.custom_middleware import AuthMiddleware

    mw = AuthMiddleware.__new__(AuthMiddleware)
    assert mw._is_public_path("/api/v1/admin/agent-usage") is False
    assert mw._is_public_path(f"/api/v1/admin/agents/{uuid.uuid4()}/chat-cap") is False
