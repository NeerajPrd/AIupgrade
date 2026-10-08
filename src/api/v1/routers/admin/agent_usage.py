"""Admin-only conversation usage and chat cap management for published agents.

GET   /api/v1/admin/agent-usage                          - all agents with a published API
GET   /api/v1/admin/agents/{agent_id}/conversation-usage - one agent: monthly counts, since cap start, bracket
PATCH /api/v1/admin/agents/{agent_id}/chat-cap           - set or clear chat_cap / chat_cap_starts_at

See src/services/agents/conversation_usage.py for what counts as a new conversation.
"""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.routers.database.db_switch import require_admin
from src.core.database import get_db
from src.models.sql.agent_api import AgentAPI
from src.models.sql.models import Agent
from src.services.agents.conversation_usage import today_kathmandu, usage_summary

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


async def _get_agent(db: AsyncSession, agent_id: str) -> Agent:
    try:
        agent_uuid = UUID(agent_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="agent_id must be a UUID")
    agent = await db.get(Agent, agent_uuid)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.get("/agent-usage", operation_id="admin_list_agent_usage")
async def list_agent_usage(db: AsyncSession = Depends(get_db)):
    """Usage summary for every agent that has a published API (i.e. can be embedded as a widget)."""
    result = await db.execute(
        select(Agent, AgentAPI.slug).join(AgentAPI, AgentAPI.agent_id == Agent.id).order_by(Agent.name)
    )
    agents = []
    for agent, slug in result.all():
        summary = await usage_summary(db, agent)
        summary["slug"] = slug
        agents.append(summary)
    return {"agents": agents}


@router.get("/agents/{agent_id}/conversation-usage", operation_id="admin_get_agent_conversation_usage")
async def get_agent_conversation_usage(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await _get_agent(db, agent_id)
    return await usage_summary(db, agent)


class ChatCapUpdate(BaseModel):
    # Only fields present in the request body are changed. Send "chat_cap": null for unlimited.
    chat_cap: Optional[int] = Field(default=None, ge=0)
    chat_cap_starts_at: Optional[date] = None


@router.patch("/agents/{agent_id}/chat-cap", operation_id="admin_set_agent_chat_cap")
async def set_agent_chat_cap(agent_id: str, body: ChatCapUpdate, db: AsyncSession = Depends(get_db)):
    agent = await _get_agent(db, agent_id)
    fields = body.model_fields_set

    if "chat_cap" in fields:
        agent.chat_cap = body.chat_cap
    if "chat_cap_starts_at" in fields:
        agent.chat_cap_starts_at = body.chat_cap_starts_at
    # A cap with no start date would count every conversation ever; default to today instead.
    if agent.chat_cap is not None and agent.chat_cap_starts_at is None:
        agent.chat_cap_starts_at = today_kathmandu()

    await db.commit()
    return await usage_summary(db, agent)
