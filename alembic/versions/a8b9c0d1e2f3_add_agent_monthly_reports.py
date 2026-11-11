"""add agent_monthly_reports (one row per agent per month, so a report is never sent twice)

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-11-11 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'agent_monthly_reports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period', sa.String(7), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('conversations', sa.Integer(), nullable=True),
        sa.Column('leads', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('agent_id', 'period', name='uq_agent_monthly_reports_agent_period'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agent_monthly_reports')
