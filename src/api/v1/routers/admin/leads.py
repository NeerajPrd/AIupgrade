"""Admin-only lead capture settings and lead listing for published agents.

GET   /api/v1/admin/agents/{agent_id}/lead-settings             - current notification settings
PATCH /api/v1/admin/agents/{agent_id}/lead-settings             - set lead_notify_enabled / lead_notify_emails / lead_whatsapp_number
POST  /api/v1/admin/agents/{agent_id}/lead-settings/test-email  - send a sample lead email to the configured addresses
GET   /api/v1/admin/agents/{agent_id}/leads?date_from=&date_to=  - leads, newest first (dates are Asia/Kathmandu, inclusive)
GET   /api/v1/admin/agents/{agent_id}/leads/export.csv           - the same leads as a spreadsheet

Leads are captured from website-widget chats; see src/services/leads/service.py.
"""
import csv
import io
import re
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.v1.routers.admin.agent_usage import _get_agent
from src.api.v1.routers.database.db_switch import require_admin
from src.core.database import get_db
from src.core.settings import system_setting
from src.models.sql.lead import Lead
from src.services.agents.conversation_usage import KATHMANDU_TZ, start_of_day_kathmandu, today_kathmandu
from src.services.leads import service as lead_service
from src.services.leads.email_template import build_html, build_subject

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])

MAX_NOTIFY_EMAILS = 10


def normalize_whatsapp_number(raw: Optional[str]) -> Optional[str]:
    """'+977 984-1234567', '9841234567' or '9779841234567' -> '+9779841234567'. Blank -> None.

    A bare Nepali mobile (97/98 + 8 digits) gets +977; anything else must already include its
    country code. Raises ValueError for a number WhatsApp could not open.
    """
    if raw is None or not raw.strip():
        return None
    if not re.fullmatch(r"\+?[\d\s().\-]+", raw.strip()):
        raise ValueError("Use digits only, e.g. +9779841234567")
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if re.fullmatch(r"9[78]\d{8}", digits):
        digits = "977" + digits
    if not 10 <= len(digits) <= 15 or digits.startswith("0"):
        raise ValueError("Include the country code, e.g. +9779841234567")
    return "+" + digits


def _settings(agent) -> dict:
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "lead_notify_enabled": bool(agent.lead_notify_enabled),
        "lead_notify_emails": list(agent.lead_notify_emails or []),
        "lead_whatsapp_number": agent.lead_whatsapp_number,
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
    # The client's WhatsApp number; send null or "" to clear it.
    lead_whatsapp_number: Optional[str] = Field(default=None, max_length=32)


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

    if "lead_whatsapp_number" in fields:
        try:
            agent.lead_whatsapp_number = normalize_whatsapp_number(body.lead_whatsapp_number)
        except ValueError as err:
            raise HTTPException(status_code=422, detail=f"lead_whatsapp_number: {err}")

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
        {"role": "assistant", "content": "Namaste! Plans start from NPR 7,500 for 6 months. Shall I arrange a free 1-month trial?", "created_at": now - timedelta(minutes=1)},
        {"role": "user", "content": "हो, मेरो नम्बर 9800000000 हो। म सीता, Himalayan Treks बाट।", "created_at": now},
    ]
    html = build_html(sample, transcript, agent_name=agent.name, captured_at=now, updated=False)
    try:
        await lead_service.smtp_send(recipients, "[TEST] " + build_subject(sample, updated=False), html)
    except Exception as err:
        raise HTTPException(status_code=502, detail=f"Sending failed: {err}")
    return {"sent": True, "recipients": recipients}


async def _find_leads(db: AsyncSession, agent, date_from: Optional[date], date_to: Optional[date], limit: int):
    """The agent's leads, newest first, between two Asia/Kathmandu days (both inclusive, both optional)."""
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to is before date_from")
    conditions = [Lead.agent_id == agent.id]
    if date_from:
        conditions.append(Lead.created_at >= start_of_day_kathmandu(date_from))
    if date_to:
        conditions.append(Lead.created_at < start_of_day_kathmandu(date_to + timedelta(days=1)))
    result = await db.execute(select(Lead).where(*conditions).order_by(Lead.created_at.desc()).limit(limit))
    return result.scalars().all()


CSV_COLUMNS = ["Date (Nepal time)", "Name", "Business", "Phone", "Email", "Interested in", "Language",
               "Alert email", "Conversation ID"]


def _csv_cell(value: Optional[str], phone: bool = False) -> str:
    """Spreadsheet-safe text: nothing a visitor typed may run as a formula when the file is opened."""
    text = "" if value is None else str(value)
    if phone and text:
        # A leading tab keeps Excel from turning +9779841234567 into 9.77984E+12 or dropping a leading 0.
        return "\t" + text
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def leads_to_csv(leads) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    for lead in leads:
        created = lead.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        writer.writerow([
            created.astimezone(KATHMANDU_TZ).strftime("%Y-%m-%d %H:%M") if created else "",
            _csv_cell(lead.name),
            _csv_cell(lead.business_name),
            _csv_cell(lead.phone, phone=True),
            _csv_cell(lead.email),
            _csv_cell(lead.interest),
            _csv_cell(lead.language),
            _csv_cell(lead.notify_status or "not sent"),
            str(lead.history_id),
        ])
    return buffer.getvalue()


@router.get("/agents/{agent_id}/leads/export.csv", operation_id="admin_export_agent_leads_csv")
async def export_agent_leads_csv(
    agent_id: str,
    date_from: Optional[date] = Query(default=None, description="First day (Asia/Kathmandu), inclusive"),
    date_to: Optional[date] = Query(default=None, description="Last day (Asia/Kathmandu), inclusive"),
    db: AsyncSession = Depends(get_db),
):
    """The same leads as the list endpoint, as a CSV that opens correctly in Excel (UTF-8 with BOM)."""
    agent = await _get_agent(db, agent_id)
    leads = await _find_leads(db, agent, date_from, date_to, limit=10000)
    filename = f"leads_{date_from or 'start'}_to_{date_to or today_kathmandu()}.csv"
    return Response(
        content=("﻿" + leads_to_csv(leads)).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/agents/{agent_id}/leads", operation_id="admin_list_agent_leads")
async def list_agent_leads(
    agent_id: str,
    date_from: Optional[date] = Query(default=None, description="First day (Asia/Kathmandu), inclusive"),
    date_to: Optional[date] = Query(default=None, description="Last day (Asia/Kathmandu), inclusive"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    agent = await _get_agent(db, agent_id)
    leads = [_lead_out(lead) for lead in await _find_leads(db, agent, date_from, date_to, limit)]
    return {
        "agent_id": str(agent.id),
        "agent_name": agent.name,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "timezone": "Asia/Kathmandu",
        "count": len(leads),
        "leads": leads,
    }
