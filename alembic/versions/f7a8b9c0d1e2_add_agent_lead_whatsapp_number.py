"""add per-agent lead_whatsapp_number

Revision ID: f7a8b9c0d1e2
Revises: c4d5e6f7a8b9
Create Date: 2026-11-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # The client's WhatsApp number for the widget's "Chat on WhatsApp" handoff. NULL = not set.
    op.add_column('agents', sa.Column('lead_whatsapp_number', sa.String(20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('agents', 'lead_whatsapp_number')
