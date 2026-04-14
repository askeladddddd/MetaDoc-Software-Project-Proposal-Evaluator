"""cascade user-owned foreign keys

Revision ID: d1b5d8f1c7a4
Revises: 4c8f2f3e9a21
Create Date: 2026-04-15 05:40:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'd1b5d8f1c7a4'
down_revision = '4c8f2f3e9a21'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('submission_tokens', schema=None) as batch_op:
        batch_op.drop_constraint('submission_tokens_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'submission_tokens_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id'],
            ondelete='CASCADE'
        )

    with op.batch_alter_table('deadlines', schema=None) as batch_op:
        batch_op.drop_constraint('deadlines_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'deadlines_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id'],
            ondelete='CASCADE'
        )

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_constraint('submissions_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'submissions_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id'],
            ondelete='CASCADE'
        )

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_constraint('audit_logs_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'audit_logs_user_id_fkey',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )

    with op.batch_alter_table('report_exports', schema=None) as batch_op:
        batch_op.drop_constraint('report_exports_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'report_exports_user_id_fkey',
            'users',
            ['user_id'],
            ['id'],
            ondelete='CASCADE'
        )


def downgrade():
    with op.batch_alter_table('report_exports', schema=None) as batch_op:
        batch_op.drop_constraint('report_exports_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'report_exports_user_id_fkey',
            'users',
            ['user_id'],
            ['id']
        )

    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_constraint('audit_logs_user_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'audit_logs_user_id_fkey',
            'users',
            ['user_id'],
            ['id']
        )

    with op.batch_alter_table('submissions', schema=None) as batch_op:
        batch_op.drop_constraint('submissions_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'submissions_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id']
        )

    with op.batch_alter_table('deadlines', schema=None) as batch_op:
        batch_op.drop_constraint('deadlines_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'deadlines_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id']
        )

    with op.batch_alter_table('submission_tokens', schema=None) as batch_op:
        batch_op.drop_constraint('submission_tokens_professor_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key(
            'submission_tokens_professor_id_fkey',
            'users',
            ['professor_id'],
            ['id']
        )
