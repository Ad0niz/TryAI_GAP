"""Organization API regression tests with an isolated, in-memory SQLite database.

Run from backend: python -m unittest discover -s tests -v
Authentication is overridden; real routes, schemas, services and transactions run.
"""
import os
import unittest
import uuid

# Never connect these tests to a configured development or production database.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.organizations import router
from app.core.errors import register_error_handlers
from app.models import Organization, User


class OrganizationAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as connection:
            await connection.run_sync(Organization.__table__.create)
        self.org_id = uuid.uuid4()
        self.other_id = uuid.uuid4()
        async with self.sessions.begin() as db:
            db.add_all([
                Organization(id=self.org_id, name="Company A", legal_name="Company A Ltd",
                             address="Street 123", tax_id="TAX-A", currency="CLP"),
                Organization(id=self.other_id, name="Company B"),
            ])
        self.user_id = uuid.uuid4()
        await make_admin(self.engine,self.sessions,self.user_id,self.org_id)
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        register_error_handlers(app)

        async def test_db():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user=User(id=self.user_id, organization_id=self.org_id, role="client"),
            organization=None,
        )
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.url = f"/api/v1/organizations/{self.org_id}"

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def test_get_returns_legal_fields(self):
        response = await self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["legal_name"], "Company A Ltd")
        self.assertEqual(data["address"], "Street 123")
        self.assertEqual(data["tax_id"], "TAX-A")

    async def test_patch_persists_for_next_get_and_can_clear_optional_fields(self):
        changes = {"name": "Updated", "sector": "Technology", "size": "10–49",
                   "country": "Chile", "currency": "USD", "legal_name": "Updated Ltd",
                   "address": "New street", "tax_id": None}
        patched = await self.client.patch(self.url, json=changes)
        self.assertEqual(patched.status_code, 200)
        fetched = await self.client.get(self.url)
        self.assertEqual(fetched.status_code, 200)
        for key, value in changes.items():
            self.assertEqual(patched.json()[key], value)
            self.assertEqual(fetched.json()[key], value)

    async def test_other_tenant_get_and_patch_are_forbidden(self):
        url = f"/api/v1/organizations/{self.other_id}"
        fetched = await self.client.get(url)
        patched = await self.client.patch(url, json={"name": "Unauthorized"})
        self.assertEqual(fetched.status_code, 403)
        self.assertEqual(patched.status_code, 403)
        async with self.sessions() as db:
            other = await db.get(Organization, self.other_id)
            self.assertEqual(other.name, "Company B")

    async def test_patch_cannot_modify_plan_or_identity(self):
        result = await self.client.patch(self.url, json={
            "id": str(self.other_id), "organization_id": str(self.other_id), "plan": "pro",
        })
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["id"], str(self.org_id))
        self.assertEqual(result.json()["plan"], "free")


if __name__ == "__main__":
    unittest.main()
