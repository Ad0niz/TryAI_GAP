"""Add invitation acceptance and optional password credentials to the existing schema.

Revision ID: 20261022_app11
Revises: None (the repository previously used create_all, with no revisions).
"""
from alembic import op
import sqlalchemy as sa

revision = "20261022_app11"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    columns = {
        "users": [sa.Column("password_hash", sa.String(255), nullable=True)],
        "invitations": [
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        ],
    }
    for table, additions in columns.items():
        # Development create_all may already have created the new columns.
        existing = set() if op.get_context().as_sql else {
            column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)
        }
        for column in additions:
            if column.name not in existing:
                op.add_column(table, column)
    # Legacy invitations deliberately retain NULL expiry: they must be resent.


def downgrade():
    op.drop_column("invitations", "accepted_at")
    op.drop_column("invitations", "expires_at")
    op.drop_column("users", "password_hash")
