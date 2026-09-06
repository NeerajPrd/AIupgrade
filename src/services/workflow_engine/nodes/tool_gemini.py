import json
import asyncio
import random
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from loguru import logger

from src.services.workflow_engine.nodes.base import BaseNode, NodeExecutionError, ConnectionError, ensure_string
from src.services.workflow_engine.context import ExecutionContext
from src.models.sql.workflow.connection import Connection
from src.core.encryption import crypto
from src.services.workflow.cost_tracking import CostCalculator


# MODEL CONFIGURATION

@dataclass(frozen=True)
class GeminiModelConfig:
    """Configuration for a Gemini model."""
    name: str
    display_name: str
    context_window: int
    max_output_tokens: int
    supports_json: bool = True
    supports_system_instruction: bool = True
    rate_limit_rpm: int = 60


GEMINI_MODELS: Dict[str, GeminiModelConfig] = {
    "gemini-2.5-pro": GeminiModelConfig(
        name="gemini-2.5-pro",
        display_name="Gemini 2.5 Pro",
        context_window=1_000_000,
        max_output_tokens=65_536,
        rate_limit_rpm=60
    ),
    "gemini-2.5-flash": GeminiModelConfig(
        name="gemini-2.5-flash",
        display_name="Gemini 2.5 Flash",
        context_window=1_000_000,
        max_output_tokens=65_536,
        rate_limit_rpm=1000
    ),
    "gemini-2.0-flash": GeminiModelConfig(
        name="gemini-2.0-flash",
        display_name="Gemini 2.0 Flash",
        context_window=1_000_000,
        max_output_tokens=8_192,
        rate_limit_rpm=1500
    ),
    "gemini-2.0-flash-lite": GeminiModelConfig(
        name="gemini-2.0-flash-lite",
        display_name="Gemini 2.0 Flash Lite",
        context_window=1_000_000,
        max_output_tokens=8_192,
        rate_limit_rpm=2000
    ),
    "gemini-1.5-pro": GeminiModelConfig(
        name="gemini-1.5-pro",
        display_name="Gemini 1.5 Pro (Legacy)",
        context_window=2_000_000,
        max_output_tokens=8_192,
        rate_limit_rpm=60
    ),
    "gemini-2.0-flash-lite": GeminiModelConfig(
        name="gemini-2.0-flash-lite",
        display_name="Gemini 2.0 Flash Lite",
        context_window=1_000_000,
        max_output_tokens=8_192,
        rate_limit_rpm=1000
    ),
}

DEFAULT_FALLBACK_CHAIN = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash-lite",
]


# RETRY CONFIGURATION

@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0
    jitter: bool = True

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt with exponential backoff."""
        delay = min(
            self.base_delay * (self.exponential_base ** (attempt - 1)),
            self.max_delay
        )
        if self.jitter:
            delay *= (0.5 + random.random())
        return delay


FALLBACK_ERRORS = [
    "model not found",
    "model is not available",
    "model has been deprecated",
    "quota exceeded",
    "resource exhausted",
    "429",
    "503",
]

RETRY_ERRORS = [
    "rate limit",
    "timeout",
    "temporarily unavailable",
    "internal error",
    "500",
    "502",
    "504",
]


# USAGE TRACKING

@dataclass
class GeminiUsage:
    """Token usage from Gemini API response."""
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_usd: str = "0"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "cost_usd": self.cost_usd
        }

    def add(self, other: "GeminiUsage") -> None:
        """Add another usage to this one."""
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.total_tokens = self.input_tokens + self.output_tokens


# GEMINI NODE IMPLEMENTATION

class GeminiNode(BaseNode):
    """
    Google Gemini Node with Cost Tracking.

    Features:
    - Automatic model fallback when primary model fails
    - Retry logic with exponential backoff
    - Token usage tracking for billing
    - Support for structured JSON output
    - System instruction support
    """

    node_type = "geminiNode"

    @classmethod
    def get_manifest(cls) -> Dict[str, Any]:
        model_options = [m.name for m in GEMINI_MODELS.values()]

        return {
            "type": cls.node_type,
            "display_name": "Google Gemini",
            "icon": "Sparkles",
            "category": "AI & Data",
            "description": "Powerful reasoning with automatic model fallback.",
            "fields": [
                {
                    "name": "connection_id",
                    "label": "Gemini Connection",
                    "type": "connection_select",
                    "required": True,
                    "provider": "GOOGLE"
                },
                {
                    "name": "model",
                    "label": "Preferred Model",
                    "type": "select",
                    "options": model_options,
                    "default": "gemini-2.5-flash",
                    "helper": "Will fallback to other models if unavailable"
                },
                {
                    "name": "prompt",
                    "label": "Prompt",
                    "type": "textarea",
                    "placeholder": "Enter your prompt or use {{variables}}...",
                    "required": True
                },
                {
                    "name": "system_instruction",
                    "label": "System Instruction",
                    "type": "textarea",
                    "placeholder": "Optional: Set the AI's behavior and context",
                    "helper": "Define the AI's role and response style"
                },
                {
                    "name": "temperature",
                    "label": "Temperature",
                    "type": "slider",
                    "min": 0,
                    "max": 2,
                    "step": 0.1,
                    "default": 0.7,
                    "helper": "0 = deterministic, 2 = creative"
                },
                {
                    "name": "max_output_tokens",
                    "label": "Max Output Tokens",
                    "type": "number",
                    "default": 4096
                },
                {
                    "name": "enable_fallback",
                    "label": "Enable Model Fallback",
                    "type": "boolean",
                    "default": True,
                    "helper": "Try alternative models if primary fails"
                },
                {
                    "name": "json_mode",
                    "label": "JSON Output Mode",
                    "type": "boolean",
                    "default": False,
                    "helper": "Force structured JSON response"
                }
            ],
            "outputs": ["output_text", "model", "fallback_used", "attempts", "status", "usage"],
            "outputs_schema": {
                "output_text": {"type": "string", "description": "Generated text response"},
                "model": {"type": "string", "description": "Model that was used"},
                "fallback_used": {"type": "boolean", "description": "Whether fallback was used"},
                "attempts": {"type": "number", "description": "Number of API attempts"},
                "status": {"type": "string", "description": "Execution status"},
                "usage": {"type": "object", "description": "Token usage and cost"}
            }
        }

    async def execute(
            self,
            db: AsyncSession,
            context: ExecutionContext,
            input_data: Dict[str, Any],
            node_id: str = None
    ) -> Dict[str, Any]:
        """
        Executes Gemini reasoning with fallback and usage tracking.

        The returned 'usage' field is automatically extracted by the executor
        for cost aggregation and billing.
        """
        # 1. Get Configuration
        connection_id = input_data.get("connection_id")
        user_prompt = ensure_string(input_data.get("prompt", ""))
        preferred_model = input_data.get("model", "gemini-2.5-flash")
        system_instruction = input_data.get("system_instruction")
        if system_instruction is not None:
            system_instruction = ensure_string(system_instruction)
        temperature = float(input_data.get("temperature", 0.7))
        max_tokens = int(input_data.get("max_output_tokens", 4096))
        enable_fallback = input_data.get("enable_fallback", True)
        json_mode = input_data.get("json_mode", False)

        # Validate inputs
        if not user_prompt:
            raise NodeExecutionError(
                message="Gemini Node requires a 'prompt'",
                node_type=self.node_type,
                retryable=False
            )

        # 2. Fetch credentials
        api_key = await self._get_api_key(db, connection_id, context)

        # 3. Build model chain
        models_to_try = self._build_model_chain(preferred_model, enable_fallback)

        # 4. Try models with fallback
        last_error = None
        total_attempts = 0
        fallback_used = False
        total_usage = GeminiUsage()

        for model_name in models_to_try:
            model_config = GEMINI_MODELS.get(model_name)
            if not model_config:
                continue

            effective_max_tokens = min(max_tokens, model_config.max_output_tokens)

            result, attempts, error, usage = await self._try_model_with_retry(
                api_key=api_key,
                model_name=model_name,
                prompt=user_prompt,
                system_instruction=system_instruction,
                temperature=temperature,
                max_tokens=effective_max_tokens,
                json_mode=json_mode
            )

            total_attempts += attempts
            total_usage.add(usage)

            if result is not None:
                # Calculate final cost
                cost = CostCalculator.calculate(
                    provider="gemini",
                    model=model_name,
                    input_tokens=total_usage.input_tokens,
                    output_tokens=total_usage.output_tokens
                )
                total_usage.cost_usd = str(cost)

                return {
                    "status": "success",
                    "model": model_name,
                    "output_text": result,
                    "fallback_used": model_name != preferred_model,
                    "attempts": total_attempts,
                    "preferred_model": preferred_model,
                    "usage": total_usage.to_dict()  # Auto-extracted by executor
                }

            last_error = error
            if model_name != preferred_model:
                fallback_used = True

            if not self._should_fallback(error):
                break

            logger.warning(f"Model {model_name} failed, trying next in fallback chain")

        # All models failed
        raise NodeExecutionError(
            message=f"All models failed. Last error: {last_error}",
            node_type=self.node_type,
            retryable=False,
            details={
                "attempted_models": models_to_try,
                "total_attempts": total_attempts,
                "last_error": str(last_error),
                "usage": total_usage.to_dict()
            }
        )

    async def _get_api_key(self, db: AsyncSession, connection_id: Optional[str], context: ExecutionContext) -> str:
        """Fetches and decrypts API key from connection or falls back to resolved user config / system-wide setting."""
        api_key = None

        if connection_id:
            import uuid
            try:
                # Try to parse as UUID to fetch from Connection table
                uid = uuid.UUID(connection_id)
                result = await db.execute(
                    select(Connection).where(Connection.id == str(uid))
                )
                connection = result.scalars().first()

                if connection:
                    try:
                        decrypted_json = crypto.decrypt(connection.encrypted_credentials)
                        creds = json.loads(decrypted_json)
                        api_key = creds.get("api_key")
                    except Exception as e:
                        logger.warning(f"Failed to decrypt connection credentials: {e}")
            except ValueError:
                # If connection_id is not a valid UUID, treat it as a raw API key
                api_key = connection_id

        # Fallback to resolved key if no connection or decryption failed
        if not api_key:
            from src.services.api_key_resolver import resolve_api_key
            try:
                api_key = await resolve_api_key(
                    user_id=context.user_id,
                    provider="gemini",
                    feature="workflow"
                )
            except Exception as e:
                logger.error(f"Failed to resolve API key for provider 'gemini': {e}")

        if not api_key:
            raise ConnectionError(
                message="Failed to resolve Gemini API key from connection, custom model config, or system-wide .env setting.",
                node_type=self.node_type,
                provider="google"
            )

        return api_key

    def _build_model_chain(
            self,
            preferred_model: str,
            enable_fallback: bool
    ) -> List[str]:
        """Builds the ordered list of models to try."""
        if not enable_fallback:
            return [preferred_model]

        chain = [preferred_model]

        for model in DEFAULT_FALLBACK_CHAIN:
            if model not in chain and model in GEMINI_MODELS:
                chain.append(model)

        return chain

    async def _try_model_with_retry(
            self,
            api_key: str,
            model_name: str,
            prompt: str,
            system_instruction: Optional[str],
            temperature: float,
            max_tokens: int,
            json_mode: bool
    ) -> Tuple[Optional[str], int, Optional[Exception], GeminiUsage]:
        """
        Tries a model with retry logic.

        Returns:
            Tuple of (result, attempts, last_error, usage)
        """
        retry_config = RetryConfig()
        last_error = None
        total_usage = GeminiUsage()

        for attempt in range(1, retry_config.max_retries + 1):
            try:
                result, usage = await self._call_gemini(
                    api_key=api_key,
                    model_name=model_name,
                    prompt=prompt,
                    system_instruction=system_instruction,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    json_mode=json_mode
                )

                total_usage.add(usage)
                return result, attempt, None, total_usage

            except Exception as e:
                last_error = e
                error_str = str(e).lower()

                if not self._should_retry(error_str):
                    return None, attempt, e, total_usage

                if attempt < retry_config.max_retries:
                    delay = retry_config.get_delay(attempt)
                    logger.warning(
                        f"Gemini API error (attempt {attempt}): {e}. "
                        f"Retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)

        return None, retry_config.max_retries, last_error, total_usage

    async def _call_gemini(
            self,
            api_key: str,
            model_name: str,
            prompt: str,
            system_instruction: Optional[str],
            temperature: float,
            max_tokens: int,
            json_mode: bool
    ) -> Tuple[str, GeminiUsage]:
        """
        Makes the actual API call to Gemini.

        Returns:
            Tuple of (response_text, usage)
        """
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            raise NodeExecutionError(
                message="google-genai package not installed",
                node_type=self.node_type,
                retryable=False
            )

        client = genai.Client(api_key=api_key)

        config_kwargs = {
            "temperature": temperature,
            "max_output_tokens": max_tokens,
        }

        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction

        if json_mode:
            config_kwargs["response_mime_type"] = "application/json"

        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(**config_kwargs)
        )

        # Extract text
        text = ""
        if response.candidates and response.candidates[0].content:
            parts = response.candidates[0].content.parts
            text = "".join(part.text for part in parts if hasattr(part, 'text'))

        # Extract usage metadata
        usage = GeminiUsage()
        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            usage.input_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
            usage.output_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
            usage.total_tokens = usage.input_tokens + usage.output_tokens

            cost = CostCalculator.calculate(
                provider="gemini",
                model=model_name,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens
            )
            usage.cost_usd = str(cost)

            logger.debug(
                f"Gemini usage: {usage.input_tokens} in, {usage.output_tokens} out, ${usage.cost_usd}"
            )

        return text, usage

    def _should_retry(self, error_str: str) -> bool:
        """Determines if an error should trigger a retry."""
        return any(err in error_str for err in RETRY_ERRORS)

    def _should_fallback(self, error: Exception) -> bool:
        """Determines if an error should trigger model fallback."""
        error_str = str(error).lower()
        return any(err in error_str for err in FALLBACK_ERRORS)