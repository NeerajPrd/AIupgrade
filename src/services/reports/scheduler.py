"""Sends last month's client report automatically in the first days of each month.

Runs inside the web app (an hourly asyncio loop started from the lifespan), so it needs no
extra container. Safe with several web workers and across restarts: an agent's report for a
month is claimed by inserting its row in agent_monthly_reports (unique on agent + month);
only the process that wins the insert sends.

Who gets one: agents with a published API (i.e. a website widget), lead alerts turned on and
at least one address in lead_notify_emails. Months with no website conversations are skipped.

Only days 1 to AUTO_SEND_LAST_DAY (Nepal time) are considered: if the server was down on the
1st the report still goes out, but deploying mid-month never emails clients an old report.
"""

import asyncio
import uuid
from datetime import date, datetime, timezone
from typing import Any, Awaitable, Callable, List, Optional, Protocol

from loguru import logger

from src.services.agents.conversation_usage import today_kathmandu
from src.services.reports.monthly import MonthlyReport, previous_period

AUTO_SEND_LAST_DAY = 7
MAX_ATTEMPTS = 3
CHECK_INTERVAL_S = 3600
INITIAL_DELAY_S = 180

STATUS_SENDING = "sending"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"


class ReportStore(Protocol):
    async def due_agents(self) -> List[Any]: ...
    async def claim(self, agent_id: uuid.UUID, period: str) -> bool: ...
    async def finish(self, agent_id: uuid.UUID, period: str, status: str, *, error: Optional[str] = None,
                     conversations: Optional[int] = None, leads: Optional[int] = None) -> None: ...


# generate(agent, period) -> report ; send(recipients, report) -> True if sent, False if SMTP is off
Generate = Callable[[Any, str], Awaitable[MonthlyReport]]
Send = Callable[[List[str], MonthlyReport], Awaitable[bool]]


async def run_due_reports(store: ReportStore, generate: Generate, send: Send, today: Optional[date] = None) -> int:
    """Send every report that is due and not yet handled. Returns how many were emailed."""
    today = today or today_kathmandu()
    if today.day > AUTO_SEND_LAST_DAY:
        return 0
    period = previous_period(today)
    sent = 0
    for agent in await store.due_agents():
        recipients = list(agent.lead_notify_emails or [])
        if not recipients or not await store.claim(agent.id, period):
            continue
        try:
            report = await generate(agent, period)
            if report.conversations == 0:
                await store.finish(agent.id, period, STATUS_SKIPPED, conversations=0, leads=report.leads)
                continue
            if not await send(recipients, report):
                raise RuntimeError("SMTP is not configured")
            await store.finish(agent.id, period, STATUS_SENT, conversations=report.conversations, leads=report.leads)
            sent += 1
            logger.info("Monthly report {} sent for agent {} to {} recipient(s)", period, agent.id, len(recipients))
        except Exception as err:
            logger.error("Monthly report {} failed for agent {}: {}", period, agent.id, type(err).__name__)
            await store.finish(agent.id, period, STATUS_FAILED, error=str(err)[:1000])
    return sent


class SqlReportStore:
    """ReportStore over PostgreSQL. Each call uses its own short session."""

    def __init__(self, postgres_manager):
        self._pm = postgres_manager

    async def due_agents(self) -> List[Any]:
        from sqlalchemy import select

        from src.models.sql.agent_api import AgentAPI
        from src.models.sql.models import Agent

        async with self._pm.get_session() as session:
            result = await session.execute(
                select(Agent)
                .join(AgentAPI, AgentAPI.agent_id == Agent.id)
                .where(Agent.lead_notify_enabled.is_(True), Agent.is_deleted.is_not(True))
                .order_by(Agent.name)
            )
            return list(result.scalars().all())

    async def claim(self, agent_id: uuid.UUID, period: str) -> bool:
        from sqlalchemy import update
        from sqlalchemy.dialects.postgresql import insert

        from src.models.sql.monthly_report import AgentMonthlyReport as Row

        async with self._pm.get_session() as session:
            inserted = await session.execute(
                insert(Row)
                .values(id=uuid.uuid4(), agent_id=agent_id, period=period, status=STATUS_SENDING, attempts=1,
                        created_at=datetime.now(timezone.utc))
                .on_conflict_do_nothing(constraint="uq_agent_monthly_reports_agent_period")
                .returning(Row.id)
            )
            won = inserted.first() is not None
            if not won:
                # An earlier attempt failed: take it over, up to MAX_ATTEMPTS in total.
                retried = await session.execute(
                    update(Row)
                    .where(Row.agent_id == agent_id, Row.period == period, Row.status == STATUS_FAILED,
                           Row.attempts < MAX_ATTEMPTS)
                    .values(status=STATUS_SENDING, attempts=Row.attempts + 1, error=None)
                    .returning(Row.id)
                )
                won = retried.first() is not None
            await session.commit()
            return won

    async def finish(self, agent_id: uuid.UUID, period: str, status: str, *, error: Optional[str] = None,
                     conversations: Optional[int] = None, leads: Optional[int] = None) -> None:
        from sqlalchemy import update

        from src.models.sql.monthly_report import AgentMonthlyReport as Row

        async with self._pm.get_session() as session:
            await session.execute(
                update(Row)
                .where(Row.agent_id == agent_id, Row.period == period)
                .values(status=status, error=error, conversations=conversations, leads=leads,
                        sent_at=datetime.now(timezone.utc) if status == STATUS_SENT else None)
            )
            await session.commit()

    async def record_manual_send(self, agent_id: uuid.UUID, period: str, conversations: int, leads: int) -> None:
        """An admin sent this month's report by hand: make sure the automatic run does not send it again."""
        from sqlalchemy.dialects.postgresql import insert

        from src.models.sql.monthly_report import AgentMonthlyReport as Row

        now = datetime.now(timezone.utc)
        values = dict(status=STATUS_SENT, error=None, conversations=conversations, leads=leads, sent_at=now)
        async with self._pm.get_session() as session:
            await session.execute(
                insert(Row)
                .values(id=uuid.uuid4(), agent_id=agent_id, period=period, attempts=1, created_at=now, **values)
                .on_conflict_do_update(constraint="uq_agent_monthly_reports_agent_period", set_=values)
            )
            await session.commit()


async def generate_for_agent(postgres_manager, agent, period: str) -> MonthlyReport:
    """Load the month's data and build the report, with one LLM call on the platform's fast model."""
    from src.core.settings import system_setting
    from src.services.leads.extraction import default_llm_call
    from src.services.reports.monthly import build_report, load_report_data

    async with postgres_manager.get_session() as session:
        conversations, leads = await load_report_data(session, agent.id, period)
    # Grouping a month of multilingual questions is harder than routing: keep it on the fast model.
    llm_call = default_llm_call(
        agent.user_id, agent.id, model=system_setting.FAST_MODEL_ID, provider=system_setting.FAST_MODEL_PROVIDER
    )
    return await build_report(agent.name, period, conversations, leads, llm_call)


async def monthly_report_loop(postgres_manager) -> None:
    """Background task for the app lifespan. Never raises."""
    from src.core.settings import system_setting
    from src.services.reports.monthly import send_report_email

    store = SqlReportStore(postgres_manager)

    async def generate(agent, period):
        return await generate_for_agent(postgres_manager, agent, period)

    await asyncio.sleep(INITIAL_DELAY_S)
    while True:
        try:
            # Without SMTP nothing is claimed, so reports go out once email is set up (within the window).
            if system_setting.smtp_configured:
                await run_due_reports(store, generate, send_report_email)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Monthly report check failed")
        await asyncio.sleep(CHECK_INTERVAL_S)
