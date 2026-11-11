import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AgentMonthlyReport(Base):
    """One row per agent per month: proof that the monthly client report was handled (never sent twice)."""

    __tablename__ = "agent_monthly_reports"
    __table_args__ = (UniqueConstraint("agent_id", "period", name="uq_agent_monthly_reports_agent_period"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    # Calendar month in Asia/Kathmandu, 'YYYY-MM'.
    period: Mapped[str] = mapped_column(String(7))
    # 'sending' | 'sent' | 'failed' | 'skipped' (no conversations that month).
    status: Mapped[str] = mapped_column(String(16))
    attempts: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    conversations: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    leads: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
