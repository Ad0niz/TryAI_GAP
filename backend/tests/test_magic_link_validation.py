"""INC-H2-001: real auth routes and committed reads on disposable SQLite only."""
import os
os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'
import re
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.api.deps import get_db
from app.api.routes.auth import router
from app.core.emailrules import is_valid_email, is_corporate_email
from app.core.errors import APIError, register_error_handlers
from app.core.security import hash_token, now_utc
from app.db.base import Base
from app.models import MagicLinkToken, RefreshToken, User
from app.services.auth_service import request_magic_link


class MagicLinkValidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='tryai-inc-h2-001-')
        self.engine = create_async_engine('sqlite+aiosqlite:///' + (Path(self.temp.name) / 'synthetic.db').as_posix())
        @event.listens_for(self.engine.sync_engine, 'connect')
        def enforce_fk(dbapi, _):
            dbapi.execute('PRAGMA foreign_keys=ON')
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as db:
            await db.run_sync(Base.metadata.create_all)
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        register_error_handlers(app)
        async def isolated_db():
            async with self.sessions.begin() as db:
                yield db
        app.dependency_overrides[get_db] = isolated_db
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url='http://test')
        self.mail_patch = patch('app.services.auth_service.send_email', new_callable=AsyncMock)
        self.mail = self.mail_patch.start()
        self.credentials_patch = patch('app.services.credential_service.send_email', new_callable=AsyncMock)
        self.credentials_mail = self.credentials_patch.start()

    async def asyncTearDown(self):
        self.mail_patch.stop()
        self.credentials_patch.stop()
        await self.client.aclose()
        await self.engine.dispose()
        self.temp.cleanup()

    async def post(self, path, email):
        return await self.client.post('/api/v1/auth/' + path, json={'email': email})

    async def counts(self):
        # Separate committed connection: no uncommitted-session illusion.
        async with self.engine.connect() as db:
            return {t.name: await db.scalar(select(func.count()).select_from(t)) for t in Base.metadata.sorted_tables}

    async def test_reproduced_identifier_without_at_cannot_create_user_or_token(self):
        response = await self.post('magic-link', 'identificador-sin-correo')
        counts = await self.counts()
        self.assertEqual((response.status_code, counts['users'], counts['magic_link_tokens'], counts['refresh_tokens']), (400, 0, 0, 0))
        self.assertEqual(response.json()['error']['code'], 'VALIDATION_ERROR')
        self.assertEqual(response.json()['error']['field'], 'email')
        self.mail.assert_not_awaited()

    async def test_malformed_emails_leave_every_table_unchanged(self):
        values = ['', '   ', 'without-at', '@example.com', 'person@', 'a@@example.com',
                  'person@example', 'person@test', 'person@.com', 'person@domain..com', '.person@example.com',
                  'person.@example.com', 'per..son@example.com', 'a b@example.com',
                  'person@bad_domain.com', 'Display Name <person@example.com>',
                  'person@example.com,other@example.com', 'person\n@example.com',
                  'x'*65+'@example.com', 'person@'+'x'*64+'.com']
        before = await self.counts()
        for email in values:
            with self.subTest(email=email):
                response = await self.post('magic-link', email)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(response.json()['error']['field'], 'email')
                self.assertEqual(await self.counts(), before)
                if email.strip():
                    self.assertNotIn(email, response.json()['error']['message'])
        self.mail.assert_not_awaited()

    async def test_schema_rejects_missing_or_non_string_email_without_writes(self):
        for body in [{}, {'email': None}, {'email': 123}, {'email': []}]:
            with self.subTest(body=body):
                response = await self.client.post('/api/v1/auth/magic-link', json=body)
                self.assertEqual(response.status_code, 400)
                self.assertTrue(all(n == 0 for n in (await self.counts()).values()))
        self.mail.assert_not_awaited()

    async def test_valid_personal_and_corporate_emails_still_receive_202(self):
        for email in ['person+qa@gmail.com', 'first.last@company.com', 'person@synthetic.test']:
            with self.subTest(email=email):
                response = await self.post('magic-link', email)
                self.assertEqual(response.status_code, 202, response.text)
        counts = await self.counts()
        self.assertEqual((counts['users'], counts['magic_link_tokens'], counts['refresh_tokens']), (3, 3, 0))
        self.assertEqual(self.mail.await_count, 3)

    async def test_trim_case_and_existing_identity_are_preserved(self):
        async with self.sessions.begin() as db:
            db.add(User(email='person@example.com', role='client', status='active'))
        response = await self.post('magic-link', '  PERSON@EXAMPLE.COM  ')
        self.assertEqual(response.status_code, 202)
        counts = await self.counts()
        self.assertEqual(counts['users'], 1)
        self.assertEqual(counts['magic_link_tokens'], 1)
        self.assertEqual(self.mail.call_args.args[0], 'person@example.com')

    async def test_existing_and_unknown_valid_email_have_identical_generic_response(self):
        async with self.sessions.begin() as db:
            db.add(User(email='known@example.com', status='active'))
        existing = await self.post('magic-link', 'known@example.com')
        unknown = await self.post('magic-link', 'new@example.com')
        self.assertEqual(existing.status_code, 202)
        self.assertEqual((unknown.status_code, unknown.json()), (existing.status_code, existing.json()))
        self.assertNotIn('access_token', unknown.json())

    async def test_magic_link_valid_single_use_and_expired_contracts(self):
        await self.post('magic-link', 'person@example.com')
        raw = re.search(r'\?token=([A-Za-z0-9_-]+)', self.mail.call_args.args[2]).group(1)
        verified = await self.client.post('/api/v1/auth/verify', json={'token': raw})
        self.assertEqual(verified.status_code, 200)
        self.assertIn('access_token', verified.json())
        replay = await self.client.post('/api/v1/auth/verify', json={'token': raw})
        self.assertEqual((replay.status_code, replay.json()['error']['code']), (409, 'TOKEN_ALREADY_USED'))
        await self.post('magic-link', 'person@example.com')
        expired_raw = re.search(r'\?token=([A-Za-z0-9_-]+)', self.mail.call_args.args[2]).group(1)
        async with self.sessions.begin() as db:
            row = await db.scalar(select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(expired_raw)))
            row.expires_at = now_utc() - timedelta(seconds=1)
        before = await self.counts()
        expired = await self.client.post('/api/v1/auth/verify', json={'token': expired_raw})
        self.assertEqual((expired.status_code, expired.json()['error']['code']), (410, 'TOKEN_EXPIRED'))
        self.assertEqual(await self.counts(), before)

    async def test_valid_magic_link_rate_limit_remains_five_requests(self):
        for _ in range(5):
            self.assertEqual((await self.post('magic-link', 'limited@example.com')).status_code, 202)
        before = await self.counts()
        response = await self.post('magic-link', 'limited@example.com')
        self.assertEqual((response.status_code, response.json()['error']['code']), (429, 'RATE_LIMITED'))
        self.assertEqual(await self.counts(), before)
        self.assertEqual(self.mail.await_count, 5)

    async def test_invalid_email_does_not_bypass_identity_rate_limit(self):
        for _ in range(5):
            self.assertEqual((await self.post('magic-link', 'invalid-identifier')).status_code, 400)
        response = await self.post('magic-link', 'invalid-identifier')
        self.assertEqual((response.status_code, response.json()['error']['code']), (429, 'RATE_LIMITED'))
        self.assertTrue(all(n == 0 for n in (await self.counts()).values()))

    async def test_service_rejects_before_any_database_operation(self):
        db = AsyncMock()
        with self.assertRaises(APIError) as error:
            await request_magic_link(db, 'not-an-email')
        self.assertEqual(error.exception.status_code, 400)
        db.execute.assert_not_awaited()
        db.flush.assert_not_awaited()
        db.add.assert_not_called()

    async def test_registration_already_rejects_malformed_email(self):
        response = await self.post('register/request', 'invalid-identifier')
        self.assertEqual((response.status_code, response.json()['error']['code']), (400, 'LEAD_EMAIL_INVALID'))
        self.assertTrue(all(n == 0 for n in (await self.counts()).values()))
        self.credentials_mail.assert_not_awaited()

    async def test_legacy_invalid_user_is_not_changed_and_reset_stays_generic(self):
        async with self.sessions.begin() as db:
            db.add(User(email='legacy-invalid', status='active'))
        before = await self.counts()
        magic = await self.post('magic-link', 'legacy-invalid')
        self.assertEqual(magic.status_code, 400)
        reset = await self.post('password/reset/request', 'legacy-invalid')
        unknown = await self.post('password/reset/request', 'unknown@example.com')
        self.assertEqual((reset.status_code, reset.json()), (202, unknown.json()))
        login = await self.client.post('/api/v1/auth/login', json={'email': 'legacy-invalid', 'password': 'Synthetic phrase 2026!'})
        self.assertEqual((login.status_code, login.json()['error']['code']), (401, 'AUTH_LOGIN_FAILED'))
        self.assertEqual(await self.counts(), before)
        self.credentials_mail.assert_not_awaited()

    async def test_shared_syntax_and_corporate_policy_remain_separate(self):
        self.assertTrue(is_valid_email('name+qa@gmail.com'))
        self.assertFalse(is_corporate_email('name+qa@gmail.com'))
        self.assertTrue(is_corporate_email('person@synthetic.test'))
        self.assertTrue(is_valid_email('x'*64+'@example.com'))
        self.assertFalse(is_valid_email('per..son@example.com'))
