"""Admin-only: what each agent's website chats cost this month, against its budget.

GET /api/v1/admin/agent-spend?month=YYYY-MM       - every agent with a published API (default: this UTC month)
GET /api/v1/admin/agents/{agent_id}/spend          - one agent, this UTC month

Spend is estimated from Gemini token counts and the GEMINI_PRICE_* settings; see src/services/spend.
"""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.routers.admin.agent_usage import _get_agent
from src.api.v1.routers.database.db_switch import require_admin
from src.core.database import get_db
from src.core.settings import system_setting
from src.models.sql.agent_api import AgentAPI
from src.models.sql.agent_usage import AgentMonthlyUsage
from src.models.sql.models import Agent
from src.services.spend.tracker import budget_usd, percent_used, period_utc
from src.services.spend.usage import nano_to_usd, usd_to_nano

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


def spend_summary(agent, row: Optional[AgentMonthlyUsage], period: str, spent_nano: Optional[int] = None) -> dict:
    spent = int(spent_nano if spent_nano is not None else (row.cost_nano_usd if row else 0))
    budget = budget_usd(agent, system_setting.DEFAULT_AGENT_MONTHLY_BUDGET_USD)
    budget_nano = usd_to_nano(budget)
    iso = lambda ts: ts.isoformat() if ts else None  # noqa: E731
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "period": period,
        "spend_usd": nano_to_usd(spent),
        "budget_usd": round(budget, 4),
        "budget_is_default": getattr(agent, "monthly_budget_usd", None) is None,
        "percent_used": percent_used(spent, budget_nano),
        "over_budget": spent >= budget_nano,
        "requests": row.requests if row else 0,
        "prompt_tokens": row.prompt_tokens if row else 0,
        "output_tokens": row.output_tokens if row else 0,
        "thinking_tokens": row.thinking_tokens if row else 0,
        "embed_tokens": row.embed_tokens if row else 0,
        "alert_80_sent_at": iso(row.alert_80_sent_at) if row else None,
        "alert_100_sent_at": iso(row.alert_100_sent_at) if row else None,
    }


@router.get("/agent-spend", operation_id="admin_list_agent_spend")
async def list_agent_spend(
    month: Optional[str] = Query(default=None, description="'YYYY-MM' in UTC; default this month"),
    db: AsyncSession = Depends(get_db),
):
    period = month or period_utc()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
        raise HTTPException(status_code=422, detail="month must look like 2026-11")
    agents = (await db.execute(
        select(Agent).join(AgentAPI, AgentAPI.agent_id == Agent.id).order_by(Agent.name)
    )).scalars().all()
    rows = {
        r.agent_id: r for r in (await db.execute(
            select(AgentMonthlyUsage).where(AgentMonthlyUsage.period == period)
        )).scalars().all()
    }
    items = [spend_summary(a, rows.get(a.id), period) for a in agents]
    return {
        "period": period,
        "timezone": "UTC",
        "total_spend_usd": round(sum(i["spend_usd"] for i in items), 6),
        "prices_per_1m_tokens_usd": {
            "input": system_setting.GEMINI_PRICE_INPUT_PER_1M,
            "output": system_setting.GEMINI_PRICE_OUTPUT_PER_1M,
            "embedding": system_setting.GEMINI_PRICE_EMBED_PER_1M,
        },
        "agents": items,
    }


@router.get("/agents/{agent_id}/spend", operation_id="admin_get_agent_spend")
async def get_agent_spend(agent_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    agent = await _get_agent(db, agent_id)
    period = period_utc()
    row = (await db.execute(
        select(AgentMonthlyUsage).where(AgentMonthlyUsage.agent_id == agent.id, AgentMonthlyUsage.period == period)
    )).scalar_one_or_none()
    return spend_summary(agent, row, period)
