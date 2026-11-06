"""HTML email sent to a client when their website chat captures a lead. Branded Spirit Monkey."""

from datetime import datetime, timezone
from html import escape
from typing import Dict, List, Optional

from src.services.agents.conversation_usage import KATHMANDU_TZ

BRAND = "Spirit Monkey"
# Nirmala UI ships with Windows and covers Devanagari; the others cover macOS, Android and Linux.
FONT_STACK = (
    "'Segoe UI', 'Nirmala UI', 'Noto Sans Devanagari', 'Noto Sans', 'Kohinoor Devanagari', "
    "'Mangal', Roboto, Helvetica, Arial, sans-serif"
)

_FIELD_LABELS = [
    ("name", "Name"),
    ("business_name", "Business"),
    ("phone", "Phone"),
    ("email", "Email"),
    ("interest", "Interested in"),
    ("language", "Language"),
]


def format_kathmandu(ts: Optional[datetime]) -> str:
    ts = ts or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    local = ts.astimezone(KATHMANDU_TZ)
    hour = local.hour % 12 or 12
    return f"{local.day} {local:%b %Y}, {hour}:{local:%M} {local:%p} (Nepal time)"


def lead_label(lead: Dict[str, Optional[str]]) -> str:
    return lead.get("name") or lead.get("phone") or lead.get("email") or "website visitor"


def build_subject(lead: Dict[str, Optional[str]], updated: bool) -> str:
    prefix = "Lead updated from your website chat" if updated else "New lead from your website chat"
    return f"{prefix} – {lead_label(lead)}"


def _value_html(key: str, value: Optional[str]) -> str:
    if not value:
        return '<span style="color:#9aa0a6;">Not given</span>'
    if key == "email":
        parts = [p.strip() for p in value.split(",") if p.strip()]
        return ", ".join(f'<a href="mailto:{escape(p)}" style="color:#0b7a5c;">{escape(p)}</a>' for p in parts)
    if key == "phone":
        parts = [p.strip() for p in value.split(",") if p.strip()]
        return ", ".join(
            f'<a href="tel:{escape(p.replace(" ", ""))}" style="color:#0b7a5c;">{escape(p)}</a>' for p in parts
        )
    return escape(value)


def build_html(
    lead: Dict[str, Optional[str]],
    transcript: List[Dict[str, object]],
    agent_name: str,
    captured_at: Optional[datetime],
    updated: bool,
    changed_fields: Optional[List[str]] = None,
) -> str:
    heading = "A lead was updated" if updated else "You have a new lead"
    intro = (
        "The visitor shared new contact details in the same conversation."
        if updated
        else "A visitor left their contact details while chatting with your website assistant."
    )
    changed = set(changed_fields or [])

    rows = []
    for key, label in _FIELD_LABELS:
        badge = (
            ' <span style="background:#fff4d6;color:#8a5a00;font-size:11px;padding:1px 6px;border-radius:8px;">new</span>'
            if updated and key in changed
            else ""
        )
        rows.append(
            f'<tr><td style="padding:8px 12px;color:#5f6368;width:130px;vertical-align:top;">{label}</td>'
            f'<td style="padding:8px 12px;color:#202124;">{_value_html(key, lead.get(key))}{badge}</td></tr>'
        )

    bubbles = []
    for turn in transcript:
        is_visitor = turn.get("role") == "user"
        who = "Visitor" if is_visitor else escape(agent_name or "Assistant")
        when = turn.get("created_at")
        when_txt = format_kathmandu(when).replace(" (Nepal time)", "") if isinstance(when, datetime) else ""
        bg = "#e8f5ef" if is_visitor else "#f1f3f4"
        bubbles.append(
            f'<div style="margin:0 0 10px 0;padding:10px 12px;background:{bg};border-radius:8px;">'
            f'<div style="font-size:12px;color:#5f6368;margin-bottom:4px;"><strong>{who}</strong>'
            f'{" &middot; " + escape(when_txt) if when_txt else ""}</div>'
            f'<div style="white-space:pre-wrap;word-wrap:break-word;color:#202124;">{escape(str(turn.get("content") or ""))}</div>'
            "</div>"
        )
    transcript_html = "".join(bubbles) or '<p style="color:#9aa0a6;">No messages recorded.</p>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:{FONT_STACK};font-size:14px;line-height:1.5;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:{FONT_STACK};">
  <tr><td style="background:#0b7a5c;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:600;">{BRAND}</td></tr>
  <tr><td style="padding:24px 24px 8px 24px;">
    <h1 style="margin:0 0 6px 0;font-size:20px;color:#202124;">{escape(heading)}</h1>
    <p style="margin:0;color:#5f6368;">{escape(intro)}</p>
    <p style="margin:6px 0 0 0;color:#5f6368;font-size:13px;">Assistant: {escape(agent_name or "Website assistant")} &middot; {escape(format_kathmandu(captured_at))}</p>
  </td></tr>
  <tr><td style="padding:12px 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e0e3e7;border-radius:8px;border-collapse:separate;">
      {"".join(rows)}
    </table>
  </td></tr>
  <tr><td style="padding:12px 24px 4px 24px;"><h2 style="margin:0;font-size:16px;color:#202124;">Conversation</h2></td></tr>
  <tr><td style="padding:8px 24px 24px 24px;">{transcript_html}</td></tr>
  <tr><td style="padding:14px 24px;background:#fafbfc;color:#9aa0a6;font-size:12px;border-top:1px solid #eef0f2;">
    Sent by {BRAND} because lead alerts are turned on for this assistant. Reply to this email to contact the visitor if they gave an email address.
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""
