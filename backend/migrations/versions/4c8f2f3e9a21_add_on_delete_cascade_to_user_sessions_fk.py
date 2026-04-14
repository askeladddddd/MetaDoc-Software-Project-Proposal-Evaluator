"""add on delete cascade to user_sessions foreign key

Revision ID: 4c8f2f3e9a21
Revises: 7f5b9d1a2c31
Create Date: 2026-04-15 05:10:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '4c8f2f3e9a21'
down_revision = '7f5b9d1a2c31'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.drop_constraint('user_sessions_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'user_sessions_user_id_fkey',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )


def downgrade():
    with op.batch_alter_table('user_sessions', schema=None) as batch_op:
        batch_op.drop_constraint('user_sessions_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'user_sessions_user_id_fkey',
            'users',
            ['user_id'],
            ['id']
        )
