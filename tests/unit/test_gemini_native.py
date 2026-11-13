"""Gemini goes through the native API with the key in the x-goog-api-key header.

A tiny local HTTP server stands in for Google, so these tests see exactly what goes over the
wire: both the new "AQ." auth keys and the older "AIza" keys must be sent in the header and
never appear in a URL. The OpenAI-shaped inputs/outputs the rest of the app relies on are
checked too (plain text, tool calls, stream chunks, 1536-dimension embeddings, 429 errors).
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import httpx
import pytest
from google.genai import types

from src.providers import gemini_client
from src.schemas.llm import BaseLLMConfig
from src.services.agents.llm_tasks import is_rate_limit_error
from src.services.llm import LLMService

AQ_KEY = "AQ.Ab8RN6KtestOnlyNotARealKey_0123456789abcdefghijklmnop"
AIZA_KEY = "AIzaSyTestOnlyNotARealKey0123456789abcdefg"
KEYS = pytest.mark.parametrize("api_key", [AQ_KEY, AIZA_KEY], ids=["AQ-key", "AIza-key"])


class FakeGoogle:
    def __init__(self):
        self.requests = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                fake.requests.append(SimpleNamespace(path=self.path, headers=dict(self.headers), body=body))
                if "always-429" in self.path:
                    return self._json(429, {"error": {
                        "code": 429, "status": "RESOURCE_EXHAUSTED",
                        "message": "Quota exceeded for quota metric. Please retry in 7.5s.",
                        "details": [{"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                                     "violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}],
                    }})
                if ":streamGenerateContent" in self.path:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.end_headers()
                    for piece in ("Namaste! ", "नमस्ते।"):
                        chunk = {"candidates": [{"content": {"role": "model", "parts": [{"text": piece}]}}]}
                        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode("utf-8"))
                        self.wfile.flush()
                    return
                if "mbedContent" in self.path:  # embedContent / batchEmbedContents
                    dims = (body.get("requests") or [body])[0].get("outputDimensionality")
                    vector = {"values": [0.25] * int(dims or 3072)}
                    return self._json(200, {"embedding": vector, "embeddings": [vector]})
                if body.get("tools"):
                    part = {"functionCall": {"name": "get_plan_price", "args": {"plan": "Growth"}}}
                else:
                    part = {"text": "Plans start at NPR 7,500 for 6 months."}
                parts = [{"text": "private reasoning", "thought": True}, part]
                self._json(200, {"candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}]})

            def _json(self, status, payload):
                data = json.dumps(payload).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()
    real_options = gemini_client.default_http_options

    def options_for_tests(**overrides):
        # Same options as production, pointed at the stand-in server and with near-instant retries.
        retry = types.HttpRetryOptions(attempts=3, initial_delay=0.01, max_delay=0.02, jitter=0.001,
                                       http_status_codes=[408, 409, 429, 500, 502, 503, 504])
        return real_options(base_url=fake.url, retry_options=retry, **overrides)

    monkeypatch.setattr(gemini_client, "default_http_options", options_for_tests)
    yield fake
    fake.close()


def _llm(api_key, model="gemini-2.5-flash", **config):
    return LLMService(BaseLLMConfig(provider="gemini", model=model, api_key=api_key, **config))


def assert_key_only_in_header(request, api_key):
    headers = {k.lower(): v for k, v in request.headers.items()}
    assert headers.get("x-goog-api-key") == api_key
    assert api_key not in request.path and "key=" not in request.path
    assert "authorization" not in headers  # the OpenAI-style "Bearer <key>" is what AQ. keys reject
    assert api_key not in json.dumps(request.body)


# ---------------------------------------------------------------- both key formats, every call type

@KEYS
async def test_chat_works_and_key_stays_in_the_header(google, api_key):
    answer = await _llm(api_key).chat_completion(
        system_prompt="You are Spirit Monkey Assistant.", user_query="fee kati ho?"
    )
    assert answer == "Plans start at NPR 7,500 for 6 months."  # the model's private "thought" part is dropped
    request = google.requests[0]
    assert request.path.startswith("/v1beta/models/gemini-2.5-flash:generateContent")
    assert_key_only_in_header(request, api_key)
    assert request.body["systemInstruction"]["parts"][0]["text"] == "You are Spirit Monkey Assistant."
    assert request.body["contents"] == [{"role": "user", "parts": [{"text": "fee kati ho?"}]}]


@KEYS
async def test_streaming_works_and_key_stays_in_the_header(google, api_key):
    stream = await _llm(api_key).chat_completion(
        conversations=[{"role": "user", "content": "hello"}], is_streaming=True
    )
    pieces = []
    async for chunk in stream:  # exactly how src/services/agents/llm_tasks.py reads it
        if not chunk.choices:
            continue
        if chunk.choices[0].delta.content is not None:
            pieces.append(chunk.choices[0].delta.content)
    assert pieces == ["Namaste! ", "नमस्ते।"]
    assert ":streamGenerateContent" in google.requests[0].path
    assert_key_only_in_header(google.requests[0], api_key)


@KEYS
async def test_embeddings_keep_the_same_model_and_1536_dimensions(google, api_key):
    vector = await _llm(api_key, model="gemini-embedding-2").get_embeddings("तपाईंको सेवा के के छ?")
    assert len(vector) == 1536 == gemini_client.EMBEDDING_DIMENSIONS
    request = google.requests[0]
    assert "/models/gemini-embedding-2:" in request.path
    assert_key_only_in_header(request, api_key)
    sent = (request.body.get("requests") or [request.body])[0]
    assert sent["outputDimensionality"] == 1536


@KEYS
async def test_tool_calling_works(google, api_key):
    tools = [{"type": "function", "function": {
        "name": "get_plan_price", "description": "Look up a plan price",
        "parameters": {"type": "object", "properties": {"plan": {"type": "string"}}, "required": ["plan"]},
    }}]
    result = await _llm(api_key).chat_completion(
        conversations=[{"role": "user", "content": "price of Growth?"}], tools=tools
    )
    assert result == {"content": None, "tool_calls": [{"name": "get_plan_price", "arguments": {"plan": "Growth"}}]}
    declaration = google.requests[0].body["tools"][0]["functionDeclarations"][0]
    assert declaration["name"] == "get_plan_price"
    assert_key_only_in_header(google.requests[0], api_key)


def test_default_embedding_model_is_unchanged():
    assert gemini_client.DEFAULT_EMBEDDING_MODEL == "gemini-embedding-2"


async def test_embedding_falls_back_to_the_default_model_for_a_chat_model_name(google):
    await _llm(AQ_KEY, model="gemini-2.5-flash").get_embeddings("hello")
    assert "/models/gemini-embedding-2:" in google.requests[0].path


# ---------------------------------------------------------------- settings and errors

async def test_model_settings_are_passed_through(google):
    await _llm(AQ_KEY, temperature=0.0, top_p=0.3, max_tokens=256).chat_completion(user_query="hi")
    generation = google.requests[0].body["generationConfig"]
    assert generation["temperature"] == 0.0 and generation["topP"] == 0.3 and generation["maxOutputTokens"] == 256


@KEYS
async def test_429_is_retried_then_raised_in_a_form_the_app_recognises(google, api_key):
    with pytest.raises(Exception) as caught:
        await _llm(api_key, model="always-429").chat_completion(user_query="hi")
    err = caught.value
    assert len(google.requests) == 3  # first call + 2 quick retries, as the OpenAI SDK did
    assert getattr(err, "code", None) == 429
    assert is_rate_limit_error(err)  # so the app's own 429 handling and friendly message still apply
    assert api_key not in str(err) and api_key not in repr(err)


async def test_streaming_429_is_raised_before_any_token(google):
    from src.services.agents.llm_tasks import generate_general_response_with_retry

    config = BaseLLMConfig(provider="gemini", model="always-429", api_key=AQ_KEY)
    tokens = []
    with pytest.raises(Exception) as caught:
        async for token in generate_general_response_with_retry(
            messages=[{"role": "user", "content": "hi"}], llm_config=config, max_retries=0
        ):
            tokens.append(token)
    assert tokens == [] and is_rate_limit_error(caught.value)


def test_missing_key_is_a_clear_error_without_a_network_call(monkeypatch):
    monkeypatch.setattr(gemini_client, "system_setting", SimpleNamespace(GEMINI_API_KEY=""))
    with pytest.raises(ValueError, match="GEMINI_API_KEY is missing"):
        gemini_client.aget_client(None)


def test_no_openai_compatible_endpoint_left_in_the_gemini_code():
    for module in ("src/providers/gemini_client.py", "src/llms/gemini_llm.py", "src/diffusion/gemini_imagen.py"):
        source = open(module, encoding="utf-8").read()
        assert "base_url=" not in source and "?key=" not in source, module
        assert "from openai" not in source and "import openai" not in source, module


# ---------------------------------------------------------------- message translation

async def test_conversation_history_is_translated():
    system, contents = await gemini_client.to_gemini_contents([
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Namaste!"},
        {"role": "assistant", "content": ""},  # an empty turn must not be sent
        {"role": "user", "content": [
            {"type": "text", "text": "What is this?"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,aGVsbG8="}},
        ]},
    ])
    assert system == "Be brief."
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[1].parts[0].text == "Namaste!"
    image = contents[2].parts[1].inline_data
    assert image.mime_type == "image/png" and image.data == b"hello"


async def test_tool_round_trip_is_translated():
    _, contents = await gemini_client.to_gemini_contents([
        {"role": "user", "content": "price?"},
        {"role": "assistant", "content": None, "tool_calls": [
            {"id": "call_1", "type": "function", "function": {"name": "get_plan_price", "arguments": '{"plan": "Growth"}'}},
        ]},
        {"role": "tool", "tool_call_id": "call_1", "content": "NPR 9,500"},
    ])
    call = contents[1].parts[0].function_call
    assert call.name == "get_plan_price" and dict(call.args) == {"plan": "Growth"}
    result = contents[2].parts[0].function_response
    assert result.name == "get_plan_price" and result.response == {"result": "NPR 9,500"}


async def test_a_lone_system_prompt_still_makes_a_valid_request():
    system, contents = await gemini_client.to_gemini_contents([{"role": "system", "content": "Say hi."}])
    assert system is None and contents[0].role == "user" and contents[0].parts[0].text == "Say hi."


def test_json_response_format_is_translated():
    config = gemini_client.build_generate_config(system_instruction=None, response_format={"type": "json_object"})
    assert config.response_mime_type == "application/json"


# ---------------------------------------------------------------- image generation

@KEYS
async def test_image_generation_sends_the_key_in_a_header_not_the_url(monkeypatch, api_key):
    import base64
    from io import BytesIO

    from PIL import Image

    from src.diffusion import gemini_imagen
    from src.schemas.diffusion import BaseDiffusionConfig

    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="PNG")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"predictions": [{"bytesBase64Encoded": base64.b64encode(buffer.getvalue()).decode()}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        gemini_imagen.httpx, "AsyncClient", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs)
    )
    image = await gemini_imagen.GeminiImagenDiffusion(
        BaseDiffusionConfig(provider="gemini", api_key=api_key)
    ).generate_image("a mountain")
    assert image.size == (2, 2)
    assert seen[0].headers["x-goog-api-key"] == api_key
    assert api_key not in str(seen[0].url) and "key=" not in str(seen[0].url)
