"""per-agent monthly budget, contact details, and monthly usage/spend table

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c0d1e2f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # NULL budget = use DEFAULT_AGENT_MONTHLY_BUDGET_USD from .env.
    op.add_column('agents', sa.Column('monthly_budget_usd', sa.Numeric(10, 4), nullable=True))
    op.add_column('agents', sa.Column('contact_details', sa.String(300), nullable=True))

    op.create_table(
        'agent_monthly_usage',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('agent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period', sa.String(7), nullable=False),
        sa.Column('cost_nano_usd', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('requests', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('prompt_tokens', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('output_tokens', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('thinking_tokens', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('embed_tokens', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('alert_80_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('alert_100_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('agent_id', 'period', name='uq_agent_monthly_usage_agent_period'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agent_monthly_usage')
    op.drop_column('agents', 'contact_details')
    op.drop_column('agents', 'monthly_budget_usd')
