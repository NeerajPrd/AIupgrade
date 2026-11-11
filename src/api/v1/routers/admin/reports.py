"""Admin-only monthly client report, on demand.

POST /api/v1/admin/agents/{agent_id}/monthly-report                     - build the report (preview), optionally email it
GET  /api/v1/admin/agents/{agent_id}/monthly-report/conversations.docx  - the month's website conversations as Word

The same report is emailed automatically at the start of each month; see src/services/reports/scheduler.py.
"""
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.routers.admin.agent_usage import _get_agent
from src.api.v1.routers.database.db_switch import require_admin
from src.core.database import get_db
from src.core.settings import system_setting
from src.services.agents.conversation_usage import today_kathmandu
from src.services.reports import scheduler as report_scheduler
from src.services.reports.monthly import parse_period, previous_period, send_report_email

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _period(month: Optional[str]) -> str:
    """Validated 'YYYY-MM'; defaults to last month (Asia/Kathmandu)."""
    if not month:
        return previous_period(today_kathmandu())
    try:
        parse_period(month)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err))
    if month > today_kathmandu().strftime("%Y-%m"):
        raise HTTPException(status_code=422, detail="month is in the future")
    return month


class MonthlyReportRequest(BaseModel):
    # 'YYYY-MM' in Asia/Kathmandu. Omit for last month.
    month: Optional[str] = None
    # false = preview only; true = also email it to the agent's lead_notify_emails.
    send: bool = False


@router.post("/agents/{agent_id}/monthly-report", operation_id="admin_generate_monthly_report")
async def generate_monthly_report(
    agent_id: str, body: MonthlyReportRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    agent = await _get_agent(db, agent_id)
    period = _period(body.month)
    recipients = list(agent.lead_notify_emails or [])
    if body.send:
        if not recipients:
            raise HTTPException(status_code=422, detail="No lead_notify_emails configured for this agent")
        if not system_setting.smtp_configured:
            raise HTTPException(status_code=503, detail="SMTP is not configured (set EMAIL_* in .env)")

    postgres_manager = request.app.state.postgres_manager
    report = await report_scheduler.generate_for_agent(postgres_manager, agent, period)

    sent = False
    if body.send:
        try:
            sent = await send_report_email(recipients, report)
        except Exception as err:
            raise HTTPException(status_code=502, detail=f"Sending failed: {err}")
        if sent:
            await report_scheduler.SqlReportStore(postgres_manager).record_manual_send(
                agent.id, period, report.conversations, report.leads
            )

    return {
        **report.summary(),
        "agent_id": str(agent.id),
        "recipients": recipients,
        "smtp_configured": system_setting.smtp_configured,
        "sent": sent,
        "html": report.html,
    }


@router.get("/agents/{agent_id}/monthly-report/conversations.docx", operation_id="admin_download_monthly_conversations")
async def download_monthly_conversations(
    agent_id: str,
    request: Request,
    month: Optional[str] = Query(default=None, description="'YYYY-MM' (Asia/Kathmandu); default last month"),
    db: AsyncSession = Depends(get_db),
):
    """The Word attachment of the monthly report, without building the rest (no LLM call)."""
    from src.services.agents.export import build_conversations_docx
    from src.services.reports.monthly import load_report_data, period_label

    agent = await _get_agent(db, agent_id)
    period = _period(month)
    async with request.app.state.postgres_manager.get_session() as session:
        conversations, _ = await load_report_data(session, agent.id, period)
    buffer = build_conversations_docx(agent.name, period_label(period), conversations)
    filename = f"conversations_{period}.docx"
    return StreamingResponse(
        io.BytesIO(buffer.getvalue()),
        media_type=DOCX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
