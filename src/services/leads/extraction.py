"""One LLM call that turns a widget conversation into structured lead fields."""

import json
import re
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional

LEAD_FIELDS = ("name", "business_name", "phone", "email", "interest", "language")

# Keep the prompt small: the latest turns carry the contact details.
MAX_TURNS = 20
MAX_CHARS_PER_TURN = 1500

EXTRACTION_SYSTEM_PROMPT = """You extract sales-lead details from a website chat between a VISITOR and a business's AI assistant.
Use only what the VISITOR said about themselves. Never use the assistant's or the business's own contact details.
Reply with a single JSON object and nothing else, with exactly these keys:
  "name": the visitor's name, or null
  "business_name": the visitor's company or business name, or null
  "phone": the visitor's phone number(s) as written, comma-separated if more than one, or null
  "email": the visitor's email address(es), comma-separated if more than one, or null
  "interest": one short sentence (max 25 words, in English) on what the visitor wants, or null
  "language": the language the visitor writes in, e.g. "English", "Nepali", "Romanized Nepali", or "Mixed"
Keep names in the script the visitor used. Do not invent anything."""

LLMCall = Callable[[List[Dict[str, str]]], Awaitable[str]]


def build_extraction_messages(transcript: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """`transcript` is [{'role': 'user'|'assistant', 'content': str}, ...] oldest first."""
    lines = []
    for turn in transcript[-MAX_TURNS:]:
        speaker = "VISITOR" if turn.get("role") == "user" else "ASSISTANT"
        content = (turn.get("content") or "").strip()[:MAX_CHARS_PER_TURN]
        lines.append(f"{speaker}: {content}")
    return [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": "Conversation:\n\n" + "\n\n".join(lines) + "\n\nJSON:"},
    ]


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value if v)
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text or text.lower() in ("null", "none", "n/a", "unknown", "-"):
        return None
    return text[:limit]


_LIMITS = {"name": 255, "business_name": 255, "phone": 64, "email": 320, "interest": 500, "language": 32}


def parse_extraction(raw: Any) -> Dict[str, Optional[str]]:
    """Parse the model's reply (tolerates ```json fences and surrounding prose). Raises ValueError if no JSON object."""
    if isinstance(raw, dict):
        data = raw
    else:
        text = str(raw or "")
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("LLM reply contained no JSON object")
        data = json.loads(match.group(0))
        if not isinstance(data, dict):
            raise ValueError("LLM reply JSON is not an object")
    return {key: _clean(data.get(key), _LIMITS[key]) for key in LEAD_FIELDS}


async def extract_lead_fields(transcript: List[Dict[str, str]], llm_call: LLMCall) -> Dict[str, Optional[str]]:
    """Exactly one LLM call. Any failure (429, timeout, bad JSON) propagates so the caller can fall back."""
    raw = await llm_call(build_extraction_messages(transcript))
    return parse_extraction(raw)


def default_llm_call(
    owner_user_id: uuid.UUID, agent_id: uuid.UUID, model: Optional[str] = None, provider: Optional[str] = None
) -> LLMCall:
    """Non-streaming call, using the agent owner's own key if configured.

    Defaults to the light model (LIGHT_LLM_MODEL): lead extraction is a small, structured task.
    There is no second model here on purpose - if the call fails, the caller falls back to the
    regex matches, which costs nothing and never loses the lead.
    """

    async def _call(messages: List[Dict[str, str]]) -> str:
        from src.core.settings import system_setting
        from src.schemas.llm import BaseLLMConfig
        from src.services.api_key_resolver import resolve_api_key
        from src.services.llm import LLMService

        llm_provider = provider or system_setting.LIGHT_LLM_PROVIDER or system_setting.FAST_MODEL_PROVIDER
        api_key = None
        try:
            api_key = await resolve_api_key(
                user_id=owner_user_id, provider=llm_provider, feature="agents", specific_id=str(agent_id)
            )
        except Exception:
            api_key = None
        service = LLMService(
            BaseLLMConfig(
                model=model or system_setting.LIGHT_LLM_MODEL,
                provider=llm_provider,
                # No max_tokens: on Gemini 2.5 thinking tokens count toward it and can leave the reply empty.
                temperature=0.0,
                api_key=api_key,
            )
        )
        result = await service.chat_completion(conversations=messages, is_streaming=False)
        return result if isinstance(result, str) else json.dumps(result)

    return _call
