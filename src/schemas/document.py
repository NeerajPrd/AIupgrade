import json
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from typing import Dict, Optional, Any, List
from uuid import uuid4


class Document(BaseModel):
    """Document model using Pydantic v2 with timezone-aware datetime"""

    id: str = Field(default_factory=lambda: str(uuid4()))
    content: str
    name: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    embedding: Optional[list[float]] = None

    def add_metadata(self, key: str, value: str) -> None:
        """Add metadata key-value pair to the document."""
        self.metadata[key] = value

    def summary(self, chars: int = 200) -> str:
        """Return a short summary of the content."""
        return (
            self.content[:chars] + "..." if len(self.content) > chars else self.content
        )

    def model_dump(self, *args, **kwargs) -> Dict:
        """Dump the model as a dictionary using Pydantic v2's model_dump."""
        return self.model_dump(*args, **kwargs)

    def model_dump_json(self, *args, **kwargs) -> str:
        """Dump the model as a JSON string using Pydantic v2's model_dump_json."""
        return self.model_dump_json(*args, **kwargs)

    @classmethod
    def from_dict(cls, data: Dict) -> "Document":
        """Create an instance from a dictionary."""
        return cls.model_validate(data)

    @classmethod
    def from_json(cls, json_str: str) -> "Document":
        """Create an instance from a JSON string."""
        data = json.loads(json_str)
        return cls.model_validate(data)

    def update_embedding(self, embedding: list) -> None:
        """Update the embedding of the document."""
        self.embedding = embedding


class PageData(BaseModel):
    content: str
    metadata: Dict[str, Any]


class ProcessedDocument(BaseModel):
    status: str
    filename: str
    data: Optional[List[PageData]] = None
    error: Optional[Any] = None
