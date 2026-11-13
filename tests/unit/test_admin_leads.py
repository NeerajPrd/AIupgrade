"""Tests for the admin-only lead settings and lead list endpoints."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.api.v1.routers.admin import leads as leads_module
from src.core.database import get_db


class FakeDB:
    def __init__(self, agent, leads=()):
        self.agent, self.leads, self.committed, self.statements = agent, list(leads), False, []

    async def get(self, model, key):
        return self.agent if self.agent and key == self.agent.id else None

    async def execute(self, stmt):
        self.statements.append(stmt)
        leads = self.leads
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: leads))

    async def commit(self):
        self.committed = True


def _lead(agent_id):
    now = datetime(2026, 11, 6, 9, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        id=uuid.uuid4(), agent_id=agent_id, history_id=uuid.uuid4(), name="Sita", business_name=None,
        phone="+9779841234567", email=None, interest="trial", language="Nepali", created_at=now,
        updated_at=now, notified_at=now, notify_status="sent", notify_error=None,
    )


@pytest.fixture
def setup():
    agent = SimpleNamespace(id=uuid.uuid4(), name="Spirit Monkey Assistant",
                            lead_notify_enabled=False, lead_notify_emails=[],
                            lead_whatsapp_number=None, hide_branding=False)
    db = FakeDB(agent, [_lead(agent.id)])

    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        role = request.headers.get("X-Test-Role")
        request.state.user = SimpleNamespace(role=role) if role else None
        return await call_next(request)

    app.include_router(leads_module.router, prefix="/api/v1")

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    return SimpleNamespace(client=TestClient(app), agent=agent, db=db)


ADMIN = {"X-Test-Role": "admin"}


def _settings_url(agent_id):
    return f"/api/v1/admin/agents/{agent_id}/lead-settings"


def test_requires_admin(setup):
    assert setup.client.get(_settings_url(setup.agent.id)).status_code == 401
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_notify_enabled": True,
                                                              "lead_notify_emails": ["a@b.com"]},
                           headers={"X-Test-Role": "user"})
    assert r.status_code == 403
    assert setup.agent.lead_notify_enabled is False
    assert setup.client.get(f"/api/v1/admin/agents/{setup.agent.id}/leads",
                            headers={"X-Test-Role": "user"}).status_code == 403


def test_enable_with_emails(setup):
    r = setup.client.patch(_settings_url(setup.agent.id),
                           json={"lead_notify_enabled": True, "lead_notify_emails": ["Owner@Client.com", "owner@client.com", "b@c.com"]},
                           headers=ADMIN)
    assert r.status_code == 200
    assert setup.agent.lead_notify_enabled is True
    assert setup.agent.lead_notify_emails == ["owner@client.com", "b@c.com"]
    assert setup.db.committed
    assert r.json()["lead_notify_emails"] == ["owner@client.com", "b@c.com"]


def test_enable_without_any_email_rejected(setup):
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_notify_enabled": True}, headers=ADMIN)
    assert r.status_code == 422
    assert setup.agent.lead_notify_enabled is False


def test_invalid_email_rejected(setup):
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_notify_emails": ["not-an-email"]}, headers=ADMIN)
    assert r.status_code == 422


def test_disable_keeps_emails(setup):
    setup.agent.lead_notify_enabled, setup.agent.lead_notify_emails = True, ["a@b.com"]
    setup.client.patch(_settings_url(setup.agent.id), json={"lead_notify_enabled": False}, headers=ADMIN)
    assert setup.agent.lead_notify_enabled is False
    assert setup.agent.lead_notify_emails == ["a@b.com"]


def test_unknown_agent_404(setup):
    assert setup.client.get(_settings_url(uuid.uuid4()), headers=ADMIN).status_code == 404


def test_list_leads_with_date_range(setup):
    r = setup.client.get(f"/api/v1/admin/agents/{setup.agent.id}/leads?date_from=2026-11-01&date_to=2026-11-30",
                         headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1 and body["leads"][0]["phone"] == "+9779841234567"
    assert body["timezone"] == "Asia/Kathmandu"
    sql = str(setup.db.statements[0].compile(compile_kwargs={"literal_binds": True}))
    # Kathmandu midnight 1 Nov is 18:15 UTC on 31 Oct; date_to is inclusive (< 1 Dec Kathmandu).
    assert "leads.created_at >=" in sql and "leads.created_at <" in sql
    assert "2026-11-01 00:00:00+05:45" in sql and "2026-12-01 00:00:00+05:45" in sql


def test_list_leads_bad_range(setup):
    r = setup.client.get(f"/api/v1/admin/agents/{setup.agent.id}/leads?date_from=2026-11-30&date_to=2026-11-01",
                         headers=ADMIN)
    assert r.status_code == 422


def test_test_email_requires_recipients(setup):
    r = setup.client.post(_settings_url(setup.agent.id) + "/test-email", headers=ADMIN)
    assert r.status_code == 422


def test_test_email_sends_sample(setup, monkeypatch):
    setup.agent.lead_notify_emails = ["owner@client.com"]
    sent = []

    async def fake_send(to, subject, html, reply_to=None):
        sent.append((to, subject))
        return True

    monkeypatch.setattr(leads_module.lead_service, "smtp_send", fake_send)
    monkeypatch.setattr(type(leads_module.system_setting), "smtp_configured", property(lambda self: True))
    r = setup.client.post(_settings_url(setup.agent.id) + "/test-email", headers=ADMIN)
    assert r.status_code == 200
    assert sent[0][0] == ["owner@client.com"]
    assert sent[0][1].startswith("[TEST] New lead from your website chat")


@pytest.mark.parametrize("raw, stored", [
    ("9841234567", "+9779841234567"),
    ("+977 984-1234567", "+9779841234567"),
    ("009779841234567", "+9779841234567"),
    ("+86 138 0013 8000", "+8613800138000"),
])
def test_whatsapp_number_is_normalised(setup, raw, stored):
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_whatsapp_number": raw}, headers=ADMIN)
    assert r.status_code == 200
    assert setup.agent.lead_whatsapp_number == stored
    assert r.json()["lead_whatsapp_number"] == stored


@pytest.mark.parametrize("raw", ["call me", "12345", "014123456", "98412345678901234567"])
def test_bad_whatsapp_number_is_rejected(setup, raw):
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_whatsapp_number": raw}, headers=ADMIN)
    assert r.status_code == 422
    assert setup.agent.lead_whatsapp_number is None


def test_whatsapp_number_can_be_cleared_and_is_untouched_when_omitted(setup):
    setup.agent.lead_whatsapp_number = "+9779841234567"
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_notify_emails": ["a@b.com"]}, headers=ADMIN)
    assert r.status_code == 200
    assert setup.agent.lead_whatsapp_number == "+9779841234567"
    r = setup.client.patch(_settings_url(setup.agent.id), json={"lead_whatsapp_number": ""}, headers=ADMIN)
    assert r.status_code == 200
    assert setup.agent.lead_whatsapp_number is None


def test_hide_branding_defaults_off_and_is_admin_settable(setup):
    assert setup.client.get(_settings_url(setup.agent.id), headers=ADMIN).json()["hide_branding"] is False
    r = setup.client.patch(_settings_url(setup.agent.id), json={"hide_branding": True}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["hide_branding"] is True
    assert setup.agent.hide_branding is True
    # Other saves leave it alone.
    setup.client.patch(_settings_url(setup.agent.id), json={"lead_whatsapp_number": ""}, headers=ADMIN)
    assert setup.agent.hide_branding is True


def test_hide_branding_cannot_be_set_by_a_non_admin(setup):
    r = setup.client.patch(_settings_url(setup.agent.id), json={"hide_branding": True}, headers={"X-Test-Role": "user"})
    assert r.status_code == 403
    assert setup.agent.hide_branding is False
