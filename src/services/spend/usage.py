"""Collects the Gemini token usage of one website chat request, and prices it.

The agent API endpoint opens a `UsageCollector` for the request (`collect_usage()`); the Gemini
client (src/providers/gemini_client.py) adds every call it makes while that collector is active:
chat replies (including streamed ones) and knowledge-base embeddings. Nothing is recorded when no
collector is active, so other features are unaffected.

Costs are integers in nano-dollars (1e-9 USD): a price of $0.30 per 1M tokens is 300 nano-USD
per token, so even single-message costs add up exactly.
"""

import contextvars
import math
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator, List, Optional

NANO_PER_USD = 1_000_000_000


@dataclass
class UsageEntry:
    kind: str  # "generate" | "embed"
    model: str
    prompt_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    embed_tokens: int = 0
    estimated: bool = False  # True when the API gave no token counts (embeddings on the Gemini API)


@dataclass
class UsageCollector:
    entries: List[UsageEntry] = field(default_factory=list)

    @property
    def prompt_tokens(self) -> int:
        return sum(e.prompt_tokens for e in self.entries)

    @property
    def output_tokens(self) -> int:
        return sum(e.output_tokens for e in self.entries)

    @property
    def thinking_tokens(self) -> int:
        return sum(e.thinking_tokens for e in self.entries)

    @property
    def embed_tokens(self) -> int:
        return sum(e.embed_tokens for e in self.entries)

    @property
    def calls(self) -> int:
        return len(self.entries)


_current: contextvars.ContextVar[Optional[UsageCollector]] = contextvars.ContextVar("gemini_usage", default=None)


@contextmanager
def collect_usage() -> Iterator[UsageCollector]:
    """Record Gemini usage made inside this block (and in tasks it starts) into a new collector."""
    collector = UsageCollector()
    token = _current.set(collector)
    try:
        yield collector
    finally:
        _current.reset(token)


def _count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def record_generate(model: str, usage_metadata: Any) -> None:
    """Add one generateContent call (Gemini usage_metadata) to the active collector, if any."""
    collector = _current.get()
    if collector is None or usage_metadata is None:
        return
    collector.entries.append(
        UsageEntry(
            kind="generate",
            model=model,
            prompt_tokens=_count(getattr(usage_metadata, "prompt_token_count", 0)),
            output_tokens=_count(getattr(usage_metadata, "candidates_token_count", 0)),
            thinking_tokens=_count(getattr(usage_metadata, "thoughts_token_count", 0)),
        )
    )


def estimate_embed_tokens(text: str) -> int:
    """The Gemini API returns no token count for embeddings: about 4 bytes of UTF-8 per token
    (so Nepali in Devanagari, 3 bytes a letter, counts as roughly one token per letter or two)."""
    return max(1, math.ceil(len((text or "").encode("utf-8")) / 4))


def record_embed(model: str, text: str, response: Any = None) -> None:
    """Add one embedding call to the active collector, if any. Uses the API's own count when given."""
    collector = _current.get()
    if collector is None:
        return
    tokens = _count(getattr(getattr(response, "usage_metadata", None), "prompt_token_count", 0))
    estimated = tokens == 0
    if estimated:
        tokens = estimate_embed_tokens(text)
    collector.entries.append(UsageEntry(kind="embed", model=model, embed_tokens=tokens, estimated=estimated))


@dataclass(frozen=True)
class Prices:
    """USD per 1 million tokens."""

    input_per_1m: float
    output_per_1m: float
    embed_per_1m: float

    @classmethod
    def from_settings(cls, settings=None) -> "Prices":
        if settings is None:
            from src.core.settings import system_setting as settings
        return cls(
            input_per_1m=float(settings.GEMINI_PRICE_INPUT_PER_1M),
            output_per_1m=float(settings.GEMINI_PRICE_OUTPUT_PER_1M),
            embed_per_1m=float(settings.GEMINI_PRICE_EMBED_PER_1M),
        )


def cost_nano_usd(collector: UsageCollector, prices: Prices) -> int:
    """Cost of everything in `collector`. Thinking tokens are billed at the output price."""
    per_token = 1000  # nano-USD per token for a price of $1 per 1M tokens (1e9 / 1e6)
    total = (
        collector.prompt_tokens * prices.input_per_1m
        + (collector.output_tokens + collector.thinking_tokens) * prices.output_per_1m
        + collector.embed_tokens * prices.embed_per_1m
    ) * per_token
    return int(round(total))


def nano_to_usd(nano: int) -> float:
    return round((nano or 0) / NANO_PER_USD, 6)


def usd_to_nano(usd: float) -> int:
    return int(round(float(usd) * NANO_PER_USD))
