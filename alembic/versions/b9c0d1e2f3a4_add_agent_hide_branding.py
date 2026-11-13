"""add per-agent hide_branding (hides "Powered by Spirit Monkey" in the chat widget)

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-11-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Spirit Monkey's own assistant (the one embedded on spirit-monkey.com). It sits on our own
# site, so the "Powered by" line is hidden for it. No effect on installs without this slug.
OWN_AGENT_SLUG = 'spirit-monkey-chat-assistant-2b2f558c'


def upgrade() -> None:
    """Upgrade schema."""
    # Default false: every client widget shows the line unless an admin turns it off for that agent.
    op.add_column(
        'agents',
        sa.Column('hide_branding', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        sa.text(
            "UPDATE agents SET hide_branding = true "
            "WHERE id IN (SELECT agent_id FROM agent_api WHERE slug = :slug)"
        ).bindparams(slug=OWN_AGENT_SLUG)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('agents', 'hide_branding')
