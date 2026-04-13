"""add archive fields to students

Revision ID: 7f5b9d1a2c31
Revises: 2ea69cf40d8e
Create Date: 2026-04-09 02:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f5b9d1a2c31'
down_revision = '2ea69cf40d8e'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_archived', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('archived_at', sa.DateTime(), nullable=True))

    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.alter_column('is_archived', server_default=None)


def downgrade():
    with op.batch_alter_table('students', schema=None) as batch_op:
        batch_op.drop_column('archived_at')
        batch_op.drop_column('is_archived')
