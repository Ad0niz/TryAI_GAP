"""Exercise the additive migration against an existing schema and a fresh dev schema."""
import importlib.util
import unittest
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text
from app.db.base import Base
import app.models  # register tables


class InvitationMigrationTests(unittest.TestCase):
    def migration(self, connection):
        path = Path(__file__).parents[1] / "migrations/versions/20261022_app11_invitations.py"
        spec = importlib.util.spec_from_file_location("app11_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

    def test_existing_rows_preserved_and_legacy_tokens_require_resend(self):
        engine = create_engine("sqlite:///:memory:")
        try:
            with engine.begin() as connection:
                connection.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT)"))
                connection.execute(text("CREATE TABLE invitations (id TEXT PRIMARY KEY, token_hash TEXT, status TEXT)"))
                connection.execute(text("INSERT INTO users VALUES ('u1', 'test@example.com')"))
                connection.execute(text("INSERT INTO invitations VALUES ('i1', 'legacy-hash', 'sent')"))
                self.migration(connection)
                self.migration(connection)
                self.assertEqual(connection.execute(text("SELECT email, password_hash FROM users")).one(), ("test@example.com", None))
                self.assertEqual(connection.execute(text("SELECT token_hash, status, expires_at, accepted_at FROM invitations")).one(), ("legacy-hash", "sent", None, None))
        finally:
            engine.dispose()

    def test_compatible_with_create_all_development_database(self):
        engine = create_engine("sqlite:///:memory:")
        try:
            with engine.begin() as connection:
                Base.metadata.create_all(connection)
                self.migration(connection)
                self.assertIn("password_hash", [c["name"] for c in inspect(connection).get_columns("users")])
        finally:
            engine.dispose()
