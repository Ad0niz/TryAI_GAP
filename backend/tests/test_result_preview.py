"""APP-06 results access through real routes with an isolated in-memory database."""
import os
import unittest
from uuid import uuid4

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.results import router
from app.api.routes.consultant import router as consultant_router
from app.core.errors import register_error_handlers
from app.models import Answer, Assessment, Organization, Question, ReportJob, User


class ResultPreviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with self.engine.begin() as connection:
            for model in (Organization, User, Assessment, Question, Answer, ReportJob):
                await connection.run_sync(model.__table__.create)
        self.organization = Organization(id=uuid4(), name="Preview A", plan="free")
        self.other_org = uuid4()
        self.assessment_id, self.other_id = uuid4(), uuid4()
        self.user = User(id=uuid4(), email="preview@example.test", role="client", locale="es",
                         organization_id=self.organization.id)
        self.ids = [uuid4() for _ in range(20)]
        self.area_id = uuid4()
        async with self.sessions.begin() as db:
            db.add_all([self.organization, Organization(id=self.other_org, name="Preview B", plan="pro")])
            await db.flush()
            db.add(self.user)
            db.add_all([Assessment(id=self.assessment_id, organization_id=self.organization.id, plan="free"),
                        Assessment(id=self.other_id, organization_id=self.other_org, plan="pro")])
            for i, qid in enumerate(self.ids):
                db.add(Question(id=qid, module="maturity", code=f"M{i}", block_id="ABCDE"[i // 4],
                                dimension=["datos", "tech", "talento", "procesos", "cultura"][i // 4]))
            db.add(Question(id=self.area_id, module="area", area_key="ventas", code="A1", block_id="A"))
        await make_admin(self.engine, self.sessions, self.user.id, self.organization.id)
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/v1")
        self.app.include_router(consultant_router, prefix="/api/v1")
        register_error_handlers(self.app)

        async def test_db():
            async with self.sessions.begin() as db:
                yield db

        self.app.dependency_overrides[get_db] = test_db
        self.app.dependency_overrides[get_current_user] = lambda: CurrentUser(self.user, self.organization)
        self.client = AsyncClient(transport=ASGITransport(app=self.app), base_url="http://test")
        self.url = f"/api/v1/results/{self.assessment_id}"

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def answer(self, index, value=4, state="answered", assessment_id=None):
        async with self.sessions.begin() as db:
            db.add(Answer(assessment_id=assessment_id or self.assessment_id,
                          question_id=self.ids[index], value=value, state=state))

    async def preview(self):
        response = await self.client.get(self.url + "/preview")
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(set(result), {"provisional", "details_locked", "average", "numeric_answers", "total_questions"})
        self.assertTrue(result["provisional"])
        self.assertEqual(result["total_questions"], 20)
        return result

    async def test_free_without_answers_has_no_zero_score(self):
        result = await self.preview()
        self.assertIsNone(result["average"])
        self.assertEqual(result["numeric_answers"], 0)
        self.assertTrue(result["details_locked"])

    async def test_free_one_through_five_answers_uses_real_scores_without_missing_zeros(self):
        for i in range(5):
            await self.answer(i, 3)
            with self.subTest(count=i + 1):
                result = await self.preview()
                self.assertEqual(result["average"], 3)
                self.assertEqual(result["numeric_answers"], i + 1)

    async def test_preview_reuses_equal_dimension_average_and_keeps_details_identical_for_pro(self):
        await self.answer(0, 1)
        await self.answer(1, 5)
        await self.answer(4, 5)
        result = await self.preview()
        self.assertEqual(result["average"], 4)  # mean of dimension means: (3 + 5) / 2
        self.organization.plan = "pro"
        response = await self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.text)
        full = response.json()
        self.assertEqual(full["maturity"]["average"], result["average"])
        self.assertEqual([d["score"] for d in full["maturity"]["dimensions"]], [3, 5, 0, 0, 0])
        self.assertEqual(full["heatmap"], {"vectors": ["Bloque A", "Bloque B", "Bloque C", "Bloque D"], "areas": []})

    async def test_non_numeric_states_and_area_answers_do_not_contribute(self):
        for i, state in enumerate(["idk", "delegated", "pending", "answered"]):
            await self.answer(i, None if state == "answered" else 5, state)
        async with self.sessions.begin() as db:
            db.add(Answer(assessment_id=self.assessment_id, question_id=self.area_id, value=5, state="answered"))
        result = await self.preview()
        self.assertIsNone(result["average"])
        self.assertEqual(result["numeric_answers"], 0)

    async def test_free_cannot_force_details_or_reports_with_query_parameters(self):
        await self.answer(0)
        for suffix in ("", "?plan=pro&details=true", "/report"):
            response = await self.client.get(self.url + suffix)
            self.assertEqual(response.status_code, 402, response.text)
            self.assertEqual(response.json()["error"]["code"], "PLAN_UPGRADE_REQUIRED")
        response = await self.client.post(self.url + "/report", json={"locale": "en", "plan": "pro"})
        self.assertEqual(response.status_code, 402)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count(ReportJob.id))), 0)
        response = await self.client.get(self.url + "/preview?details=true&plan=pro")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), await self.preview())

    async def test_client_cannot_use_consultant_routes_to_bypass_paywall(self):
        for suffix in ("/kpis", "/clients", f"/clients/{self.organization.id}"):
            response = await self.client.get("/api/v1/consultant" + suffix)
            self.assertEqual(response.status_code, 403, response.text)

    async def test_cross_tenant_access_is_forbidden_and_other_answers_do_not_affect_preview(self):
        await self.answer(0, 5, assessment_id=self.other_id)
        result = await self.preview()
        self.assertIsNone(result["average"])
        for plan in ("free", "pro"):
            self.organization.plan = plan
            response = await self.client.get(f"/api/v1/results/{self.other_id}/preview")
            self.assertEqual(response.status_code, 403)
        response = await self.client.get(f"/api/v1/results/{self.other_id}")
        self.assertEqual(response.status_code, 403)

    async def test_real_organization_plan_controls_access_even_when_assessment_plan_is_stale(self):
        await self.answer(0)
        self.organization.plan = "pro"
        self.assertFalse((await self.preview())["details_locked"])
        self.assertEqual((await self.client.get(self.url)).status_code, 200)
        self.organization.plan = "free"
        async with self.sessions.begin() as db:
            assessment = await db.get(Assessment, self.assessment_id)
            assessment.plan = "pro"
        self.assertTrue((await self.preview())["details_locked"])
        self.assertEqual((await self.client.get(self.url)).status_code, 402)

    async def test_preview_does_not_expose_details_even_for_legacy_free_with_twenty_answers(self):
        for i in range(20):
            await self.answer(i)
        result = await self.preview()
        self.assertTrue(result["details_locked"])
        self.assertEqual(result["numeric_answers"], 20)
        self.assertEqual((await self.client.get(self.url)).status_code, 402)

    async def test_preview_requires_authentication(self):
        del self.app.dependency_overrides[get_current_user]
        response = await self.client.get(self.url + "/preview")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
