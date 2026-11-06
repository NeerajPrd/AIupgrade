"""add leads table and per-agent lead notification settings

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-11-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Notifications are opt-in per agent: existing agents stay silent.
    op.add_column(
        'agents',
        sa.Column('lead_notify_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'agents',
        sa.Column('lead_notify_emails', postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )

    op.create_table(
        'leads',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('history_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('agent_chat_histories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('business_name', sa.String(255), nullable=True),
        sa.Column('phone', sa.String(64), nullable=True),
        sa.Column('email', sa.String(320), nullable=True),
        sa.Column('interest', sa.Text(), nullable=True),
        sa.Column('language', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notify_status', sa.String(32), nullable=True),
        sa.Column('notify_error', sa.Text(), nullable=True),
        sa.UniqueConstraint('history_id', name='uq_leads_history_id'),
    )
    op.create_index('ix_leads_agent_created', 'leads', ['agent_id', 'created_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_leads_agent_created', table_name='leads')
    op.drop_table('leads')
    op.drop_column('agents', 'lead_notify_emails')
    op.drop_column('agents', 'lead_notify_enabled')
