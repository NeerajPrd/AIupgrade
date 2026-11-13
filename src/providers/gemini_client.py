"""Native Gemini API client (official google-genai SDK).

The app used to reach Gemini through Google's OpenAI-compatible endpoint
(.../v1beta/openai/). That endpoint rejects the new "AQ." auth keys, so everything now
goes through the native API, which accepts both "AQ." and the older "AIza" keys.

The API key travels only in the `x-goog-api-key` request header - never in a URL, and it
is never logged. The rest of the app still speaks the OpenAI message/response shapes, so
this module translates in both directions:

    OpenAI-style messages/tools  ->  Gemini contents / system_instruction / tools
    Gemini responses             ->  plain text, {"content", "tool_calls"} or stream chunks
                                     with `.choices[0].delta.content` (what callers read)
"""

import base64
import json
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

import httpx
from google import genai
from google.genai import types

from src.core.settings import system_setting

# Same ceiling the OpenAI SDK used by default (10 minutes), in milliseconds.
REQUEST_TIMEOUT_MS = 600_000
# The pgvector column is Vector(1536); every embedding must have exactly this many dimensions.
EMBEDDING_DIMENSIONS = 1536
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2"

_MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024


def aget_client(api_key: Optional[str] = None, http_options: Optional[types.HttpOptions] = None) -> genai.Client:
    """A Gemini client for `api_key` (default: GEMINI_API_KEY). Works with "AQ." and "AIza" keys."""
    key = (api_key or system_setting.GEMINI_API_KEY or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY is missing.")
    return genai.Client(api_key=key, http_options=http_options or default_http_options())


def default_http_options(**overrides: Any) -> types.HttpOptions:
    """Timeout and transport-level retries matching what the OpenAI SDK did for us before:
    the first call plus 2 quick retries on 408/409/429/5xx (0.5s to 8s backoff). The app's own
    429 handling (src/services/agents/llm_tasks.py) still runs on top, exactly as before."""
    options: Dict[str, Any] = {
        "timeout": REQUEST_TIMEOUT_MS,
        "retry_options": types.HttpRetryOptions(
            attempts=3,
            initial_delay=0.5,
            max_delay=8.0,
            http_status_codes=[408, 409, 429, 500, 502, 503, 504],
        ),
    }
    options.update(overrides)
    return types.HttpOptions(**options)


# ---------------------------------------------------------------- request translation

def _data_uri_part(url: str) -> Optional[types.Part]:
    """data:image/png;base64,AAAA -> inline image part."""
    try:
        header, payload = url.split(",", 1)
        mime_type = header[5:].split(";")[0] or "image/jpeg"
        return types.Part.from_bytes(data=base64.b64decode(payload), mime_type=mime_type)
    except Exception:
        return None


async def _remote_image_part(url: str) -> Optional[types.Part]:
    """Fetch an http(s) image so it can be sent inline (the native API does not fetch URLs itself)."""
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            if len(response.content) > _MAX_REMOTE_IMAGE_BYTES:
                return None
            mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
            return types.Part.from_bytes(data=response.content, mime_type=mime_type)
    except Exception:
        return None


async def _content_parts(content: Any) -> List[types.Part]:
    """OpenAI message content (string or list of blocks) -> Gemini parts. Empty text is dropped."""
    if content is None:
        return []
    if isinstance(content, str):
        return [types.Part(text=content)] if content else []
    parts: List[types.Part] = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, str):
                if block:
                    parts.append(types.Part(text=block))
                continue
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            if kind == "text":
                if block.get("text"):
                    parts.append(types.Part(text=str(block["text"])))
            elif kind == "image_url":
                image = block.get("image_url")
                url = image.get("url") if isinstance(image, dict) else image
                if isinstance(url, str):
                    part = _data_uri_part(url) if url.startswith("data:") else await _remote_image_part(url)
                    if part is not None:
                        parts.append(part)
        return parts
    return [types.Part(text=str(content))]


def _json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except ValueError:
            return {"value": value}
    return {}


async def to_gemini_contents(messages: List[Dict[str, Any]]) -> Tuple[Optional[str], List[types.Content]]:
    """OpenAI-style messages -> (system_instruction, contents)."""
    system_texts: List[str] = []
    contents: List[types.Content] = []
    tool_names: Dict[str, str] = {}  # tool_call_id -> function name, to label tool results

    for message in messages or []:
        role = message.get("role")
        content = message.get("content")

        if role in ("system", "developer"):
            text = "".join(p.text or "" for p in await _content_parts(content))
            if text:
                system_texts.append(text)
            continue

        if role in ("tool", "function"):
            name = message.get("name") or tool_names.get(str(message.get("tool_call_id")), "tool")
            response = content if isinstance(content, dict) else {"result": "" if content is None else str(content)}
            contents.append(
                types.Content(role="user", parts=[types.Part.from_function_response(name=name, response=response)])
            )
            continue

        parts = await _content_parts(content)
        if role == "assistant":
            for call in message.get("tool_calls") or []:
                function = call.get("function") or {}
                name = function.get("name")
                if not name:
                    continue
                if call.get("id"):
                    tool_names[str(call["id"])] = name
                parts.append(
                    types.Part(function_call=types.FunctionCall(name=name, args=_json_object(function.get("arguments"))))
                )
        if parts:
            contents.append(types.Content(role="model" if role == "assistant" else "user", parts=parts))

    system_instruction = "\n\n".join(system_texts) or None
    if not contents:
        # The API needs at least one turn. A lone system prompt is sent as the user's message.
        contents = [types.Content(role="user", parts=[types.Part(text=system_instruction or " ")])]
        system_instruction = None
    return system_instruction, contents


def _to_gemini_tools(tools: Optional[List[Dict[str, Any]]]) -> Optional[List[types.Tool]]:
    declarations = []
    for tool in tools or []:
        function = tool.get("function") if isinstance(tool, dict) and tool.get("type") == "function" else tool
        if not isinstance(function, dict) or not function.get("name"):
            continue
        declarations.append(
            types.FunctionDeclaration(
                name=function["name"],
                description=function.get("description"),
                parameters_json_schema=function.get("parameters") or None,
            )
        )
    return [types.Tool(function_declarations=declarations)] if declarations else None


def _to_tool_config(tool_choice: Any) -> Optional[types.ToolConfig]:
    if tool_choice in (None, "auto"):
        return None
    if tool_choice == "none":
        mode, names = "NONE", None
    elif tool_choice == "required":
        mode, names = "ANY", None
    elif isinstance(tool_choice, dict) and (tool_choice.get("function") or {}).get("name"):
        mode, names = "ANY", [tool_choice["function"]["name"]]
    else:
        return None
    return types.ToolConfig(
        function_calling_config=types.FunctionCallingConfig(mode=mode, allowed_function_names=names)
    )


def build_generate_config(
    *,
    system_instruction: Optional[str],
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = "auto",
    response_format: Any = None,
) -> types.GenerateContentConfig:
    params: Dict[str, Any] = {}
    if system_instruction:
        params["system_instruction"] = system_instruction
    if temperature is not None:
        params["temperature"] = temperature
    if top_p is not None:
        params["top_p"] = top_p
    if max_tokens is not None:
        params["max_output_tokens"] = max_tokens
    gemini_tools = _to_gemini_tools(tools)
    if gemini_tools:
        params["tools"] = gemini_tools
        tool_config = _to_tool_config(tool_choice)
        if tool_config:
            params["tool_config"] = tool_config
    if isinstance(response_format, dict):
        if response_format.get("type") in ("json_object", "json_schema"):
            params["response_mime_type"] = "application/json"
        schema = (response_format.get("json_schema") or {}).get("schema")
        if response_format.get("type") == "json_schema" and schema:
            params["response_json_schema"] = schema
    return types.GenerateContentConfig(**params)


# ---------------------------------------------------------------- response translation

def response_text(response: types.GenerateContentResponse) -> Optional[str]:
    """The answer text (the model's private "thought" parts are skipped). None if there is none."""
    texts = []
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content and candidate.content.parts else []):
            if part.text and not part.thought:
                texts.append(part.text)
        break  # only the first candidate, as before
    return "".join(texts) or None


def response_tool_calls(response: types.GenerateContentResponse) -> List[Dict[str, Any]]:
    calls = []
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content and candidate.content.parts else []):
            if part.function_call and part.function_call.name:
                calls.append({"name": part.function_call.name, "arguments": dict(part.function_call.args or {})})
        break
    return calls


class _Namespace:
    def __init__(self, **fields: Any) -> None:
        self.__dict__.update(fields)

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self.__dict__})"


def _stream_chunk(model: str, text: Optional[str], tool_calls: List[Dict[str, Any]], finish_reason: Any):
    """One streamed piece in the shape callers read: chunk.choices[0].delta.content."""
    delta_calls = [
        _Namespace(
            index=i,
            id=f"call_{i}",
            type="function",
            function=_Namespace(name=call["name"], arguments=json.dumps(call["arguments"])),
        )
        for i, call in enumerate(tool_calls)
    ] or None
    delta = _Namespace(role="assistant", content=text, tool_calls=delta_calls)
    reason = str(getattr(finish_reason, "value", finish_reason)).lower() if finish_reason else None
    return _Namespace(model=model, choices=[_Namespace(index=0, delta=delta, finish_reason=reason)], usage=None)


async def _as_openai_stream(
    client: genai.Client, model: str, stream: AsyncIterator[types.GenerateContentResponse]
):
    # `client` is held here on purpose: the SDK closes its connection when the client object is
    # garbage-collected, and callers often keep only this iterator while they read the stream.
    _keep_alive = client  # noqa: F841
    async for response in stream:
        text = response_text(response)
        calls = response_tool_calls(response)
        if text or calls:
            finish = response.candidates[0].finish_reason if response.candidates else None
            yield _stream_chunk(model, text, calls, finish)


# ---------------------------------------------------------------- calls

async def generate(
    client: genai.Client,
    *,
    model: str,
    messages: List[Dict[str, Any]],
    stream: bool = False,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Any = "auto",
    response_format: Any = None,
):
    """
    stream=False: the answer text (or {"content", "tool_calls"} when tools were given).
    stream=True:  an async iterator of chunks with `.choices[0].delta.content`.
    Provider errors (e.g. 429 RESOURCE_EXHAUSTED) propagate unchanged, with `.code` set.
    """
    system_instruction, contents = await to_gemini_contents(messages)
    config = build_generate_config(
        system_instruction=system_instruction,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        tools=tools,
        tool_choice=tool_choice,
        response_format=response_format,
    )
    if stream:
        raw = await client.aio.models.generate_content_stream(model=model, contents=contents, config=config)
        return _as_openai_stream(client, model, raw)

    response = await client.aio.models.generate_content(model=model, contents=contents, config=config)
    if tools:
        return {"content": response_text(response), "tool_calls": response_tool_calls(response)}
    return response_text(response)


async def embed(client: genai.Client, text: str, model: str = DEFAULT_EMBEDDING_MODEL) -> List[float]:
    """One text -> one vector of exactly EMBEDDING_DIMENSIONS floats (same model and size as before)."""
    response = await client.aio.models.embed_content(
        model=model,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS),
    )
    return list(response.embeddings[0].values)
