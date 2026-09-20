"""Build a Word document report of an agent's conversations for a date range."""

import io
import re
from datetime import datetime
from typing import Any, Dict, List

from docx import Document

_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_BULLET_RE = re.compile(r"^\s*[*-]\s+(.+)")
_NUMBERED_RE = re.compile(r"^\s*\d+\.\s+(.+)")


def build_conversations_docx(agent_name: str, period_label: str, conversations: List[Dict[str, Any]]) -> io.BytesIO:
    """
    conversations: [{"title", "created_at" (iso str), "messages": [{"role", "content", "created_at"}]}]
    """
    document = Document()

    document.add_heading(f"{agent_name} — Conversations ({period_label})", level=0)
    document.add_paragraph(
        f"Exported {datetime.now().strftime('%Y-%m-%d %H:%M')} · {len(conversations)} conversation(s)"
    )

    if not conversations:
        document.add_paragraph("No conversations in this period.")

    for convo in conversations:
        document.add_heading(convo.get("title") or "Untitled conversation", level=1)

        started = _format_timestamp(convo.get("created_at"))
        if started:
            meta = document.add_paragraph()
            meta.add_run(f"Started: {started}").italic = True

        for msg in convo.get("messages", []):
            role = msg.get("role")
            label = "Client" if role == "user" else agent_name if role == "assistant" else (role or "Unknown").title()
            timestamp = _format_timestamp(msg.get("created_at"))

            label_p = document.add_paragraph()
            label_p.add_run(f"{label} ({timestamp}):").bold = True

            _add_message_body(document, msg.get("content") or "")

        document.add_paragraph("")

    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)
    return buffer


def _add_message_body(document: Document, content: str) -> None:
    """
    Renders **bold** and bullet/numbered list lines as real Word formatting
    instead of leaving the raw Markdown syntax in the exported text — the
    same basic set the widget renders, applied here via python-docx's own
    run/style model rather than HTML.
    """
    prose_para = None

    def flush_prose():
        nonlocal prose_para
        prose_para = None

    for line in content.split("\n"):
        bullet_match = _BULLET_RE.match(line)
        numbered_match = _NUMBERED_RE.match(line)

        if bullet_match:
            flush_prose()
            _add_inline_bold_runs(document.add_paragraph(style="List Bullet"), bullet_match.group(1))
        elif numbered_match:
            flush_prose()
            _add_inline_bold_runs(document.add_paragraph(style="List Number"), numbered_match.group(1))
        elif line.strip() == "":
            flush_prose()
        else:
            if prose_para is None:
                prose_para = document.add_paragraph()
            else:
                prose_para.add_run().add_break()
            _add_inline_bold_runs(prose_para, line)


def _add_inline_bold_runs(paragraph, text: str) -> None:
    pos = 0
    for m in _BOLD_RE.finditer(text):
        if m.start() > pos:
            paragraph.add_run(text[pos:m.start()])
        paragraph.add_run(m.group(1)).bold = True
        pos = m.end()
    if pos < len(text):
        paragraph.add_run(text[pos:])


def _format_timestamp(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    return value.strftime("%Y-%m-%d %H:%M")
