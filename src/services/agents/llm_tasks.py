from typing import Any, Dict, List, Optional

from src.schemas.agent_enums import SYSTEM_PROMPTS, SystemPrompt
from src.schemas.llm import BaseLLMConfig
from src.services.llm import LLMService
from src.services.map_model_provider import get_model_provider


# async def generate_general_response(
#     messages: List[Dict[str, Any]], model_name: str, max_tokens: int = 1000):
#
#     llm_service = LLMService(
#         config=BaseLLMConfig(
#             model=model_name,
#             provider=get_model_provider(model_id=model_name),
#             max_tokens=max_tokens
#         )
#     )
#
#     response_stream = await llm_service.chat_completion(
#         conversations=messages, is_streaming=True
#     )
#
#     async for chunk in response_stream:
#         content = chunk.choices[0].delta.content
#         if content is not None:
#             yield content


import asyncio
import re

from loguru import logger

_RATE_LIMIT_MARKERS = ("429", "rate_limit", "rate limit", "resource_exhausted", "quota")
_MAX_RETRY_DELAY_S = 8.0


def is_rate_limit_error(err: BaseException) -> bool:
    """True if the provider rejected the call for rate/quota reasons (e.g. Gemini 429 RESOURCE_EXHAUSTED)."""
    if getattr(err, "status_code", None) == 429 or getattr(err, "code", None) == 429:
        return True
    text = str(err).lower()
    return any(marker in text for marker in _RATE_LIMIT_MARKERS)


def _is_daily_quota(err: BaseException) -> bool:
    text = str(err).lower()
    return "perday" in text or "per day" in text or "per_day" in text


def _retry_delay_seconds(err: BaseException, attempt: int) -> float:
    """Use the provider's suggested retry delay if present, else exponential backoff."""
    match = re.search(r"retry(?:delay)?\D{0,12}?(\d+(?:\.\d+)?)\s*s", str(err), re.IGNORECASE)
    delay = float(match.group(1)) if match else 2.0 * (2 ** attempt)
    return min(delay, _MAX_RETRY_DELAY_S)


def describe_llm_error(err: BaseException, llm_config: Optional[BaseLLMConfig] = None) -> str:
    """One-line description of an LLM failure for logs, including the provider's own message."""
    status = getattr(err, "status_code", None) or getattr(err, "code", None)
    model = f"{llm_config.provider}/{llm_config.model}" if llm_config else "unknown model"
    return f"{type(err).__name__} (status={status}) from {model}: {err}"


async def generate_general_response_with_retry(
    messages: List[Dict[str, Any]], llm_config: BaseLLMConfig, max_retries: int = 2
):
    """
    Stream like generate_general_response, but retry on 429/quota errors that happen
    before any token was sent. Mid-stream failures and daily-quota errors are re-raised.
    """
    attempt = 0
    while True:
        yielded_any = False
        try:
            async for token in generate_general_response(messages=messages, llm_config=llm_config):
                yielded_any = True
                yield token
            return
        except Exception as err:
            if not is_rate_limit_error(err):
                raise
            if yielded_any or attempt >= max_retries or _is_daily_quota(err):
                logger.error(f"LLM rate limit, giving up after {attempt + 1} attempt(s): {describe_llm_error(err, llm_config)}")
                raise
            delay = _retry_delay_seconds(err, attempt)
            logger.warning(
                f"LLM rate limit (attempt {attempt + 1}/{max_retries + 1}), retrying in {delay:.1f}s: "
                f"{describe_llm_error(err, llm_config)}"
            )
            await asyncio.sleep(delay)
            attempt += 1


# This is for agent chat
async def generate_general_response(
    messages: List[Dict[str, Any]], llm_config: BaseLLMConfig
):
    if llm_config.model == "o4-mini":
        llm_config.temperature = 1.0
        llm_config.top_p = None

    llm_service = LLMService(config=llm_config)

    response_stream = await llm_service.chat_completion(
        conversations=messages,
        is_streaming=True
    )

    async for chunk in response_stream:
        if not chunk.choices:
            continue
        content = chunk.choices[0].delta.content
        if content is not None:
            yield content


# This is for general chat
async def generate_general_chat_response(
    messages: List[Dict[str, Any]], 
    model_name: str, 
    max_tokens: int = 1000,
    user_id: Optional[str] = None,
    feature: str = "chat",
    agent_id: Optional[str] = None
):

    # 1. Try to get the provider from your YAML config
    try:
        provider = get_model_provider(model_id=model_name)
    except ValueError:
        provider = None
        
    # --- CRITICAL FIX: Safe Fallback Routing ---
    # If the config file misses the model, prevent the Hugging Face crash
    if not provider or provider == "hugging_face":
        if "gemini" in model_name.lower():
            provider = "openai"  # Google's API uses the OpenAI client structure
        elif "llama" in model_name.lower():
            provider = "groq"
        else:
            provider = "openai"  # Ultimate safe default
    # -------------------------------------------

    # Resolve user's API key if user_id is provided
    api_key = None
    if user_id:
        import uuid
        from src.services.api_key_resolver import resolve_api_key
        try:
            api_key = await resolve_api_key(
                user_id=uuid.UUID(str(user_id)),
                provider=provider,
                feature=feature,
                specific_id=agent_id
            )
        except Exception as e:
            from loguru import logger
            logger.error(f"Failed to resolve custom API key for general chat: {e}")

    config_params = {
        "model": model_name,
        "provider": provider,
        "api_key": api_key,
    }

    if model_name == "o4-mini":
        config_params["temperature"] = 1.0
        config_params["top_p"] = None
    else:
        config_params["max_tokens"] = max_tokens

    llm_service = LLMService(
        config=BaseLLMConfig(**config_params)
    )

    response_stream = await llm_service.chat_completion(
        conversations=messages, is_streaming=True
    )

    async for chunk in response_stream:
        if not chunk.choices:
            continue
        content = chunk.choices[0].delta.content
        if content is not None:
            yield content

async def acreate_title_from_history(conversations: List[Dict[str, Any]]):
    """
    Create a title from the given conversation history
    """
    from src.core.settings import system_setting
    
    title_generation_prompt = "    You are an extremely smart and helpful title generator assistant. Given a conversation, extract the subject of the conversation. Crisp, informative, ten words or less."
    prepared_message = SYSTEM_PROMPTS[SystemPrompt.CHAT_TITLE_GENERATION].format(
        chat_history=conversations
    )
    llm_service = LLMService(
        BaseLLMConfig(
            model=system_setting.FAST_MODEL_ID,
            provider=system_setting.FAST_MODEL_PROVIDER,
        )
    )

    result = await llm_service.chat_completion(
        user_query=prepared_message,
        system_prompt=title_generation_prompt,
        is_streaming=False,
    )
    return result
