"""Helper LLM calls (tool routing, lead extraction) use the light model set by LIGHT_LLM_MODEL.

Routing falls back to the answering model when the light model fails; lead extraction has no
second model and falls back to the regex values instead (covered in test_leads.py).
"""
import uuid
from types import SimpleNamespace

import pytest

from src.core.settings import system_setting
from src.schemas.llm import BaseLLMConfig
from src.services import query_analyzer as qa
from src.services.leads import extraction

QUESTION = "price chai kasari chha?"
LIGHT = system_setting.LIGHT_LLM_MODEL


@pytest.fixture
def llm(monkeypatch):
    """Records every model asked; models listed in `failing` raise like a provider 429."""
    state = SimpleNamespace(models=[], failing=set(), reply='["rag"]')

    class FakeLLMService:
        def __init__(self, config):
            self.config = config

        async def chat_completion(self, **kwargs):
            state.models.append(self.config.model)
            if self.config.model in state.failing:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return state.reply

    monkeypatch.setattr(qa, "LLMService", FakeLLMService)
    import src.services.llm as llm_module
    monkeypatch.setattr(llm_module, "LLMService", FakeLLMService)

    async def no_key(**kwargs):
        return None

    import src.services.api_key_resolver as resolver
    monkeypatch.setattr(resolver, "resolve_api_key", no_key)
    return state


def test_light_model_is_an_env_setting_defaulting_to_flash_lite_latest():
    from src.core.settings import Settings

    assert Settings.model_fields["LIGHT_LLM_MODEL"].default == "gemini-flash-lite-latest"
    assert LIGHT  # whatever LIGHT_LLM_MODEL is set to in this environment


async def test_routing_uses_the_light_model(llm):
    llm.reply = '["general"]'
    tools = await qa.analyze_and_select_tools([{"role": "user", "content": QUESTION}])
    assert tools == ["general"]
    assert llm.models == [LIGHT]


async def test_routing_falls_back_to_the_answering_model(llm):
    llm.failing = {LIGHT}
    llm.reply = '["general"]'
    main = BaseLLMConfig(model="main-model", provider="gemini")
    tools = await qa.analyze_and_select_tools([{"role": "user", "content": QUESTION}], fallback_llm_config=main)
    assert tools == ["general"]
    assert llm.models == [LIGHT, "main-model"]


async def test_routing_falls_back_to_smart_model_when_no_answering_model_given(llm):
    llm.failing = {LIGHT}
    await qa.analyze_and_select_tools([{"role": "user", "content": QUESTION}])
    assert llm.models == [LIGHT, system_setting.SMART_MODEL_ID]


async def test_routing_defaults_to_rag_when_both_models_fail(llm):
    llm.failing = {LIGHT, "main-model"}
    main = BaseLLMConfig(model="main-model", provider="gemini")
    tools = await qa.analyze_and_select_tools([{"role": "user", "content": QUESTION}], fallback_llm_config=main)
    assert tools == ["rag"]
    assert llm.models == [LIGHT, "main-model"]


async def test_lead_extraction_uses_the_light_model_only(llm):
    llm.reply = '{"name": "Sita", "phone": "9841234567"}'
    call = extraction.default_llm_call(uuid.uuid4(), uuid.uuid4())
    fields = await extraction.extract_lead_fields([{"role": "user", "content": "mero naam Sita ho"}], call)
    assert fields["name"] == "Sita"
    assert llm.models == [LIGHT]


async def test_lead_extraction_failure_propagates_so_regex_fallback_runs(llm):
    llm.failing = {LIGHT}
    call = extraction.default_llm_call(uuid.uuid4(), uuid.uuid4())
    with pytest.raises(RuntimeError):
        await extraction.extract_lead_fields([{"role": "user", "content": "9841234567"}], call)
    assert llm.models == [LIGHT]  # no second, more expensive model is tried


async def test_explicit_model_overrides_the_light_default(llm):
    call = extraction.default_llm_call(uuid.uuid4(), uuid.uuid4(), model="fast-model", provider="gemini")
    llm.reply = "{}"
    await call([{"role": "user", "content": "x"}])
    assert llm.models == ["fast-model"]
