import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Lead(Base):
    """Contact details a website-widget visitor shared in one conversation (one row per conversation)."""

    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("history_id", name="uq_leads_history_id"),
        Index("ix_leads_agent_created", "agent_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    history_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agent_chat_histories.id", ondelete="CASCADE")
    )

    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    business_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    interest: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    # Last notification attempt. notify_status: 'sent' | 'failed' | 'skipped' | NULL (never attempted).
    notified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notify_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    notify_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
