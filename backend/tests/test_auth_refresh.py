"""Refresh API regressions using isolated SQLite and aware PostgreSQL-style dates."""
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.deps import get_db
from app.api.routes.auth import router
from app.core.config import settings
from app.core.errors import APIError, register_error_handlers
from app.core.security import as_utc, hash_token
from app.db.base import Base
from app.models import RefreshToken, User
from app.services.auth_service import rotate_refresh_token

NOW = datetime(2030, 1, 2, 12, tzinfo=timezone.utc)


class RefreshAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.uid, self.rid = uuid.uuid4(), uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=self.uid, email="refresh@example.com"))
            await db.flush()
            db.add(RefreshToken(id=self.rid, user_id=self.uid, token_hash=hash_token("test-refresh"),
                                expires_at=NOW + timedelta(seconds=1)))
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        register_error_handlers(app)

        async def isolated_db():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db] = isolated_db
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def refresh(self, token="test-refresh"):
        with patch("app.services.auth_service.now_utc", return_value=NOW):
            return await self.client.post("/api/v1/auth/refresh", json={"refresh_token": token})

    async def test_valid_sqlite_refresh_rotates_once_with_utc_expiry(self):
        async with self.sessions() as db:
            stored = await db.get(RefreshToken, self.rid)
            self.assertIsNone(stored.expires_at.tzinfo)
            self.assertEqual(as_utc(stored.expires_at), NOW + timedelta(seconds=1))
        result = await self.refresh()
        self.assertEqual(result.status_code, 200, result.text)
        new_token = result.json()["refresh_token"]
        self.assertNotEqual(new_token, "test-refresh")
        async with self.sessions() as db:
            old = await db.get(RefreshToken, self.rid)
            self.assertEqual(as_utc(old.revoked_at), NOW)
            new = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(new_token)))
            self.assertEqual(new.user_id, self.uid)
            self.assertEqual(as_utc(new.expires_at), NOW + timedelta(days=settings.refresh_token_ttl_days))
        replay = await self.refresh()
        self.assertEqual(replay.status_code, 401)
        self.assertEqual(replay.json()["error"]["code"], "REFRESH_TOKEN_INVALID")
        self.assertEqual((await self.refresh(new_token)).status_code, 200)

    async def test_expired_and_exact_boundary_never_issue_or_revoke_tokens(self):
        for expiry in [NOW - timedelta(seconds=1), NOW]:
            with self.subTest(expiry=expiry):
                async with self.sessions.begin() as db:
                    (await db.get(RefreshToken, self.rid)).expires_at = expiry
                result = await self.refresh()
                self.assertEqual(result.status_code, 410, result.text)
                self.assertEqual(result.json()["error"]["code"], "REFRESH_TOKEN_EXPIRED")
                async with self.sessions() as db:
                    self.assertIsNone((await db.get(RefreshToken, self.rid)).revoked_at)
                    self.assertEqual(await db.scalar(select(func.count()).select_from(RefreshToken)), 1)

    async def test_unknown_and_revoked_tokens_remain_invalid(self):
        self.assertEqual((await self.refresh("unknown")).status_code, 401)
        async with self.sessions.begin() as db:
            (await db.get(RefreshToken, self.rid)).revoked_at = NOW
        self.assertEqual((await self.refresh()).status_code, 401)


class AwareRefreshDateTests(unittest.IsolatedAsyncioTestCase):
    async def test_postgresql_style_aware_dates_preserve_absolute_expiry(self):
        # PostgreSQL TIMESTAMPTZ returns aware datetimes; no remote database is used.
        for zone in [timezone.utc, timezone(timedelta(hours=-3)), timezone(timedelta(hours=5, minutes=30))]:
            for seconds in [-1, 0, 1]:
                with self.subTest(zone=zone, seconds=seconds):
                    user = User(id=uuid.uuid4(), email="aware@example.com", status="active")
                    row = SimpleNamespace(id=uuid.uuid4(), user_id=user.id, revoked_at=None,
                                          expires_at=(NOW + timedelta(seconds=seconds)).astimezone(zone))
                    db = AsyncMock()
                    db.execute.return_value = Mock(scalar_one_or_none=Mock(return_value=row))
                    db.get_bind = Mock(return_value=Mock(dialect=Mock(name="postgresql")))
                    db.get_bind.return_value.dialect.name = "postgresql"
                    db.execute.side_effect = [Mock(scalar_one_or_none=Mock(return_value=row)),
                                              Mock(scalar_one_or_none=Mock(return_value=user)), Mock(rowcount=1)]
                    with patch("app.services.auth_service.now_utc", return_value=NOW), patch(
                        "app.services.auth_service.issue_tokens", new_callable=AsyncMock, return_value={"ok": True},
                    ) as issue:
                        if seconds > 0:
                            self.assertEqual(await rotate_refresh_token(db, "opaque"), {"ok": True})
                            issue.assert_awaited_once_with(db, user)
                            self.assertEqual(db.execute.await_count, 3)
                        else:
                            with self.assertRaises(APIError) as error:
                                await rotate_refresh_token(db, "opaque")
                            self.assertEqual(error.exception.code, "REFRESH_TOKEN_EXPIRED")
                            issue.assert_not_awaited()
                            self.assertIsNone(row.revoked_at)
