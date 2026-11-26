"""Which chat model an agent uses: DEFAULT_CHAT_MODEL (pinned gemini-2.5-flash) unless the agent names one."""
from types import SimpleNamespace

import pytest

from src.core.settings import Settings, system_setting
from src.services.agents import chat_orchestrator as orch_module
from src.services.agents.chat_orchestrator import ChatOrchestrator

AGENT_ID = "00000000-0000-0000-0000-000000000002"
USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def build(monkeypatch):
    import src.services.api_key_resolver as resolver

    async def no_key(**kwargs):
        return None

    monkeypatch.setattr(resolver, "resolve_api_key", no_key)
    orch = ChatOrchestrator(agent_manager=None, vector_store=None, chat_service=None)

    async def _build(model_settings):
        llm, model = await orch._build_llm_service_for_agent(AGENT_ID, {"config": {"model_settings": model_settings}}, USER_ID)
        return llm.config.provider, model

    return _build


def test_default_is_pinned_gemini_2_5_flash():
    default = Settings.model_fields["DEFAULT_CHAT_MODEL"].default
    assert default == "gemini-2.5-flash"
    assert "latest" not in default


async def test_agent_without_a_model_uses_the_default(build):
    assert await build({}) == ("gemini", system_setting.DEFAULT_CHAT_MODEL)


async def test_generic_gemini_uses_the_default(build):
    assert await build({"provider": "gemini"}) == ("gemini", system_setting.DEFAULT_CHAT_MODEL)
    assert await build({"model": "gemini"}) == ("gemini", system_setting.DEFAULT_CHAT_MODEL)


async def test_old_alias_saved_in_an_agent_is_pinned(build):
    assert await build({"llm_model": "gemini-flash-latest", "provider": "gemini"}) == ("gemini", system_setting.DEFAULT_CHAT_MODEL)


async def test_an_agent_that_names_another_model_keeps_it(build):
    assert await build({"llm_model": "gemini-2.0-flash"}) == ("gemini", "gemini-2.0-flash")
    # (without an OpenAI key the app falls back to Gemini for the call itself; the chosen model is unchanged)
    assert (await build({"llm_model": "gpt-4o-mini", "provider": "openai"}))[1] == "gpt-4o-mini"


async def test_default_comes_from_the_environment(build, monkeypatch):
    monkeypatch.setattr(orch_module.system_setting, "DEFAULT_CHAT_MODEL", "gemini-2.0-flash")
    assert await build({}) == ("gemini", "gemini-2.0-flash")
    assert await build({"llm_model": "gemini-flash-latest"}) == ("gemini", "gemini-2.0-flash")


def test_light_model_setting_is_unchanged():
    assert Settings.model_fields["LIGHT_LLM_MODEL"].default == "gemini-flash-lite-latest"
