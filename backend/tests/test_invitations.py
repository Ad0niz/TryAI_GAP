"""APP-11: real public routes, isolated DB, mocked outbound email only."""
import os
import re
import unittest
import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.team import router
from app.api.routes.auth import router as auth_router
from app.core.errors import register_error_handlers
from app.core.passwords import hash_password, verify_password
from app.core.security import as_utc, generate_opaque_token, hash_token, now_utc
from app.db.base import Base
from app.models import Invitation, Organization, OrgMember, RefreshToken, User

PASSWORD = "Una frase privada 2026!"


class InvitationAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.org_id = uuid.uuid4()
        self.other_id = uuid.uuid4()
        self.inv_id = uuid.uuid4()
        self.token = generate_opaque_token()
        self.email = "invited@example.com"
        async with self.sessions.begin() as db:
            db.add_all([Organization(id=self.org_id, name="Empresa invitante"),
                        Organization(id=self.other_id, name="Otra empresa")])
            await db.flush()
            db.add(Invitation(id=self.inv_id, organization_id=self.org_id, full_name="Persona invitada",
                              email=self.email, area_key="finance", token_hash=hash_token(self.token),
                              expires_at=now_utc() + timedelta(hours=72), status="sent"))
            db.add(OrgMember(organization_id=self.org_id, area_key="finance", status="invited", role="leader"))
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/v1")
        self.app.include_router(auth_router, prefix="/api/v1")
        register_error_handlers(self.app)

        async def test_db():
            async with self.sessions.begin() as db:
                yield db

        self.app.dependency_overrides[get_db] = test_db
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url="http://test")
        self.mail = patch("app.services.team_service._safe_send", new_callable=AsyncMock)
        self.send = self.mail.start()

    async def asyncTearDown(self):
        self.mail.stop()
        await self.client.aclose()
        await self.engine.dispose()

    async def accept(self, **overrides):
        return await self.client.post("/api/v1/invitations/accept", json={
            "token": self.token, "password": PASSWORD, **overrides,
        })

    async def assert_untouched(self):
        async with self.sessions() as db:
            inv = await db.get(Invitation, self.inv_id)
            self.assertEqual(inv.status, "sent")
            self.assertIsNone(inv.accepted_at)
            self.assertEqual(await db.scalar(select(func.count()).select_from(RefreshToken)), 0)

    async def as_organizer(self):
        self.organizer_id = uuid.uuid4()
        await make_admin(self.engine,self.sessions,self.organizer_id,self.org_id)
        self.app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user=User(id=self.organizer_id, organization_id=self.org_id, role="client"), organization=None,
        )

    async def test_valid_preview_does_not_consume_then_accepts_and_auth_me_has_org(self):
        for _ in range(2):
            preview = await self.client.get(f"/api/v1/invitations/{self.token}")
            self.assertEqual(preview.status_code, 200)
            self.assertEqual(preview.headers["cache-control"], "no-store")
            self.assertFalse(preview.json()["password_is_set"])
        await self.assert_untouched()
        result = await self.accept()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["user"]["organization_id"], str(self.org_id))
        self.assertNotIn("password", result.text)
        me = await self.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {result.json()['access_token']}"})
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["organization_id"], str(self.org_id))
        async with self.sessions() as db:
            inv = await db.get(Invitation, self.inv_id)
            self.assertEqual(inv.status, "accepted")
            self.assertIsNotNone(inv.accepted_at)
            user = (await db.execute(select(User))).scalar_one()
            self.assertEqual(user.status, "active")
            self.assertEqual(user.role, "client")
            self.assertTrue(verify_password(PASSWORD, user.password_hash))
            member = (await db.execute(select(OrgMember))).scalar_one()
            self.assertEqual(member.user_id, user.id)
            self.assertEqual(member.area_key, "finance")
            self.assertEqual(member.status, "active")

    async def test_invalid_token_rejected_without_changes(self):
        for token in ["bad", generate_opaque_token()]:
            result = await self.accept(token=token)
            self.assertEqual(result.status_code, 400)
            self.assertEqual(result.json()["error"]["code"], "INVITE_TOKEN_INVALID")
        await self.assert_untouched()

    async def test_expired_and_legacy_tokens_require_resend(self):
        for expiration in [now_utc() - timedelta(seconds=1), None]:
            async with self.sessions.begin() as db:
                (await db.get(Invitation, self.inv_id)).expires_at = expiration
            for result in [await self.accept(), await self.client.get(f"/api/v1/invitations/{self.token}")]:
                self.assertEqual(result.status_code, 410)
                self.assertEqual(result.json()["error"]["code"], "INVITE_TOKEN_EXPIRED")
            await self.assert_untouched()

    async def test_used_token_does_not_issue_more_sessions_or_members(self):
        self.assertEqual((await self.accept()).status_code, 200)
        for result in [await self.accept(), await self.client.get(f"/api/v1/invitations/{self.token}")]:
            self.assertEqual(result.status_code, 409)
            self.assertEqual(result.json()["error"]["code"], "INVITE_ALREADY_ACCEPTED")
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(OrgMember)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(RefreshToken)), 1)

    async def test_password_validation_and_extra_identity_fields_rejected(self):
        for changes in [{"password": "short"}, {"password": "x" * 129}, {"password": " " * 12},
                        {"organization_id": str(self.other_id)}, {"role": "admin"}, {"email": "other@example.com"}]:
            self.assertIn((await self.accept(**changes)).status_code, (400, 422))
        await self.assert_untouched()

    async def test_existing_unassigned_account_activated_without_duplicate(self):
        uid = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=uid, email=self.email, full_name="Nombre previo", status="invited", locale="en"))
        result = await self.accept()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["user"]["id"], str(uid))
        self.assertEqual(result.json()["user"]["full_name"], "Nombre previo")
        self.assertEqual(result.json()["user"]["locale"], "en")
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(User)), 1)

    async def test_existing_password_verified_never_replaced_and_membership_reused(self):
        hashed = hash_password(PASSWORD)
        uid = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=uid, email=self.email, password_hash=hashed, organization_id=self.org_id))
            await db.flush()
            member = (await db.execute(select(OrgMember))).scalar_one()
            member.user_id, member.status, member.role = uid, "active", "admin"
        preview = await self.client.get(f"/api/v1/invitations/{self.token}")
        self.assertTrue(preview.json()["password_is_set"])
        incorrect = await self.accept(password="Otra frase privada 2026!")
        self.assertEqual(incorrect.json()["error"]["code"], "INVITE_PASSWORD_INCORRECT")
        await self.assert_untouched()
        self.assertEqual((await self.accept()).status_code, 200)
        async with self.sessions() as db:
            self.assertEqual((await db.get(User, uid)).password_hash, hashed)
            member = (await db.execute(select(OrgMember))).scalar_one()
            self.assertEqual(member.role, "admin")

    async def test_no_cross_org_move_disabled_reactivation_or_global_role_elevation(self):
        uid = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=uid, email=self.email, organization_id=self.other_id))
        result = await self.accept()
        self.assertEqual(result.json()["error"]["code"], "INVITE_ACCOUNT_CONFLICT")
        async with self.sessions.begin() as db:
            user = await db.get(User, uid)
            self.assertEqual(user.organization_id, self.other_id)
            user.organization_id, user.status = None, "disabled"
        self.assertEqual((await self.accept()).json()["error"]["code"], "INVITE_ACCOUNT_DISABLED")
        async with self.sessions.begin() as db:
            user = await db.get(User, uid)
            user.status, user.role = "active", "admin"
        self.assertEqual((await self.accept()).json()["error"]["code"], "INVITE_ACCOUNT_CONFLICT")
        await self.assert_untouched()

    async def test_member_in_same_area_is_not_overwritten(self):
        uid = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=uid, email="leader@example.com", organization_id=self.org_id))
            await db.flush()
            member = (await db.execute(select(OrgMember))).scalar_one()
            member.user_id, member.status = uid, "active"
        self.assertEqual((await self.accept()).status_code, 200)
        async with self.sessions() as db:
            members = (await db.execute(select(OrgMember))).scalars().all()
            self.assertEqual(len(members), 2)
            self.assertIn(uid, [member.user_id for member in members])

    async def test_resend_rotates_expired_token_and_accepted_cannot_be_resent(self):
        await self.as_organizer()
        async with self.sessions.begin() as db:
            (await db.get(Invitation, self.inv_id)).expires_at = None
        response = await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend")
        self.assertEqual(response.status_code, 200)
        raw = re.search(r'/invite/([A-Za-z0-9_-]+)', self.send.call_args.args[2]).group(1)
        self.assertNotEqual(raw, self.token)
        self.assertEqual((await self.accept()).json()["error"]["code"], "INVITE_TOKEN_INVALID")
        self.token = raw
        self.assertEqual((await self.accept()).status_code, 200)
        self.assertEqual((await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend")).status_code, 409)
        self.assertEqual(self.send.await_count, 1)

    async def test_creation_stores_only_hash_and_expiry_and_duplicate_active_rejected(self):
        await self.as_organizer()
        payload = {"full_name": "New person", "email": " NEW@example.com ", "area_key": "sales"}
        result = await self.client.post("/api/v1/invitations", json=payload)
        self.assertEqual(result.status_code, 201, result.text)
        raw = re.search(r'/invite/([A-Za-z0-9_-]+)', self.send.call_args.args[2]).group(1)
        self.assertEqual(len(raw), 43)
        async with self.sessions() as db:
            invitation = await db.get(Invitation, uuid.UUID(result.json()["invitation_id"]))
            self.assertEqual(invitation.token_hash, hash_token(raw))
            self.assertGreater(as_utc(invitation.expires_at), now_utc() + timedelta(hours=71))
        self.assertEqual((await self.client.post("/api/v1/invitations", json=payload)).status_code, 409)

    async def test_expired_status_visible_in_team_and_can_create_replacement(self):
        await self.as_organizer()
        async with self.sessions.begin() as db:
            (await db.get(Invitation, self.inv_id)).expires_at = None
        roster = await self.client.get("/api/v1/team")
        self.assertEqual(roster.json()["invitations"][0]["status"], "expired")
        result = await self.client.post("/api/v1/invitations", json={
            "email": self.email, "full_name": "Persona", "area_key": "finance",
        })
        self.assertEqual(result.status_code, 201, result.text)
        # Resending an older expired invitation must not make duplicate detection crash.
        self.assertEqual((await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend")).status_code, 200)
        duplicate = await self.client.post("/api/v1/invitations", json={
            "email": self.email, "full_name": "Persona", "area_key": "finance",
        })
        self.assertEqual(duplicate.status_code, 409)

    async def test_failure_after_claim_rolls_back_account_membership_and_token(self):
        with patch("app.services.invitation_service.issue_tokens", side_effect=RuntimeError("test rollback")):
            with self.assertRaises(RuntimeError):
                await self.accept()
        await self.assert_untouched()
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(User)), 0)
            self.assertEqual((await db.execute(select(OrgMember))).scalar_one().status, "invited")

    async def test_creation_accepts_existing_same_org_and_unassigned_accounts(self):
        await self.as_organizer()
        for index, org_id in enumerate([self.org_id, None]):
            email = f"allowed{index}@example.com"
            uid = uuid.uuid4()
            async with self.sessions.begin() as db:
                db.add(User(id=uid, email=email.upper(), organization_id=org_id))
            response = await self.client.post("/api/v1/invitations", json={
                "email": f" {email} ", "full_name": "Allowed", "area_key": "sales",
            })
            self.assertEqual(response.status_code, 201, response.text)
            async with self.sessions() as db:
                self.assertEqual((await db.get(User, uid)).organization_id, org_id)
        self.assertEqual(self.send.await_count, 2)

    async def test_create_conflicting_recipient_has_no_writes_or_email(self):
        await self.as_organizer()
        uid = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add(User(id=uid, email="CONFLICT@example.com", organization_id=self.other_id))
        with patch("app.services.team_service.generate_opaque_token", return_value="x" * 43) as generate:
            response = await self.client.post("/api/v1/invitations", json={
                "email": " Conflict@example.com ", "full_name": "Conflict", "area_key": "sales",
            })
            generate.assert_not_called()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["error"]["code"], "INVITE_ACCOUNT_CONFLICT")
        self.assertNotIn(str(self.other_id), response.text)
        self.assertNotIn("Otra empresa", response.text)
        self.send.assert_not_awaited()
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Invitation)), 1)
            self.assertEqual(await db.scalar(select(func.count()).select_from(OrgMember)), 2)
            self.assertEqual((await db.get(User, uid)).organization_id, self.other_id)

    async def test_resend_conflict_preserves_existing_token_expiry_and_status(self):
        await self.as_organizer()
        async with self.sessions.begin() as db:
            db.add(User(email=self.email.upper(), organization_id=self.other_id))
            invitation = await db.get(Invitation, self.inv_id)
            invitation.expires_at = now_utc() - timedelta(hours=1)
        async with self.sessions() as db:
            invitation = await db.get(Invitation, self.inv_id)
            before = (invitation.token_hash, invitation.expires_at, invitation.status, invitation.updated_at)
        with patch("app.services.team_service.generate_opaque_token", return_value="x" * 43) as generate:
            response = await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend")
            generate.assert_not_called()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["error"]["code"], "INVITE_ACCOUNT_CONFLICT")
        self.send.assert_not_awaited()
        async with self.sessions() as db:
            invitation = await db.get(Invitation, self.inv_id)
            self.assertEqual((invitation.token_hash, invitation.expires_at, invitation.status, invitation.updated_at), before)
        # Ownership is checked before looking up the recipient.
        self.app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user=User(id=uuid.uuid4(), organization_id=self.other_id, role="client"), organization=None,
        )
        response = await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend")
        self.assertEqual(response.status_code, 404)

    async def test_create_and_resend_reuse_disabled_and_role_guards(self):
        await self.as_organizer()
        uid = uuid.uuid4()
        for status, role, code, http_status in [
            ("disabled", "client", "INVITE_ACCOUNT_DISABLED", 403),
            ("active", "admin", "INVITE_ACCOUNT_CONFLICT", 409),
        ]:
            async with self.sessions.begin() as db:
                user = await db.get(User, uid)
                if user is None:
                    user = User(id=uid, email=self.email)
                    db.add(user)
                user.status, user.role = status, role
            for response in [
                await self.client.post("/api/v1/invitations", json={
                    "email": self.email, "full_name": "Blocked", "area_key": "sales",
                }),
                await self.client.post(f"/api/v1/invitations/{self.inv_id}/resend"),
            ]:
                self.assertEqual(response.status_code, http_status, response.text)
                self.assertEqual(response.json()["error"]["code"], code)
        self.send.assert_not_awaited()
        await self.assert_untouched()



if __name__ == "__main__":
    unittest.main()
