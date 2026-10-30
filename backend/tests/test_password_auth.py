"""APP-01 password flows: actual routes/SQLite, synthetic accounts and captured mail."""
import os
os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'
import re
import unittest
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch
from fastapi import BackgroundTasks, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.api.deps import get_db
from app.api.routes.auth import router as auth_router
from app.api.routes.leads import router as lead_router
from app.api.routes.team import router as team_router
from app.core.auth_limits import AuthLimiter
from app.core.errors import APIError, register_error_handlers
from app.core.passwords import hash_password, verify_password
from app.core.security import hash_token, now_utc
from app.db.base import Base
from app.models import Assessment, Invitation, Lead, MagicLinkToken, Organization, RefreshToken, OrgMember, User
from app.services.credential_service import purpose_hash, request_password_reset

PASSWORD = 'Synthetic passphrase 2026!'
NEW_PASSWORD = 'Another synthetic phrase 2026!'


class PasswordAuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.execute(text('PRAGMA foreign_keys=ON'))
            await conn.run_sync(Base.metadata.create_all)
        self.app = FastAPI()
        for router in [auth_router, lead_router, team_router]: self.app.include_router(router, prefix='/api/v1')
        register_error_handlers(self.app)
        async def isolated_db():
            async with self.sessions.begin() as db: yield db
        self.app.dependency_overrides[get_db] = isolated_db
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url='http://test')
        self.mail_patch = patch('app.services.credential_service.send_email', new_callable=AsyncMock)
        self.mail = self.mail_patch.start()
        self.magic_patch = patch('app.services.auth_service.send_email', new_callable=AsyncMock)
        self.magic_mail = self.magic_patch.start()

    async def asyncTearDown(self):
        self.mail_patch.stop(); self.magic_patch.stop()
        await self.client.aclose(); await self.engine.dispose()

    async def post(self, path, body): return await self.client.post('/api/v1'+path, json=body)

    async def account(self, email='existing@synthetic.test', password=PASSWORD, status='active', org=True, **kwargs):
        async with self.sessions.begin() as db:
            organization = Organization(name='Synthetic org') if org else None
            if organization: db.add(organization); await db.flush()
            user = User(email=email, organization_id=organization.id if organization else None,
                        status=status, role='client', password_hash=hash_password(password) if password else None, **kwargs)
            db.add(user); await db.flush()
            return user.id, user.organization_id

    def raw(self, mock=None):
        return re.search(r'\?token=([A-Za-z0-9_-]+)', (mock or self.mail).call_args.args[2]).group(1)

    async def register_link(self, email='new@synthetic.test'):
        response = await self.post('/auth/register/request', {'email':email,'locale':'es'})
        self.assertEqual(response.status_code,202,response.text)
        return self.raw()

    def signup(self, token, **kwargs):
        return dict(full_name='Synthetic person', job_title='Director', company_name='Synthetic company',
                    company_email='new@synthetic.test', terms_accepted=True, verification_token=token,
                    password=PASSWORD,password_confirmation=PASSWORD,**kwargs)

    async def login(self, email='existing@synthetic.test', password=PASSWORD):
        return await self.post('/auth/login',{'email':email,'password':password})

    async def reset_link(self, email='existing@synthetic.test'):
        response = await self.post('/auth/password/reset/request',{'email':email,'locale':'en'})
        self.assertEqual(response.status_code,202,response.text)
        return self.raw()

    async def reset(self, raw, password=NEW_PASSWORD, confirmation=NEW_PASSWORD):
        return await self.post('/auth/password/reset',{'token':raw,'password':password,'password_confirmation':confirmation})

    async def counts(self):
        async with self.sessions() as db:
            return [await db.scalar(select(func.count()).select_from(model)) for model in [User,Organization,Lead,Assessment]]

    async def test_verified_registration_no_org_or_session_before_completion_and_login(self):
        token = await self.register_link()
        self.assertEqual(await self.counts(),[1,0,0,0])
        async with self.sessions() as db:
            user = await db.scalar(select(User)); uid=user.id
            self.assertIsNone(user.password_hash); self.assertEqual(user.status,'invited')
            stored = await db.scalar(select(MagicLinkToken))
            self.assertEqual(stored.token_hash,purpose_hash('register',token))
            self.assertNotIn(token, stored.token_hash)
        preview = await self.post('/auth/register/preview',{'token':token})
        self.assertEqual(preview.json(),{'email':'new@synthetic.test'})
        result = await self.post('/leads',self.signup(token))
        self.assertEqual(result.status_code,201,result.text)
        self.assertEqual(await self.counts(),[1,1,1,1])
        async with self.sessions() as db:
            user=await db.get(User,uid)
            self.assertTrue(verify_password(PASSWORD,user.password_hash)); self.assertEqual(user.status,'active')
            admin=await db.scalar(select(OrgMember).where(OrgMember.user_id==uid))
            self.assertEqual((admin.role,admin.status,admin.organization_id),('admin','active',user.organization_id))
        logged = await self.login('new@synthetic.test')
        self.assertEqual(logged.status_code,200,logged.text)
        self.assertEqual(logged.json()['user']['id'],str(uid))
        self.assertEqual(logged.json()['user']['organization_id'],result.json()['organization_id'])
        self.assertNotIn('password',logged.text)

    async def test_registration_requires_email_verification_and_preserves_validation(self):
        token=await self.register_link()
        base=self.signup(token)
        for change,status,code in [
            ({'verification_token':'x'*43},400,'AUTH_LINK_INVALID'),
            ({'company_email':'other@synthetic.test'},400,'AUTH_LINK_INVALID'),
            ({'company_email':'bad'},400,'LEAD_EMAIL_INVALID'),
            ({'company_email':'test@gmail.com'},422,'LEAD_EMAIL_FREE_PROVIDER'),
            ({'terms_accepted':False},422,'TERMS_NOT_ACCEPTED'),
            ({'password_confirmation':NEW_PASSWORD},422,'AUTH_PASSWORD_MISMATCH'),
        ]:
            with self.subTest(code=code):
                r=await self.post('/leads',{**base,**change}); self.assertEqual(r.status_code,status,r.text); self.assertEqual(r.json()['error']['code'],code)
        missing=dict(base);del missing['verification_token']
        self.assertEqual((await self.post('/leads',missing)).status_code,400)
        self.assertEqual(await self.counts(),[1,0,0,0])

    async def test_duplicate_registration_tokens_cannot_create_second_org(self):
        first=await self.register_link(); second=await self.register_link()
        self.assertEqual((await self.post('/leads',self.signup(first))).status_code,201)
        self.assertEqual((await self.post('/leads',self.signup(first))).status_code,409)
        self.assertEqual((await self.post('/leads',self.signup(second))).status_code,409)
        self.assertEqual(await self.counts(),[1,1,1,1])

    async def test_existing_org_registration_is_generic_and_unchanged(self):
        uid,org=await self.account(email='new@synthetic.test')
        response=await self.post('/auth/register/request',{'email':'new@synthetic.test'})
        self.assertEqual(response.status_code,202);self.mail.assert_not_awaited()
        async with self.sessions() as db:self.assertEqual((await db.get(User,uid)).organization_id,org)

    async def test_legacy_no_org_account_reused_without_password_overwrite(self):
        uid,_=await self.account(email='new@synthetic.test',org=False)
        token=await self.register_link()
        bad={**self.signup(token),'password':NEW_PASSWORD,'password_confirmation':NEW_PASSWORD}
        self.assertEqual((await self.post('/leads',bad)).status_code,401)
        self.assertEqual((await self.post('/leads',self.signup(token))).status_code,201)
        async with self.sessions() as db:self.assertTrue(verify_password(PASSWORD,(await db.get(User,uid)).password_hash))
        self.assertEqual(await self.counts(),[1,1,1,1])

    async def test_registration_expiry_and_cross_purpose(self):
        token=await self.register_link()
        self.assertEqual((await self.post('/auth/verify',{'token':token})).status_code,400)
        self.assertEqual((await self.reset(token)).status_code,400)
        async with self.sessions.begin() as db:(await db.scalar(select(MagicLinkToken))).expires_at=now_utc()-timedelta(seconds=1)
        self.assertEqual((await self.post('/leads',self.signup(token))).status_code,410)
        self.assertEqual(await self.counts(),[1,0,0,0])

    async def test_login_wrong_unknown_passwordless_and_disabled_indistinguishable(self):
        await self.account()
        await self.account(email='passwordless@synthetic.test',password=None)
        await self.account(email='disabled@synthetic.test',status='disabled')
        responses=[await self.login(password='wrong phrase'),await self.login('unknown@synthetic.test'),await self.login('passwordless@synthetic.test'),await self.login('disabled@synthetic.test')]
        self.assertTrue(all(r.status_code==401 for r in responses))
        self.assertTrue(all(r.json()==responses[0].json() for r in responses))
        self.assertNotIn(PASSWORD,str([r.json() for r in responses]))

    async def test_login_normalizes_email_and_refresh_rotates(self):
        uid,org=await self.account()
        logged=await self.login(' EXISTING@SYNTHETIC.TEST ')
        self.assertEqual(logged.status_code,200,logged.text)
        self.assertEqual(logged.json()['user']['organization_id'],str(org))
        first=logged.json()['refresh_token']
        self.assertEqual((await self.post('/auth/refresh',{'refresh_token':first})).status_code,200)
        self.assertEqual((await self.post('/auth/refresh',{'refresh_token':first})).status_code,401)

    async def test_password_login_fails_closed_for_two_factor(self):
        await self.account(two_factor_enabled=True)
        r=await self.login(); self.assertEqual(r.status_code,403);self.assertEqual(r.json()['error']['code'],'AUTH_2FA_UNAVAILABLE')

    async def test_magic_link_remains_available_and_single_use(self):
        await self.account()
        r=await self.post('/auth/magic-link',{'email':'existing@synthetic.test'})
        self.assertEqual(r.status_code,202)
        token=self.raw(self.magic_mail)
        self.assertEqual((await self.post('/auth/verify',{'token':token})).status_code,200)
        self.assertEqual((await self.post('/auth/verify',{'token':token})).status_code,409)

    async def test_passwordless_user_can_set_password_and_preserves_tenant(self):
        uid,org=await self.account(password=None)
        token=await self.reset_link()
        self.assertEqual((await self.reset(token)).status_code,204)
        result=await self.login(password=NEW_PASSWORD)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['user']['id'],str(uid));self.assertEqual(result.json()['user']['organization_id'],str(org))

    async def test_reset_revokes_all_refresh_and_outstanding_links_once(self):
        uid,_=await self.account()
        sessions=[(await self.login()).json() for _ in range(2)]
        first=await self.reset_link();second=await self.reset_link()
        await self.post('/auth/magic-link',{'email':'existing@synthetic.test'})
        magic=self.raw(self.magic_mail)
        self.assertEqual((await self.reset(first)).status_code,204)
        self.assertEqual((await self.reset(first)).status_code,409)
        self.assertEqual((await self.reset(second)).status_code,409)
        self.assertEqual((await self.post('/auth/verify',{'token':magic})).status_code,409)
        for session in sessions:self.assertEqual((await self.post('/auth/refresh',{'refresh_token':session['refresh_token']})).status_code,401)
        self.assertEqual((await self.login()).status_code,401)
        self.assertEqual((await self.login(password=NEW_PASSWORD)).status_code,200)

    async def test_expired_reset_does_not_change_password_or_sessions(self):
        uid,_=await self.account()
        session=(await self.login()).json()
        token=await self.reset_link()
        async with self.sessions.begin() as db:(await db.scalar(select(MagicLinkToken))).expires_at=now_utc()-timedelta(seconds=1)
        self.assertEqual((await self.reset(token)).status_code,410)
        self.assertEqual((await self.login()).status_code,200)
        self.assertEqual((await self.post('/auth/refresh',{'refresh_token':session['refresh_token']})).status_code,200)

    async def test_reset_request_generic_for_missing_inactive_and_existing(self):
        await self.account();await self.account(email='disabled@synthetic.test',status='disabled')
        responses=[await self.post('/auth/password/reset/request',{'email':email}) for email in ['existing@synthetic.test','missing@synthetic.test','disabled@synthetic.test']]
        self.assertEqual([r.status_code for r in responses],[202]*3)
        self.assertTrue(all(r.json()==responses[0].json() for r in responses)); self.assertEqual(self.mail.await_count,1)

    async def test_invalid_reset_confirmation_and_length_dont_consume_token(self):
        await self.account(); token=await self.reset_link()
        self.assertEqual((await self.reset(token,confirmation=PASSWORD)).status_code,422)
        self.assertEqual((await self.reset(token,password='short')).status_code,400)
        self.assertEqual((await self.reset(token)).status_code,204)

    async def test_invitation_password_can_login_without_changing_membership(self):
        token='i'*43
        async with self.sessions.begin() as db:
            org=Organization(name='Inviting tenant');db.add(org);await db.flush();org_id=org.id
            db.add(Invitation(organization_id=org.id,email='invited@synthetic.test',full_name='Invited',area_key='finance',token_hash=hash_token(token),expires_at=now_utc()+timedelta(hours=1),status='sent'))
        accepted=await self.post('/invitations/accept',{'token':token,'password':PASSWORD})
        self.assertEqual(accepted.status_code,200,accepted.text)
        logged=await self.login('invited@synthetic.test')
        self.assertEqual(logged.status_code,200,logged.text);self.assertEqual(logged.json()['user']['organization_id'],str(org_id))
        self.assertEqual((await self.post('/invitations/accept',{'token':token,'password':PASSWORD})).status_code,409)

    async def test_recovery_cannot_cross_tenant_or_change_roles(self):
        uid,org=await self.account()
        other,other_org=await self.account(email='other@synthetic.test')
        token=await self.reset_link()
        self.assertEqual((await self.reset(token)).status_code,204)
        async with self.sessions() as db:
            owner=await db.get(User,uid);foreign=await db.get(User,other)
            self.assertEqual(owner.organization_id,org);self.assertEqual(owner.role,'client')
            self.assertEqual(foreign.organization_id,other_org);self.assertTrue(verify_password(PASSWORD,foreign.password_hash))

    async def test_rate_limit_login_and_email_requests(self):
        for _ in range(5):self.assertEqual((await self.login('unknown@synthetic.test')).status_code,401)
        self.assertEqual((await self.login('unknown@synthetic.test')).status_code,429)
        for _ in range(5):self.assertEqual((await self.post('/auth/password/reset/request',{'email':'unknown@synthetic.test'})).status_code,202)
        self.assertEqual((await self.post('/auth/password/reset/request',{'email':'unknown@synthetic.test'})).status_code,429)

    async def test_email_templates_four_languages_and_sensitive_delivery(self):
        await self.account()
        for lang,subject in [('es','Establece tu contraseña'),('en','Set your password'),('de','Passwort festlegen'),('pt','Defina a sua palavra-passe')]:
            await self.post('/auth/password/reset/request',{'email':'existing@synthetic.test','locale':lang})
            self.assertEqual(self.mail.call_args.args[1],subject);self.assertTrue(self.mail.call_args.kwargs['sensitive'])

    async def test_recovery_delivery_is_deferred_without_disclosing_account_existence(self):
        await self.account()
        tasks = BackgroundTasks()
        async with self.sessions.begin() as db:
            await request_password_reset(db, 'existing@synthetic.test', 'en', tasks)
            self.mail.assert_not_awaited()
        await tasks()
        self.mail.assert_awaited_once()

    async def test_reset_token_is_not_a_magic_or_registration_token(self):
        await self.account()
        token=await self.reset_link()
        self.assertEqual((await self.post('/auth/verify',{'token':token})).status_code,400)
        self.assertEqual((await self.post('/auth/register/preview',{'token':token})).status_code,400)
        self.assertEqual((await self.reset(token)).status_code,204)

    async def test_inactive_account_cannot_consume_a_previous_recovery_link(self):
        uid,_=await self.account()
        token=await self.reset_link()
        async with self.sessions.begin() as db:(await db.get(User,uid)).status='disabled'
        self.assertEqual((await self.reset(token)).status_code,400)
        async with self.sessions() as db:
            user=await db.get(User,uid)
            self.assertTrue(verify_password(PASSWORD,user.password_hash))
            self.assertIsNone((await db.scalar(select(MagicLinkToken))).used_at)

    async def test_registration_and_recovery_reject_expiry_exactly_at_now(self):
        token=await self.register_link()
        now=now_utc()
        async with self.sessions.begin() as db:(await db.scalar(select(MagicLinkToken))).expires_at=now
        with patch('app.services.credential_service.now_utc',return_value=now):
            response=await self.post('/leads',self.signup(token))
        self.assertEqual(response.status_code,410)
        self.assertEqual(await self.counts(),[1,0,0,0])
        await self.account()
        token=await self.reset_link()
        async with self.sessions.begin() as db:
            row=await db.scalar(select(MagicLinkToken).where(MagicLinkToken.token_hash==purpose_hash('password_reset',token)))
            row.expires_at=now
        with patch('app.services.credential_service.now_utc',return_value=now):
            response=await self.reset(token)
        self.assertEqual(response.status_code,410)


class EmailPrivacyTests(unittest.IsolatedAsyncioTestCase):
    async def test_sensitive_emails_never_use_console_fallback_even_in_dev(self):
        from app.integrations.email import send_email
        from app.core.config import settings
        for env,sensitive in [('production',False),('production',True),('dev',True)]:
            with patch.object(settings,'app_env',env),patch.object(settings,'acs_connection_string',''),self.assertLogs('app.email',level='WARNING') as captured:
                with self.assertRaises(RuntimeError):await send_email('synthetic@example.test','Synthetic','PRIVATE LINK TOKEN',sensitive=sensitive)
                self.assertNotIn('PRIVATE LINK TOKEN',str(captured.output));self.assertNotIn('synthetic@example.test',str(captured.output))

    async def test_limiter_window_expires_and_keeps_no_raw_identities(self):
        limiter=AuthLimiter()
        with patch('app.core.auth_limits.monotonic',return_value=100):
            for _ in range(5):limiter.check('login','private@synthetic.test','127.0.0.1')
            with self.assertRaises(APIError):limiter.check('login','private@synthetic.test','127.0.0.1')
        self.assertNotIn('private@synthetic.test',str(limiter.entries))
        with patch('app.core.auth_limits.monotonic',return_value=1001):limiter.check('login','private@synthetic.test','127.0.0.1')
