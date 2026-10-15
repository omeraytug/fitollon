"""media items

Revision ID: a222947e42db
Revises: 125d29208d3b
Create Date: 2026-10-15 23:32:18.016326

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a222947e42db'
down_revision: Union[str, Sequence[str], None] = '125d29208d3b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('media_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('tag', sa.String(length=20), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('taken_on', sa.Date(), nullable=False),
    sa.Column('pathname', sa.String(length=500), nullable=False),
    sa.Column('thumb_pathname', sa.String(length=500), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('duration_s', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_media_items_tag'), 'media_items', ['tag'], unique=False)
    op.create_index(op.f('ix_media_items_taken_on'), 'media_items', ['taken_on'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_media_items_taken_on'), table_name='media_items')
    op.drop_index(op.f('ix_media_items_tag'), table_name='media_items')
    op.drop_table('media_items')
