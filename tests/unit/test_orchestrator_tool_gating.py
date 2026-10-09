"""An agent may only use the tools enabled on it, whatever the tool-selection model says.

The query analyzer is an LLM, so it can pick "web_search" (or a generation tool) for
an ordinary customer question even when the agent has no tools enabled. The
orchestrator must not act on that: for an agent with no tools, a question like
"price chai kasari chha?" has to be answered from the knowledge base (RAG route),
never by crawling the web or generating images/videos.

The analyzer must not even be offered disabled tools, and the orchestrator re-checks
whatever it returns. Everything outside ChatOrchestrator.stream_chat is faked: no database, LLM, crawler
or network is touched. WebSearchService / ImageGenerationService are replaced with
recorders, so "routed to X" means "X's service was constructed".
"""
from types import SimpleNamespace

import pytest

from src.services.agents import chat_orchestrator as orch_module
from src.services.agents.chat_orchestrator import ChatOrchestrator

QUESTION = "price chai kasari chha?"

FORBIDDEN_TOOLS = ["web_search", "image_generation", "video_generation"]


class FakeChatService:
    def __init__(self):
        self.saved = []

    async def get_history(self, history_id):
        return [{"role": "user", "content": QUESTION}]

    async def add_message(self, history_id, role, content, metadata=None):
        self.saved.append((role, content))


class FakeAgentManager:
    def __init__(self, agent):
        self.agent = agent

    async def get_agent(self, agent_id):
        return self.agent


class Recorder:
    """Stands in for a tool service class and records every construction."""

    def __init__(self, name, calls):
        self.name, self.calls = name, calls

    def __call__(self, *args, **kwargs):
        self.calls.append(self.name)
        return self

    async def search_and_respond(self):
        yield {"type": "llm_token", "data": "WEB RESULT"}

    async def generate_and_upload_image(self, **kwargs):
        yield {"type": "final_asset", "data": {"summary": "an image", "url": "https://x/img.png"}}


@pytest.fixture
def run_chat(monkeypatch):
    tool_calls = []
    rag_calls = []

    monkeypatch.setattr(orch_module, "WebSearchService", Recorder("web_search", tool_calls))
    monkeypatch.setattr(orch_module, "ImageGenerationService", Recorder("image_generation", tool_calls))

    async def fake_general_response(messages, llm_config):
        rag_calls.append(messages)
        yield "RAG ANSWER"

    monkeypatch.setattr(orch_module, "generate_general_response", fake_general_response)

    # Knowledge-base lookup and key resolution must not touch a real DB.
    import src.services.embeddings as embeddings
    import src.services.api_key_resolver as resolver

    async def no_embeddings(**kwargs):
        raise RuntimeError("no embeddings in unit tests")

    async def no_key(**kwargs):
        raise ValueError("no key in unit tests")

    monkeypatch.setattr(embeddings, "get_embedding_service", no_embeddings)
    monkeypatch.setattr(resolver, "resolve_api_key", no_key)

    async def go(agent_tools, analyzer_choice):
        analyzer_calls = []

        # Ignores what it is offered and returns `analyzer_choice` anyway, like a misbehaving model.
        async def fake_analyzer(history, web_search_enabled=False, user_id=None, allowed_tools=None):
            analyzer_calls.append({"web_search_enabled": web_search_enabled, "allowed_tools": allowed_tools})
            return [analyzer_choice]

        monkeypatch.setattr(orch_module, "analyze_and_select_tools", fake_analyzer)

        agent = {"name": "Skill Square", "instructions": "You help customers.", "config": {}}
        if agent_tools is not None:
            agent["tools"] = agent_tools

        chat_service = FakeChatService()
        orchestrator = ChatOrchestrator(
            agent_manager=FakeAgentManager(agent),
            vector_store=SimpleNamespace(postgres_manager=None),
            chat_service=chat_service,
        )

        async def fake_build_llm(agent_id, agent_, user_id):
            return SimpleNamespace(config=SimpleNamespace(model="gemini-2.5-flash")), "gemini-2.5-flash"

        monkeypatch.setattr(orchestrator, "_build_llm_service_for_agent", fake_build_llm)

        tokens = []
        async for token in orchestrator.stream_chat(
            user_id="00000000-0000-0000-0000-000000000001",
            agent_id="00000000-0000-0000-0000-000000000002",
            history_id="00000000-0000-0000-0000-000000000003",
            message=QUESTION,
            # The public agent API always passes both, so the web search route is reachable.
            http_client=object(),
            crawl_service=object(),
        ):
            tokens.append(token)

        return SimpleNamespace(
            response="".join(tokens),
            tool_calls=list(tool_calls),
            rag_calls=len(rag_calls),
            analyzer_web_search_flag=analyzer_calls[0]["web_search_enabled"],
            offered_tools=analyzer_calls[0]["allowed_tools"],
            saved=chat_service.saved,
        )

    return go


# --------------------------------------------------------------------------- #
# The rule: no tools enabled -> never web search / image / video
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("analyzer_choice", FORBIDDEN_TOOLS)
@pytest.mark.parametrize("agent_tools", [[], None], ids=["tools-empty", "tools-missing"])
async def test_agent_without_tools_never_uses_forbidden_tool(run_chat, agent_tools, analyzer_choice):
    result = await run_chat(agent_tools, analyzer_choice)

    assert not set(FORBIDDEN_TOOLS) & set(result.offered_tools), "disabled tools were offered to the analyzer"
    assert result.tool_calls == [], f"{analyzer_choice} ran for an agent with no tools enabled"
    assert result.rag_calls == 1, "question should be answered from the knowledge base instead"
    assert result.response == "RAG ANSWER"
    assert result.saved[-1] == ("assistant", "RAG ANSWER")


# --------------------------------------------------------------------------- #
# Controls: prove the fakes really detect routing, so the test above can't pass by accident
# --------------------------------------------------------------------------- #
async def test_control_analyzer_is_told_web_search_is_off(run_chat):
    result = await run_chat([], "rag")
    assert result.analyzer_web_search_flag is False
    assert result.tool_calls == [] and result.rag_calls == 1


async def test_control_agent_with_web_search_enabled_does_use_it(run_chat):
    result = await run_chat(["web_search"], "web_search")
    assert result.analyzer_web_search_flag is True
    assert "web_search" in result.offered_tools
    assert result.tool_calls == ["web_search"]
    assert result.response == "WEB RESULT"


async def test_web_search_enabled_agent_still_cannot_generate_images(run_chat):
    result = await run_chat(["web_search"], "image_generation")
    assert result.tool_calls == []
    assert result.response == "RAG ANSWER"


# --------------------------------------------------------------------------- #
# Query analyzer: disabled tools are not in its prompt and never come back from it
# --------------------------------------------------------------------------- #
from src.schemas.agent_enums import SystemPrompt  # noqa: E402
from src.services import query_analyzer as qa  # noqa: E402


@pytest.mark.parametrize(
    "enabled,expected",
    [
        ([], set()),
        (None, set()),
        (["web_search"], {"web_search"}),
        (["webSearch"], {"web_search"}),
        (["websearch", "research"], {"web_search"}),
        (["image_generation", "videoGeneration"], {"image_generation", "video_generation"}),
    ],
)
def test_allowed_tools_for_agent(enabled, expected):
    allowed = set(qa.allowed_tools_for_agent(enabled))
    assert allowed & set(FORBIDDEN_TOOLS) == expected
    assert {"rag", "general"} <= allowed


def test_allowed_tools_honours_web_search_enabled_flag():
    assert "web_search" in qa.allowed_tools_for_agent([], web_search_enabled=True)


def test_prompt_without_opt_in_tools_never_mentions_them():
    system_prompt, _ = qa.build_prompt(
        SystemPrompt.TOOL_SELECTION, QUESTION, history=[], allowed_tools=qa.allowed_tools_for_agent([])
    )
    for tool in FORBIDDEN_TOOLS:
        assert tool not in system_prompt, f"{tool} offered in prompt"
    assert '"rag"' in system_prompt


def test_prompt_with_web_search_offers_it():
    system_prompt, _ = qa.build_prompt(
        SystemPrompt.TOOL_SELECTION, QUESTION, history=[], allowed_tools=qa.allowed_tools_for_agent(["web_search"])
    )
    assert '"web_search"' in system_prompt
    assert "image_generation" not in system_prompt


def test_prompt_default_still_offers_every_tool():
    # Upgrade chat (chat_stream_orchestrator) calls without allowed_tools; it must be unchanged.
    system_prompt, _ = qa.build_prompt(SystemPrompt.TOOL_SELECTION, QUESTION, history=[])
    for tool in FORBIDDEN_TOOLS:
        assert tool in system_prompt


@pytest.fixture
def fake_tool_llm(monkeypatch):
    """Makes the analyzer's LLM answer with whatever JSON the test sets; captures the prompt."""
    state = SimpleNamespace(reply="[]", prompts=[])

    class FakeLLMService:
        def __init__(self, config):
            pass

        async def chat_completion(self, user_query, system_prompt):
            state.prompts.append(system_prompt)
            return state.reply

    monkeypatch.setattr(qa, "LLMService", FakeLLMService)
    return state


@pytest.mark.parametrize("model_reply", ['["web_search"]', '["image_generation"]', '["video_generation"]'])
async def test_analyzer_drops_disabled_tool_from_model_reply(fake_tool_llm, model_reply):
    fake_tool_llm.reply = model_reply
    tools = await qa.analyze_and_select_tools(
        [{"role": "user", "content": QUESTION}], allowed_tools=qa.allowed_tools_for_agent([])
    )
    assert tools == ["rag"]
    assert "web_search" not in fake_tool_llm.prompts[0]


@pytest.mark.parametrize("message", ["draw a picture of chai", "generate a video of chai", "search for chai price"])
async def test_rule_shortcuts_respect_disabled_tools(fake_tool_llm, message):
    fake_tool_llm.reply = '["rag"]'
    tools = await qa.analyze_and_select_tools(
        [{"role": "user", "content": message}], web_search_enabled=False, allowed_tools=qa.allowed_tools_for_agent([])
    )
    assert not set(tools) & set(FORBIDDEN_TOOLS)


async def test_analyzer_default_keeps_old_behaviour(fake_tool_llm):
    # No allowed_tools given (Upgrade chat): the image shortcut still fires as before.
    tools = await qa.analyze_and_select_tools([{"role": "user", "content": "draw a picture of chai"}])
    assert tools == ["image_generation"]
