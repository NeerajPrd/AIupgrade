from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime


class BaseLLMConfig(BaseModel):
    model: str
    max_tokens: Optional[int] = None
    provider: Literal["openai", "hugging_face", "groq", "anthropic", "localhost", "gemini", "perplexity", "ollama"]
    temperature: Optional[float] = 0.1
    top_p: Optional[float] = 0.1
    api_key: Optional[str] = None
    # Gemini 2.5 only: tokens the model may spend thinking (counts toward max_tokens). None = model default.
    thinking_budget: Optional[int] = None


class LLMModelConfigCreate(BaseModel):
    name: str
    provider: Literal["openai", "hugging_face", "groq", "anthropic", "localhost", "gemini", "perplexity", "ollama"]
    model_id: Optional[str] = None
    api_key: Optional[str] = None
    features: Optional[List[Literal["chat", "agents", "workflow", "vibe_coder"]]] = Field(default_factory=list)
    agent_ids: Optional[List[str]] = Field(default_factory=list)
    workflow_ids: Optional[List[str]] = Field(default_factory=list)


class LLMModelConfigUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[Literal["openai", "hugging_face", "groq", "anthropic", "localhost", "gemini", "perplexity", "ollama"]]
    model_id: Optional[str] = None
    api_key: Optional[str] = None
    features: Optional[List[Literal["chat", "agents", "workflow", "vibe_coder"]]] = None
    agent_ids: Optional[List[str]] = None
    workflow_ids: Optional[List[str]] = None


class LLMModelConfigResponse(BaseModel):
    id: str
    name: str
    provider: str
    model_id: Optional[str] = None
    masked_api_key: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    agent_ids: List[str] = Field(default_factory=list)
    workflow_ids: List[str] = Field(default_factory=list)
    is_enabled: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
