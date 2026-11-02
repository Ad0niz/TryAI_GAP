"""Add official Administration fields, retaining APP-11 invitation acceptance.

Existing databases only; this is not a baseline migration for an empty schema.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261027_app14_admin"
down_revision = "20261022_app11"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_context().as_sql:
        raise RuntimeError("This inspected additive migration requires an online test database.")
    inspector = sa.inspect(op.get_bind())
    additions = {
        "users": [sa.Column("two_factor_enabled", sa.Boolean(), nullable=False, server_default=sa.false())],
        "questions": [
            sa.Column("vector_type", sa.String(30), nullable=True),
            sa.Column("weight_pain", sa.SmallInteger(), nullable=False, server_default=sa.text("1")),
            sa.Column("weight_readiness", sa.SmallInteger(), nullable=False, server_default=sa.text("1")),
        ],
    }
    present = {}
    # Validate all existing definitions before making any DDL changes. A partially
    # integrated but incompatible schema must be reviewed, not silently repaired.
    for table, columns in additions.items():
        if not inspector.has_table(table):
            raise RuntimeError(f"Existing table required: {table}. Obtain the official baseline first.")
        present[table] = {column["name"]: column for column in inspector.get_columns(table)}
        for column in columns:
            existing = present[table].get(column.name)
            if existing is not None:
                actual = str(existing["type"].compile(dialect=op.get_bind().dialect))
                expected = str(column.type.compile(dialect=op.get_bind().dialect))
                if actual != expected or existing["nullable"] != column.nullable:
                    raise RuntimeError(f"Incompatible existing definition: {table}.{column.name}")
    for table, columns in additions.items():
        for column in columns:
            if column.name not in present[table]:
                op.add_column(table, column)
    # Defaults backfill existing rows and support old ORM inserts during rollout.
    # They deliberately remain at the SQL level to avoid rebuilding SQLite tables.
    # No invitation column, password, answer or question identifier is changed.


def downgrade():
    raise RuntimeError("Destructive downgrade is disabled. Review a backed-up recovery procedure explicitly.")
