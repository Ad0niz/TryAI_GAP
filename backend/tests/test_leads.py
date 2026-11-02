"""Lead ownership and tenant isolation through real authentication and API routes."""
import os
import unittest
import uuid
from datetime import timedelta
from app.core.security import now_utc
from app.models import MagicLinkToken
from app.services.credential_service import purpose_hash

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.deps import get_db
from app.api.routes.leads import router
from app.core.errors import register_error_handlers
from app.core.security import create_access_token
from app.db.base import Base
from app.models import Lead, Organization, User


class LeadIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.execute(text("PRAGMA foreign_keys=ON"))
            await connection.run_sync(Base.metadata.create_all)
        self.org_a, self.org_b = uuid.uuid4(), uuid.uuid4()
        self.owner_a, self.owner_b, self.peer, self.unassigned, self.other_unassigned, self.admin = [uuid.uuid4() for _ in range(6)]
        self.lead_a, self.lead_b, self.lead_unassigned, self.orphan = [uuid.uuid4() for _ in range(4)]
        async with self.sessions.begin() as db:
            db.add_all([Organization(id=self.org_a, name="Synthetic A"), Organization(id=self.org_b, name="Synthetic B")])
            await db.flush()
            for uid, email, org, role in [
                (self.owner_a, "owner-a@example.test", self.org_a, "client"),
                (self.owner_b, "owner-b@example.test", self.org_b, "client"),
                (self.peer, "peer@example.test", self.org_a, "client"),
                (self.unassigned, "unassigned@example.test", None, "client"),
                (self.other_unassigned, "other-unassigned@example.test", None, "client"),
                (self.admin, "admin@example.test", self.org_a, "admin"),
            ]:
                db.add(User(id=uid, email=email, organization_id=org, role=role, status="active"))
            await db.flush()
            for lid, owner, name, email in [
                (self.lead_a, self.owner_a, "Synthetic own contact", "own-contact@example.test"),
                (self.lead_b, self.owner_b, "PRIVATE FOREIGN CONTACT", "private-foreign@example.test"),
                (self.lead_unassigned, self.unassigned, "Unassigned contact", "unassigned-contact@example.test"),
                (self.orphan, None, "PRIVATE ORPHAN CONTACT", "private-orphan@example.test"),
            ]:
                db.add(Lead(id=lid, user_id=owner, full_name=name, company_email=email,
                            company_name="Synthetic company", terms_accepted=True, locale="es"))
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

    def headers(self, uid):
        return {"Authorization": "Bearer " + create_access_token(str(uid))}

    async def read(self, lid, uid=None):
        return await self.client.get(f"/api/v1/leads/{lid}", headers=self.headers(uid or self.owner_a))

    async def test_owner_reads_own_lead_with_unchanged_response(self):
        result = await self.read(self.lead_a)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["id"], str(self.lead_a))
        self.assertEqual(result.json()["user_id"], str(self.owner_a))
        self.assertEqual(result.json()["company_email"], "own-contact@example.test")
        self.assertTrue(result.json()["terms_accepted"])

    async def test_same_organization_access_does_not_add_role_restrictions(self):
        self.assertEqual((await self.read(self.lead_a, self.peer)).status_code, 200)

    async def test_foreign_lead_is_indistinguishable_from_missing_and_exposes_no_data(self):
        foreign = await self.read(self.lead_b)
        missing = await self.read(uuid.uuid4())
        self.assertEqual(foreign.status_code, 404, foreign.text)
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(foreign.json(), missing.json())
        self.assertEqual(foreign.json()["error"]["code"], "RESOURCE_NOT_FOUND")
        for sensitive in ["PRIVATE FOREIGN CONTACT", "private-foreign@example.test", str(self.owner_b), str(self.org_b), str(self.lead_b)]:
            self.assertNotIn(sensitive, foreign.text)
        async with self.sessions() as db:
            lead = await db.get(Lead, self.lead_b)
            self.assertEqual(lead.full_name, "PRIVATE FOREIGN CONTACT")
            self.assertEqual(lead.user_id, self.owner_b)

    async def test_reverse_cross_tenant_read_also_rejected(self):
        self.assertEqual((await self.read(self.lead_a, self.owner_b)).status_code, 404)

    async def test_no_authentication_is_rejected_before_returning_lead(self):
        for lid in [self.lead_a, self.lead_b, uuid.uuid4()]:
            result = await self.client.get(f"/api/v1/leads/{lid}")
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.json()["error"]["code"], "UNAUTHENTICATED")
            self.assertNotIn("company_email", result.json())

    async def test_orphan_lead_cannot_be_read(self):
        self.assertEqual((await self.read(self.orphan)).status_code, 404)
        self.assertEqual((await self.read(self.orphan, self.unassigned)).status_code, 404)

    async def test_unassigned_owner_can_read_own_lead_but_null_org_is_not_shared(self):
        self.assertEqual((await self.read(self.lead_unassigned, self.unassigned)).status_code, 200)
        self.assertEqual((await self.read(self.lead_unassigned, self.other_unassigned)).status_code, 404)
        self.assertEqual((await self.read(self.lead_a, self.unassigned)).status_code, 404)
        self.assertEqual((await self.read(self.lead_unassigned, self.owner_a)).status_code, 404)

    async def test_global_role_does_not_implicitly_bypass_tenant_scope(self):
        self.assertEqual((await self.read(self.lead_b, self.admin)).status_code, 404)

    async def test_public_creation_still_links_owner_org_and_allows_subsequent_read(self):
        raw = "s" * 43
        async with self.sessions.begin() as db:
            user = User(email="signup@synthetic-company.test", status="invited", role="client")
            db.add(user); await db.flush()
            db.add(MagicLinkToken(user_id=user.id, token_hash=purpose_hash("register",raw), expires_at=now_utc()+timedelta(minutes=15)))
        result = await self.client.post("/api/v1/leads", json={
            "verification_token":raw,"password":"Synthetic passphrase 2026!","password_confirmation":"Synthetic passphrase 2026!",
            "full_name": "Synthetic signup", "company_email": "signup@synthetic-company.test",
            "company_name": "Synthetic signup company", "terms_accepted": True,
        })
        self.assertEqual(result.status_code, 201, result.text)
        created = result.json()
        own = await self.client.get(f"/api/v1/leads/{created['lead_id']}",
                                    headers={"Authorization": "Bearer " + created["access_token"]})
        self.assertEqual(own.status_code, 200, own.text)
        self.assertEqual(own.json()["full_name"], "Synthetic signup")
        async with self.sessions() as db:
            owner = await db.get(User, uuid.UUID(own.json()["user_id"]))
            self.assertEqual(str(owner.organization_id), created["organization_id"])
        self.assertEqual((await self.read(created["lead_id"])).status_code, 404)

    async def test_public_creation_validation_and_duplicates_remain_unchanged(self):
        before = None
        async with self.sessions() as db:
            before = await db.scalar(select(func.count()).select_from(Lead))
        raw = "s" * 43
        async with self.sessions.begin() as db:
            db.add(MagicLinkToken(user_id=self.owner_a, token_hash=purpose_hash("register",raw), expires_at=now_utc()+timedelta(minutes=15)))
        base = {"full_name": "Synthetic", "company_name": "Synthetic", "terms_accepted": True,
                "verification_token":raw,"password":"Synthetic passphrase 2026!","password_confirmation":"Synthetic passphrase 2026!"}
        for changes, status, code in [
            ({"company_email": "invalid"}, 400, "LEAD_EMAIL_INVALID"),
            ({"company_email": "person@gmail.com"}, 422, "LEAD_EMAIL_FREE_PROVIDER"),
            ({"company_email": "terms@synthetic-company.test", "terms_accepted": False}, 422, "TERMS_NOT_ACCEPTED"),
            ({"company_email": "owner-a@example.test"}, 409, "LEAD_ALREADY_EXISTS"),
        ]:
            result = await self.client.post("/api/v1/leads", json={**base, **changes})
            self.assertEqual(result.status_code, status, result.text)
            self.assertEqual(result.json()["error"]["code"], code)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(Lead)), before)
