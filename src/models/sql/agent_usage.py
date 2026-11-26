import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AgentMonthlyUsage(Base):
    """What an agent's website chats cost in one UTC calendar month (Gemini tokens and estimated USD).

    The permanent record behind the Redis counter (src/services/spend/tracker.py). Costs are stored
    in nano-dollars (1e-9 USD) as integers so tiny per-message costs add up exactly.
    """

    __tablename__ = "agent_monthly_usage"
    __table_args__ = (UniqueConstraint("agent_id", "period", name="uq_agent_monthly_usage_agent_period"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    # 'YYYY-MM' in UTC.
    period: Mapped[str] = mapped_column(String(7))
    cost_nano_usd: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    requests: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    prompt_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    thinking_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    embed_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    alert_80_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    alert_100_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
