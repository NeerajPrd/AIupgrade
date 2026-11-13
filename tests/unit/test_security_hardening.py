"""Security hardening: no default admin, closed signup, locked setup endpoint, fewer open endpoints, clean logs."""
import os
import uuid
from types import SimpleNamespace

import bcrypt
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.api.custom_middleware import AuthMiddleware
from src.services.security import policy


# ---------------------------------------------------------------- which paths need no login

@pytest.fixture
def mw():
    return AuthMiddleware.__new__(AuthMiddleware)


@pytest.mark.parametrize("path", [
    "/api/v1/chat",
    "/api/v1/tts",
    "/api/v1/generate-image",
    "/api/v1/whatsapp-session/start",
    "/api/v1/setup",
    "/api/v1/agent",
    "/api/v1/admin/agent-usage",
    "/upgrade/0329032",
    # "/webhook/" or "/agent-api/" further along a path must not open it up
    "/api/v1/agent/123/webhook/config",
    "/api/v1/users/me/agent-api/keys",
    "/api/v1/file/123/file/image/1",
])
def test_paths_that_now_require_login(mw, path):
    assert mw._is_public_path(path) is False


@pytest.mark.parametrize("path", [
    "/api/v1/auth/login",
    "/api/v1/auth/register",  # reachable, but refuses unless ALLOW_PUBLIC_SIGNUP is on
    "/api/v1/auth/forgot-password",
    "/api/v1/agent-api/my-bot/chat",
    "/api/v1/workflow-api/my-flow/execute",
    "/api/v1/webhook/whatsapp/123",
    "/api/v1/whatsapp-session/webhook/instance-1",
    "/api/v1/whatsapp-session/webhook/instance-1/messages-upsert",
    "/api/v1/file/image/abc",
])
def test_paths_that_stay_reachable_without_login(mw, path):
    assert mw._is_public_path(path) is True


# ---------------------------------------------------------------- settings default to closed

def test_switches_are_off_by_default():
    from src.core.settings import Settings

    assert Settings.model_fields["ALLOW_PUBLIC_SIGNUP"].default is False
    assert Settings.model_fields["ENABLE_SETUP_ENDPOINT"].default is False


async def test_signup_refused_when_public_signup_is_off(monkeypatch):
    from src.api.v1.routers.authentication import auth_router
    from src.utils.upgrade_auth.app_error import AppError

    called = []

    class FakeAuthService:
        async def signup_user(self, *args):
            called.append(args)

    monkeypatch.setattr(auth_router.policy, "public_signup_allowed", lambda: False)
    with pytest.raises(AppError) as err:
        await auth_router.signup(user_data=None, request=None, response=None, auth_service=FakeAuthService())
    assert err.value.status_code == 403
    assert called == []


# ---------------------------------------------------------------- setup endpoint

@pytest.fixture
def setup_client(monkeypatch):
    from src.api.v1.routers.misc import setup_router

    state = SimpleNamespace(enabled=False, ran=[])
    monkeypatch.setattr(setup_router.policy, "setup_endpoint_enabled", lambda: state.enabled)
    monkeypatch.setattr(setup_router, "update_env_file", lambda url: state.ran.append(url))

    app = FastAPI()

    @app.middleware("http")
    async def fake_auth(request: Request, call_next):
        role = request.headers.get("X-Test-Role")
        request.state.user = SimpleNamespace(role=role) if role else None
        return await call_next(request)

    app.include_router(setup_router.router, prefix="/setup")
    state.client = TestClient(app, raise_server_exceptions=False)
    return state


BODY = {"database_url": "postgresql+asyncpg://u:p@localhost/x"}


def test_setup_endpoint_does_not_exist_by_default(setup_client):
    r = setup_client.client.post("/setup", json=BODY, headers={"X-Test-Role": "admin"})
    assert r.status_code == 404
    assert setup_client.ran == []


def test_setup_endpoint_is_admin_only_when_enabled(setup_client):
    setup_client.enabled = True
    assert setup_client.client.post("/setup", json=BODY).status_code == 401
    assert setup_client.client.post("/setup", json=BODY, headers={"X-Test-Role": "user"}).status_code == 403
    assert setup_client.ran == []


def test_setup_router_no_longer_seeds_or_reveals_an_admin():
    from src.api.v1.routers.misc import setup_router

    source = open(setup_router.__file__, encoding="utf-8").read()
    assert "adminpassword" not in source and "default_admin_account" not in source
    assert not hasattr(setup_router, "seed_default_admin_user")


# ---------------------------------------------------------------- default admin

def test_no_script_seeds_a_default_admin_any_more():
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    assert not os.path.exists(os.path.join(root, "scripts", "auto_setup_user.py"))
    entrypoint = open(os.path.join(root, "deploy", "entrypoint.sh"), encoding="utf-8").read()
    assert "auto_setup_user" not in entrypoint


class FakeSession:
    def __init__(self, user):
        self.user, self.committed = user, False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, stmt):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)

    async def commit(self):
        self.committed = True


def _manager(user):
    session = FakeSession(user)
    return SimpleNamespace(get_session=lambda: session, session=session)


def _user(password: str, active=True):
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()
    return SimpleNamespace(id=uuid.uuid4(), email=policy.LEGACY_DEFAULT_ADMIN_EMAIL, password_hash=hashed, active=active)


async def test_default_admin_with_published_password_is_switched_off():
    user = _user(policy._LEGACY_DEFAULT_ADMIN_PASSWORD)
    manager = _manager(user)
    assert await policy.disable_legacy_default_admin(manager) is True
    assert user.active is False and manager.session.committed


async def test_default_admin_with_a_changed_password_is_left_alone():
    user = _user("a-real-password-someone-chose")
    manager = _manager(user)
    assert await policy.disable_legacy_default_admin(manager) is False
    assert user.active is True and not manager.session.committed


async def test_no_default_admin_is_fine_and_errors_never_stop_startup():
    assert await policy.disable_legacy_default_admin(_manager(None)) is False

    def broken():
        raise RuntimeError("database down")

    assert await policy.disable_legacy_default_admin(SimpleNamespace(get_session=broken)) is False


# ---------------------------------------------------------------- logs

def test_request_bodies_are_redacted_for_logs():
    body = {
        "email": "a@b.com",
        "password": "hunter2",
        "passwordConfirm": "hunter2",
        "llm_config": {"api_key": "sk-123", "model": "x"},
        "items": [{"refresh_token": "abc", "name": "ok"}],
        "file_data": "data:image/png;base64,AAAA",
        "empty_password": "",
    }
    safe = policy.redact_for_log(body)
    text = str(safe)
    assert "hunter2" not in text and "sk-123" not in text and "abc" not in text and "AAAA" not in text
    assert safe["email"] == "a@b.com" and safe["llm_config"]["model"] == "x" and safe["items"][0]["name"] == "ok"
    assert body["password"] == "hunter2"  # the request itself is untouched


def test_tokens_in_query_strings_are_redacted_for_logs():
    safe = policy.redact_query_for_log({"access_token": "eyJ...", "token": "eyJ...", "channel": "exec:1", "code": "4/0A"})
    assert safe == {"access_token": policy.REDACTED, "token": policy.REDACTED, "channel": "exec:1", "code": policy.REDACTED}
