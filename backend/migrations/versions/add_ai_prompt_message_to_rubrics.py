"""add ai_prompt_message to rubrics

Revision ID: add_ai_prompt_message_to_rubrics
Revises: 2ea69cf40d8e
Create Date: 2026-04-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = 'add_ai_prompt_message_to_rubrics'
down_revision = '2ea69cf40d8e'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {column['name'] for column in inspector.get_columns('rubrics')}

    if 'ai_prompt_message' not in existing_columns:
        with op.batch_alter_table('rubrics', schema=None) as batch_op:
            batch_op.add_column(sa.Column('ai_prompt_message', sa.Text, nullable=True))


def downgrade():
    with op.batch_alter_table('rubrics', schema=None) as batch_op:
        batch_op.drop_column('ai_prompt_message')
