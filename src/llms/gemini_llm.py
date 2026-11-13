from typing import Any, Dict, List, Optional

from src.llms.base import BaseLLM
from src.providers import gemini_client
from src.schemas.llm import BaseLLMConfig


class GeminiLLM(BaseLLM):
    """Gemini through the native API (works with both "AQ." and "AIza" keys).

    Inputs and outputs keep the OpenAI shapes the rest of the app uses; see
    src/providers/gemini_client.py for the translation.
    """

    def __init__(self, config: BaseLLMConfig):
        super().__init__(config)
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = gemini_client.aget_client(self.config.api_key)
        return self._client

    async def get_embeddings(self, text: str) -> List[float]:
        """Generate text embeddings using Gemini."""
        model = (
            self.config.model
            if self.config.model and "embedding" in self.config.model
            else gemini_client.DEFAULT_EMBEDDING_MODEL
        )
        # 1536 dimensions are requested explicitly because the pgvector schema hardcodes Vector(1536).
        return await gemini_client.embed(self.client, text, model=model)

    async def generate(
        self,
        messages: List[Dict[str, Any]],
        is_stream: bool = False,
        tools: Optional[List[Dict]] = None,
        response_format: Any = None,
        tool_choice: str = "auto",
        **kwargs,
    ):
        """
        Not streaming: the answer text, or {"content", "tool_calls"} when tools are given.
        Streaming: an async iterator of chunks with `.choices[0].delta.content`.
        """
        return await gemini_client.generate(
            self.client,
            model=self.config.model,
            messages=messages,
            stream=is_stream,
            temperature=self.config.temperature,
            top_p=self.config.top_p,
            max_tokens=self.config.max_tokens,
            tools=tools,
            tool_choice=tool_choice,
            response_format=response_format,
        )
