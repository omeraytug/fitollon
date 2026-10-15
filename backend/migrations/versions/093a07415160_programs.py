"""programs

Revision ID: 093a07415160
Revises: 5fb305a1e69f
Create Date: 2026-10-15 22:48:19.693333

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '093a07415160'
down_revision: Union[str, Sequence[str], None] = '5fb305a1e69f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('programs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_programs_one_active', 'programs', ['is_active'], unique=True, postgresql_where=sa.text('is_active'))
    op.add_column('workout_templates', sa.Column('program_id', sa.Integer(), nullable=True))

    # The sessions already in the cycle become the first program, and it is the active one.
    op.execute("""
        WITH existing AS (SELECT 1 FROM workout_templates LIMIT 1),
             created AS (INSERT INTO programs (name, is_active) SELECT 'My program', true FROM existing RETURNING id)
        UPDATE workout_templates SET program_id = (SELECT id FROM created)
    """)

    op.alter_column('workout_templates', 'program_id', nullable=False)
    op.create_index(op.f('ix_workout_templates_program_id'), 'workout_templates', ['program_id'], unique=False)
    op.create_foreign_key('workout_templates_program_id_fkey', 'workout_templates', 'programs', ['program_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('workout_templates_program_id_fkey', 'workout_templates', type_='foreignkey')
    op.drop_index(op.f('ix_workout_templates_program_id'), table_name='workout_templates')
    op.drop_column('workout_templates', 'program_id')
    op.drop_index('ix_programs_one_active', table_name='programs', postgresql_where=sa.text('is_active'))
    op.drop_table('programs')
