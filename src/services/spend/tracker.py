"""Per-agent monthly spend: budget checks, recording, and 80% / 100% alerts.

Storage
  * Postgres (agent_monthly_usage) is the permanent record. Each chat adds its cost with one
    atomic `INSERT ... ON CONFLICT DO UPDATE SET cost = cost + ...`, which also returns the new
    monthly total, so concurrent requests and several web workers never lose an increment.
  * Redis (through the app cache, `app.state.cache`) holds that total for the fast check made
    before every chat. It is overwritten with the database total after every write, and rebuilt
    from the database if it is missing (e.g. after a Redis restart).

Months are UTC calendar months ('YYYY-MM'). A request that starts under budget may finish slightly
over it; the next request is then blocked.
"""

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol

from loguru import logger

from src.services.spend.usage import UsageCollector, nano_to_usd, usd_to_nano

CACHE_TTL_S = 40 * 24 * 3600
ALERT_LEVELS = (80, 100)


def period_utc(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m")


def cache_key(agent_id, period: str) -> str:
    return f"agent_spend:{agent_id}:{period}"


def budget_usd(agent: Any, default_usd: float) -> float:
    value = getattr(agent, "monthly_budget_usd", None)
    return float(value) if value is not None else float(default_usd)


def percent_used(spent_nano: int, budget_nano: int) -> float:
    if budget_nano <= 0:
        return 100.0
    return round(100.0 * spent_nano / budget_nano, 1)


def levels_reached(spent_nano: int, budget_nano: int) -> List[int]:
    """Alert levels (80, 100) this spend has reached."""
    if budget_nano <= 0:
        return list(ALERT_LEVELS)
    return [level for level in ALERT_LEVELS if spent_nano * 100 >= budget_nano * level]


class SpendStore(Protocol):
    async def get_cost(self, agent_id: uuid.UUID, period: str) -> int: ...
    async def add(self, agent_id: uuid.UUID, period: str, cost_nano: int, collector: UsageCollector) -> int: ...
    async def claim_alert(self, agent_id: uuid.UUID, period: str, level: int) -> bool: ...
    async def release_alert(self, agent_id: uuid.UUID, period: str, level: int) -> None: ...


# send(recipients, subject, html) -> True if sent, False if skipped (SMTP not configured). Raises on failure.
AlertSender = Callable[[List[str], str, str], Awaitable[bool]]


@dataclass
class SpendTracker:
    store: SpendStore
    cache: Any = None
    default_budget_usd: float = 3.0
    alert_email: str = ""

    def budget_nano(self, agent: Any) -> int:
        return usd_to_nano(budget_usd(agent, self.default_budget_usd))

    async def spent_nano(self, agent_id: uuid.UUID, period: Optional[str] = None) -> int:
        period = period or period_utc()
        key = cache_key(agent_id, period)
        if self.cache is not None:
            try:
                cached = await self.cache.get(key)
                if cached is not None:
                    return int(cached)
            except Exception as err:  # Redis down: fall back to the database
                logger.warning("Spend cache read failed ({}); using the database.", type(err).__name__)
        total = await self.store.get_cost(agent_id, period)
        await self._cache_set(key, total)
        return total

    async def is_over_budget(self, agent: Any, period: Optional[str] = None) -> bool:
        return await self.spent_nano(agent.id, period) >= self.budget_nano(agent)

    async def record(self, agent: Any, collector: UsageCollector, cost_nano: int, period: Optional[str] = None) -> int:
        """Add this request's usage; returns the agent's new monthly total (nano-USD)."""
        period = period or period_utc()
        total = await self.store.add(agent.id, period, cost_nano, collector)
        await self._cache_set(cache_key(agent.id, period), total)
        return total

    async def _cache_set(self, key: str, total: int) -> None:
        if self.cache is None:
            return
        try:
            await self.cache.set(key, int(total), ttl_s=CACHE_TTL_S)
        except Exception as err:
            logger.warning("Spend cache write failed ({}).", type(err).__name__)

    async def send_alerts(self, agent: Any, spent_nano: int, send: AlertSender, period: Optional[str] = None) -> Optional[int]:
        """Email the alert address once per level per month. Returns the level emailed, if any.

        Both levels reached at once (e.g. one expensive chat) are claimed together and reported in
        one email about the higher level. A level whose email could not be sent is released, so the
        next chat tries again.
        """
        period = period or period_utc()
        budget = self.budget_nano(agent)
        claimed = [level for level in levels_reached(spent_nano, budget)
                   if await self.store.claim_alert(agent.id, period, level)]
        if not claimed:
            return None
        level = max(claimed)
        recipients = [self.alert_email] if self.alert_email else []
        try:
            if not recipients:
                raise RuntimeError("SPIRIT_MONKEY_ALERT_EMAIL is not set")
            subject, html = alert_email(agent, period, level, spent_nano, budget)
            if not await send(recipients, subject, html):
                raise RuntimeError("SMTP is not configured")
            logger.info("Budget alert {}% sent for agent {} ({})", level, agent.id, period)
            return level
        except Exception as err:
            logger.error("Budget alert {}% for agent {} not sent: {}", level, agent.id, err)
            for lvl in claimed:
                await self.store.release_alert(agent.id, period, lvl)
            return None


def alert_email(agent: Any, period: str, level: int, spent_nano: int, budget_nano: int):
    from html import escape

    from src.services.leads.email_template import BRAND, FONT_STACK

    name = getattr(agent, "name", None) or str(agent.id)
    spent, budget = nano_to_usd(spent_nano), nano_to_usd(budget_nano)
    pct = percent_used(spent_nano, budget_nano)
    if level >= 100:
        subject = f"Budget used up: {name} ({period})"
        what = ("The assistant has reached its monthly budget. Website visitors now get the "
                "\"assistant unavailable\" message with the client's contact details instead of AI answers, "
                "until the budget is raised or the month ends (UTC). Leads are still captured.")
    else:
        subject = f"Budget 80% used: {name} ({period})"
        what = "The assistant has used 80% of its monthly budget. At 100% it stops calling the AI model."
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:{FONT_STACK};color:#202124;">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;">
<tr><td style="background:#1858e4;color:#fff;padding:16px 22px;font-weight:600;font-size:17px;">{BRAND}</td></tr>
<tr><td style="padding:22px;">
<h1 style="font-size:19px;margin:0 0 10px 0;">{escape(subject)}</h1>
<p style="margin:0 0 14px 0;color:#5f6368;">{escape(what)}</p>
<table role="presentation" style="border-collapse:collapse;font-size:14px;">
<tr><td style="padding:4px 14px 4px 0;color:#5f6368;">Assistant</td><td><strong>{escape(name)}</strong></td></tr>
<tr><td style="padding:4px 14px 4px 0;color:#5f6368;">Month (UTC)</td><td>{escape(period)}</td></tr>
<tr><td style="padding:4px 14px 4px 0;color:#5f6368;">Spent</td><td>${spent:.4f} of ${budget:.2f} ({pct}%)</td></tr>
</table>
<p style="margin:16px 0 0 0;color:#5f6368;font-size:13px;">Change the budget in the dashboard: Leads, choose the assistant, Assistant settings.</p>
</td></tr></table></body></html>"""
    return subject, html


class SqlSpendStore:
    """SpendStore over PostgreSQL. Each call uses its own short session."""

    def __init__(self, postgres_manager):
        self._pm = postgres_manager

    async def get_cost(self, agent_id, period):
        from sqlalchemy import select

        from src.models.sql.agent_usage import AgentMonthlyUsage as Row

        async with self._pm.get_session() as session:
            value = (await session.execute(
                select(Row.cost_nano_usd).where(Row.agent_id == agent_id, Row.period == period)
            )).scalar_one_or_none()
            return int(value or 0)

    async def add(self, agent_id, period, cost_nano, collector):
        from sqlalchemy.dialects.postgresql import insert

        from src.models.sql.agent_usage import AgentMonthlyUsage as Row

        now = datetime.now(timezone.utc)
        values = dict(
            cost_nano_usd=int(cost_nano), requests=1, prompt_tokens=collector.prompt_tokens,
            output_tokens=collector.output_tokens, thinking_tokens=collector.thinking_tokens,
            embed_tokens=collector.embed_tokens,
        )
        stmt = insert(Row).values(id=uuid.uuid4(), agent_id=agent_id, period=period, created_at=now, updated_at=now, **values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_agent_monthly_usage_agent_period",
            set_={**{k: getattr(Row, k) + getattr(stmt.excluded, k) for k in values}, "updated_at": now},
        ).returning(Row.cost_nano_usd)
        async with self._pm.get_session() as session:
            total = (await session.execute(stmt)).scalar_one()
            await session.commit()
            return int(total)

    async def claim_alert(self, agent_id, period, level):
        from sqlalchemy import update

        from src.models.sql.agent_usage import AgentMonthlyUsage as Row

        column = Row.alert_100_sent_at if level >= 100 else Row.alert_80_sent_at
        async with self._pm.get_session() as session:
            claimed = (await session.execute(
                update(Row)
                .where(Row.agent_id == agent_id, Row.period == period, column.is_(None))
                .values({column.key: datetime.now(timezone.utc)})
                .returning(Row.id)
            )).first() is not None
            await session.commit()
            return claimed

    async def release_alert(self, agent_id, period, level):
        from sqlalchemy import update

        from src.models.sql.agent_usage import AgentMonthlyUsage as Row

        column = Row.alert_100_sent_at if level >= 100 else Row.alert_80_sent_at
        async with self._pm.get_session() as session:
            await session.execute(
                update(Row).where(Row.agent_id == agent_id, Row.period == period).values({column.key: None})
            )
            await session.commit()


def build_tracker(postgres_manager, cache=None) -> SpendTracker:
    from src.core.settings import system_setting

    return SpendTracker(
        store=SqlSpendStore(postgres_manager),
        cache=cache,
        default_budget_usd=float(system_setting.DEFAULT_AGENT_MONTHLY_BUDGET_USD),
        alert_email=(system_setting.SPIRIT_MONKEY_ALERT_EMAIL or "").strip(),
    )


async def send_alerts_in_background(tracker: SpendTracker, agent: Any, spent_nano: int) -> None:
    """For FastAPI BackgroundTasks: never raises."""
    from src.services.leads.service import smtp_send

    try:
        await tracker.send_alerts(agent, spent_nano, lambda to, subject, html: smtp_send(to, subject, html))
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Budget alert check failed for agent {}", getattr(agent, "id", "?"))
