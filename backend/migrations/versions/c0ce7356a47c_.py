"""empty message

Revision ID: c0ce7356a47c
Revises: add_ai_prompt_message_to_rubrics, a8d3f2b1e4c5
Create Date: 2026-04-28 19:35:21.507824

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c0ce7356a47c'
down_revision = ('add_ai_prompt_message_to_rubrics', 'a8d3f2b1e4c5')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
