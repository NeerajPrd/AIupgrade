"""add per-agent chat cap and conversation source

Revision ID: b3c4d5e6f7a8
Revises: 7a1e9c3d5f2b
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = '7a1e9c3d5f2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable, no default: existing agents (e.g. Skill Square) stay uncapped.
    op.add_column('agents', sa.Column('chat_cap', sa.Integer(), nullable=True))
    op.add_column('agents', sa.Column('chat_cap_starts_at', sa.Date(), nullable=True))

    # Where a conversation came from ('agent_api' for the widget / public API).
    # Existing rows stay NULL because their origin can't be determined.
    op.add_column('agent_chat_histories', sa.Column('source', sa.String(32), nullable=True))
    op.create_index(
        'ix_agent_chat_histories_agent_source_created',
        'agent_chat_histories',
        ['agent_id', 'source', 'created_at'],
    )
    op.create_index('ix_agent_chats_history_id', 'agent_chats', ['history_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_agent_chats_history_id', table_name='agent_chats')
    op.drop_index('ix_agent_chat_histories_agent_source_created', table_name='agent_chat_histories')
    op.drop_column('agent_chat_histories', 'source')
    op.drop_column('agents', 'chat_cap_starts_at')
    op.drop_column('agents', 'chat_cap')
