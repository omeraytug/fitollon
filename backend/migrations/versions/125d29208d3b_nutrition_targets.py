"""nutrition targets

Revision ID: 125d29208d3b
Revises: 093a07415160
Create Date: 2026-10-15 23:16:10.559354

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '125d29208d3b'
down_revision: Union[str, Sequence[str], None] = '093a07415160'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('nutrition_targets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('start_day', sa.Date(), nullable=False),
    sa.Column('weekday', sa.Integer(), nullable=False),
    sa.Column('calories', sa.Float(), nullable=True),
    sa.Column('protein', sa.Float(), nullable=True),
    sa.Column('carbs', sa.Float(), nullable=True),
    sa.Column('fat', sa.Float(), nullable=True),
    sa.Column('source', sa.String(length=40), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('start_day', 'weekday')
    )
    op.create_index(op.f('ix_nutrition_targets_start_day'), 'nutrition_targets', ['start_day'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_nutrition_targets_start_day'), table_name='nutrition_targets')
    op.drop_table('nutrition_targets')
