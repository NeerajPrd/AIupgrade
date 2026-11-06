"""Admin-only lead capture settings and lead listing for published agents.

GET   /api/v1/admin/agents/{agent_id}/lead-settings             - current notification settings
PATCH /api/v1/admin/agents/{agent_id}/lead-settings             - set lead_notify_enabled / lead_notify_emails
POST  /api/v1/admin/agents/{agent_id}/lead-settings/test-email  - send a sample lead email to the configured addresses
GET   /api/v1/admin/agents/{agent_id}/leads?date_from=&date_to=  - leads, newest first (dates are Asia/Kathmandu, inclusive)

Leads are captured from website-widget chats; see src/services/leads/service.py.
"""
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.routers.admin.agent_usage import _get_agent
from src.api.v1.routers.database.db_switch import require_admin
from src.core.database import get_db
from src.core.settings import system_setting
from src.models.sql.lead import Lead
from src.services.agents.conversation_usage import start_of_day_kathmandu
from src.services.leads import service as lead_service
from src.services.leads.email_template import build_html, build_subject

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

MAX_NOTIFY_EMAILS = 10


def _settings(agent) -> dict:
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "lead_notify_enabled": bool(agent.lead_notify_enabled),
        "lead_notify_emails": list(agent.lead_notify_emails or []),
        "smtp_configured": system_setting.smtp_configured,
    }


def _lead_out(lead: Lead) -> dict:
    def iso(ts):
        return ts.isoformat() if ts else None

    return {
        "id": str(lead.id),
        "agent_id": str(lead.agent_id),
        "conversation_id": str(lead.history_id),
        "name": lead.name,
        "business_name": lead.business_name,
        "phone": lead.phone,
        "email": lead.email,
        "interest": lead.interest,
        "language": lead.language,
        "created_at": iso(lead.created_at),
        "updated_at": iso(lead.updated_at),
        "notified_at": iso(lead.notified_at),
        "notify_status": lead.notify_status,
        "notify_error": lead.notify_error,
    }


@router.get("/agents/{agent_id}/lead-settings", operation_id="admin_get_agent_lead_settings")
async def get_lead_settings(agent_id: str, db: AsyncSession = Depends(get_db)):
    return _settings(await _get_agent(db, agent_id))


class LeadSettingsUpdate(BaseModel):
    # Only fields present in the request body are changed.
    lead_notify_enabled: Optional[bool] = None
    lead_notify_emails: Optional[List[EmailStr]] = Field(default=None, max_length=MAX_NOTIFY_EMAILS)


@router.patch("/agents/{agent_id}/lead-settings", operation_id="admin_set_agent_lead_settings")
async def set_lead_settings(agent_id: str, body: LeadSettingsUpdate, db: AsyncSession = Depends(get_db)):
    agent = await _get_agent(db, agent_id)
    fields = body.model_fields_set

    emails = list(agent.lead_notify_emails or [])
    if "lead_notify_emails" in fields:
        emails = []
        for e in body.lead_notify_emails or []:
            e = str(e).strip().lower()
            if e not in emails:
                emails.append(e)
    enabled = bool(agent.lead_notify_enabled)
    if "lead_notify_enabled" in fields and body.lead_notify_enabled is not None:
        enabled = body.lead_notify_enabled
    if enabled and not emails:
        raise HTTPException(status_code=422, detail="Add at least one address in lead_notify_emails to enable notifications")

    agent.lead_notify_emails = emails
    agent.lead_notify_enabled = enabled
    await db.commit()
    return _settings(agent)


@router.post("/agents/{agent_id}/lead-settings/test-email", operation_id="admin_send_test_lead_email")
async def send_test_lead_email(agent_id: str, db: AsyncSession = Depends(get_db)):
    """Send a clearly marked sample lead to the agent's notification addresses. Nothing is stored."""
    agent = await _get_agent(db, agent_id)
    recipients = list(agent.lead_notify_emails or [])
    if not recipients:
        raise HTTPException(status_code=422, detail="No lead_notify_emails configured for this agent")
    if not system_setting.smtp_configured:
        raise HTTPException(status_code=503, detail="SMTP is not configured (set EMAIL_* in .env)")

    now = datetime.now(timezone.utc)
    sample = {
        "name": "TEST – Sita Sharma",
        "business_name": "Himalayan Treks Pvt. Ltd.",
        "phone": "+9779800000000",
        "email": None,
        "interest": "Wants a free 1-month chatbot trial for their website (sample lead).",
        "language": "Nepali",
    }
    transcript = [
        {"role": "user", "content": "नमस्ते! तपाईंको chatbot को मूल्य कति हो?", "created_at": now - timedelta(minutes=2)},
        {"role": "assistant", "content": "Namaste! Plans start from NPR 7,500 per month. Shall I arrange a free 1-month trial?", "created_at": now - timedelta(minutes=1)},
        {"role": "user", "content": "हो, मेरो नम्बर 9800000000 हो। म सीता, Himalayan Treks बाट।", "created_at": now},
    ]
    html = build_html(sample, transcript, agent_name=agent.name, captured_at=now, updated=False)
    try:
        await lead_service.smtp_send(recipients, "[TEST] " + build_subject(sample, updated=False), html)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Sending failed: {err}")
    return {"sent": True, "recipients": recipients}


@router.get("/agents/{agent_id}/leads", operation_id="admin_list_agent_leads")
async def list_agent_leads(
    agent_id: str,
    date_from: Optional[date] = Query(default=None, description="First day (Asia/Kathmandu), inclusive"),
    date_to: Optional[date] = Query(default=None, description="Last day (Asia/Kathmandu), inclusive"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_agent(db, agent_id)
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to is before date_from")

    conditions = [Lead.agent_id == agent.id]
    if date_from:
        conditions.append(Lead.created_at >= start_of_day_kathmandu(date_from))
    if date_to:
        conditions.append(Lead.created_at < start_of_day_kathmandu(date_to + timedelta(days=1)))
    result = await db.execute(select(Lead).where(*conditions).order_by(Lead.created_at.desc()).limit(limit))
    leads = [_lead_out(lead) for lead in result.scalars().all()]
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "timezone": "Asia/Kathmandu",
        "count": len(leads),
        "leads": leads,
    }
