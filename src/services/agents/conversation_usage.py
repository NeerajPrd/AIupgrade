"""Counting "new conversations" per agent for the widget / public agent API.

A counted conversation is an agent_chat_histories row that
  * belongs to the agent,
  * was created through the public agent API (source == 'agent_api'), and
  * has at least one assistant reply.

Follow-up messages append to an existing row, so they are never counted again.
A first message that failed before the agent replied leaves a row with no
assistant reply, so a retry is not double counted either. Rows the owner
soft-deletes still count.

Calendar months and cap start dates are interpreted in Asia/Kathmandu time.
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, Iterable, Optional

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.sql.models import AgentChat, AgentChatHistory

SOURCE_AGENT_API = "agent_api"

# Nepal has no DST, so a fixed offset is exact and avoids a tzdata dependency.
KATHMANDU_TZ = timezone(timedelta(hours=5, minutes=45), "Asia/Kathmandu")

# (inclusive upper bound, label); anything above the last bound is "over 900".
BRACKETS = [(200, "up to 200"), (400, "201 to 400"), (900, "401 to 900")]
TOP_BRACKET = "over 900"


def bracket_for(count: int) -> str:
    for upper, label in BRACKETS:
        if count <= upper:
            return label
    return TOP_BRACKET


def is_cap_reached(chat_cap: Optional[int], used: int) -> bool:
    """NULL cap means unlimited."""
    return chat_cap is not None and used >= chat_cap


def today_kathmandu() -> date:
    return datetime.now(KATHMANDU_TZ).date()


def start_of_day_kathmandu(day: date) -> datetime:
    """Midnight Asia/Kathmandu on `day`, as an aware datetime (compares correctly with UTC columns)."""
    return datetime.combine(day, time.min, tzinfo=KATHMANDU_TZ)


def month_key(ts: datetime) -> str:
    """'YYYY-MM' of `ts` in Asia/Kathmandu. Naive timestamps are treated as UTC."""
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(KATHMANDU_TZ).strftime("%Y-%m")


def bucket_by_month(timestamps: Iterable[datetime]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for ts in timestamps:
        key = month_key(ts)
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _counted_conditions(agent_id: uuid.UUID) -> list:
    has_assistant_reply = exists(
        select(AgentChat.id).where(
            AgentChat.history_id == AgentChatHistory.id,
            AgentChat.role == "assistant",
        )
    )
    return [
        AgentChatHistory.agent_id == agent_id,
        AgentChatHistory.source == SOURCE_AGENT_API,
        has_assistant_reply,
    ]


async def count_new_conversations(
    db: AsyncSession, agent_id: uuid.UUID, since: Optional[date] = None
) -> int:
    """Counted conversations for the agent, optionally only those created on/after `since` (Kathmandu)."""
    conditions = _counted_conditions(agent_id)
    if since is not None:
        conditions.append(AgentChatHistory.created_at >= start_of_day_kathmandu(since))
    result = await db.execute(select(func.count()).select_from(AgentChatHistory).where(*conditions))
    return int(result.scalar() or 0)


async def monthly_counts(db: AsyncSession, agent_id: uuid.UUID) -> Dict[str, int]:
    """Counted conversations per Kathmandu calendar month, e.g. {'2026-10': 57}."""
    result = await db.execute(
        select(AgentChatHistory.created_at).where(*_counted_conditions(agent_id))
    )
    return bucket_by_month(result.scalars().all())


async def conversation_belongs_to_agent(
    db: AsyncSession, conversation_id: str, agent_id: uuid.UUID
) -> bool:
    """True if `conversation_id` is an existing, non-deleted thread of this agent that the API may continue.

    Rows created before the source column existed (source IS NULL) are accepted so
    conversations already open in a visitor's browser at deploy time can finish.
    """
    try:
        history_uuid = uuid.UUID(str(conversation_id))
    except (ValueError, TypeError):
        return False
    result = await db.execute(
        select(AgentChatHistory.id).where(
            AgentChatHistory.id == history_uuid,
            AgentChatHistory.agent_id == agent_id,
            AgentChatHistory.is_deleted.is_not(True),
            or_(AgentChatHistory.source == SOURCE_AGENT_API, AgentChatHistory.source.is_(None)),
        )
    )
    return result.scalar_one_or_none() is not None


async def usage_summary(db: AsyncSession, agent) -> dict:
    """Everything the admin endpoint and CLI script report for one agent."""
    months = await monthly_counts(db, agent.id)
    since_cap = await count_new_conversations(db, agent.id, agent.chat_cap_starts_at)
    current_month = datetime.now(KATHMANDU_TZ).strftime("%Y-%m")
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "chat_cap": agent.chat_cap,
        "chat_cap_starts_at": agent.chat_cap_starts_at.isoformat() if agent.chat_cap_starts_at else None,
        "since_cap_start": since_cap,
        "since_cap_start_bracket": bracket_for(since_cap),
        "cap_reached": is_cap_reached(agent.chat_cap, since_cap),
        "current_month": current_month,
        "current_month_count": months.get(current_month, 0),
        "monthly": [
            {"month": m, "count": n, "bracket": bracket_for(n)} for m, n in months.items()
        ],
        "timezone": "Asia/Kathmandu",
    }
