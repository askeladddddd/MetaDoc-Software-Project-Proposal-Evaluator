"""Add semester to submissions

Revision ID: 9c1a2d4f7b11
Revises: 2f4e517138e2
Create Date: 2026-03-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '9c1a2d4f7b11'
down_revision = '2f4e517138e2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('submissions')}

    if 'semester' not in existing_columns:
        with op.batch_alter_table('submissions', schema=None) as batch_op:
            batch_op.add_column(sa.Column('semester', sa.String(length=10), nullable=True))


def downgrade():
    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_column('semester')
