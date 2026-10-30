"""Area progress API regressions using an isolated, in-memory SQLite database."""
import os
import unittest
import uuid

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.areas import router as areas_router
from app.api.routes.assessments import router as assessments_router
from app.core.errors import register_error_handlers
from app.models import Answer, AreaState, Assessment, Organization, Question, User


class AreaProgressAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with self.engine.begin() as connection:
            for model in (Organization, User, Assessment, Question, Answer, AreaState):
                await connection.run_sync(model.__table__.create)
        self.org_id, self.other_org_id = uuid.uuid4(), uuid.uuid4()
        self.assessment_id, self.other_assessment_id = uuid.uuid4(), uuid.uuid4()
        self.same_org_assessment_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.questions = {key: [uuid.uuid4() for _ in range(16)]
                          for key in ("ventas", "marketing")}
        self.maturity_id = uuid.uuid4()
        self.organization = Organization(id=self.org_id, name="Progress A", plan="pro")
        async with self.sessions.begin() as db:
            db.add_all([self.organization,
                        Organization(id=self.other_org_id, name="Progress B", plan="pro")])
            await db.flush()
            db.add(User(id=self.user_id, email="progress@example.test", role="client",
                        organization_id=self.org_id, locale="es"))
            db.add_all([
                Assessment(id=self.assessment_id, organization_id=self.org_id, plan="pro"),
                Assessment(id=self.other_assessment_id, organization_id=self.other_org_id, plan="pro"),
                Assessment(id=self.same_org_assessment_id, organization_id=self.org_id, plan="pro"),
            ])
            for key, ids in self.questions.items():
                for index, question_id in enumerate(ids):
                    db.add(Question(id=question_id, module="area", area_key=key,
                                    block_id="ABCD"[index // 4], code=f"Q{index + 1}",
                                    position=index % 4))
            db.add(Question(id=self.maturity_id, module="maturity", area_key="ventas",
                            block_id="M", code="M1", position=0))
            db.add_all([AreaState(assessment_id=self.assessment_id, area_key=key,
                                  active=True, progress=0) for key in self.questions])

        await make_admin(self.engine, self.sessions, self.user_id, self.org_id)
        app = FastAPI()
        app.include_router(areas_router, prefix="/api/v1")
        app.include_router(assessments_router, prefix="/api/v1")
        register_error_handlers(app)

        async def test_db():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user=User(id=self.user_id, organization_id=self.org_id, role="client", locale="es"),
            organization=self.organization,
        )
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.url = f"/api/v1/assessments/{self.assessment_id}"

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def save_answers(self, key="ventas", count=16):
        response = await self.client.post(self.url + "/answers:batch", json={
            "answers": [{"question_id": str(qid), "state": "answered", "value": 4}
                        for qid in self.questions[key][:count]],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"saved": count, "failed": []})

    async def areas(self):
        response = await self.client.get(self.url + "/areas")
        self.assertEqual(response.status_code, 200)
        return {item["area_key"]: item for item in response.json()["items"]}

    async def overall(self):
        response = await self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return response.json()["progress"]["areas_overall"]

    async def test_zero_half_and_full_progress_from_persisted_answers(self):
        for count, expected in ((0, 0), (8, 50), (16, 100)):
            with self.subTest(count=count):
                await self.save_answers(count=count)
                areas = await self.areas()
                self.assertEqual(areas["ventas"]["progress"], expected)
                self.assertEqual(areas["marketing"]["progress"], 0)
                self.assertEqual(await self.overall(), round(expected / 2))

    async def test_individual_upsert_counts_registered_states_and_excludes_pending(self):
        for qid, state in zip(self.questions["ventas"], ["answered", "idk", "delegated", "pending"] * 4):
            response = await self.client.put(self.url + f"/answers/{qid}", json={
                "state": state, "value": 3 if state == "answered" else None,
            })
            self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.areas())["ventas"]["progress"], 75)
        # Editing a saved answer must not count it twice; reverting to pending reduces progress.
        response = await self.client.post(self.url + "/answers:batch", json={
            "answers": [{"question_id": str(self.questions["ventas"][0]), "state": "pending"}],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.areas())["ventas"]["progress"], 69)

    async def test_other_tenant_and_other_assessment_answers_do_not_contribute(self):
        async with self.sessions.begin() as db:
            for aid in (self.other_assessment_id, self.same_org_assessment_id):
                db.add_all([Answer(assessment_id=aid, question_id=qid, state="answered", value=5)
                            for qid in self.questions["ventas"]])
            db.add(Answer(assessment_id=self.assessment_id, question_id=self.maturity_id,
                          state="answered", value=5))
        self.assertEqual((await self.areas())["ventas"]["progress"], 0)
        self.assertEqual(await self.overall(), 0)
        await self.save_answers(count=8)
        self.assertEqual((await self.areas())["ventas"]["progress"], 50)
        other_url = f"/api/v1/assessments/{self.other_assessment_id}"
        for suffix in ("", "/areas"):
            self.assertEqual((await self.client.get(other_url + suffix)).status_code, 403)
        response = await self.client.post(other_url + "/areas/ventas:activate")
        self.assertEqual(response.status_code, 403)

    async def test_deactivation_excludes_area_without_losing_answers_and_reactivation_restores_progress(self):
        await self.save_answers()
        await self.save_answers("marketing", 8)
        self.assertEqual(await self.overall(), 75)
        response = await self.client.delete(self.url + "/areas/ventas")
        self.assertEqual(response.status_code, 204)
        areas = await self.areas()
        self.assertFalse(areas["ventas"]["active"])
        self.assertEqual(areas["ventas"]["progress"], 100)
        self.assertEqual(await self.overall(), 50)
        response = await self.client.post(self.url + "/areas/ventas:activate")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"area_key": "ventas", "active": True, "progress": 100})
        self.assertEqual(await self.overall(), 75)
        answers = await self.client.get(self.url + "/answers?module=area&area_key=ventas")
        self.assertEqual(answers.json()["meta"]["total"], 16)

    async def test_no_active_areas_returns_zero(self):
        await self.save_answers()
        for key in self.questions:
            response = await self.client.delete(self.url + f"/areas/{key}")
            self.assertEqual(response.status_code, 204)
        self.assertEqual(await self.overall(), 0)

    async def test_no_questions_returns_zero_even_with_stale_cached_progress(self):
        async with self.sessions.begin() as db:
            db.add(AreaState(assessment_id=self.assessment_id, area_key="legal",
                             active=True, progress=100))
        self.assertEqual((await self.areas())["legal"]["progress"], 0)
        self.assertEqual(await self.overall(), 0)

    async def test_historical_answers_without_area_state_do_not_activate_area(self):
        async with self.sessions.begin() as db:
            state = (await db.execute(select(AreaState).where(
                AreaState.assessment_id == self.assessment_id,
                AreaState.area_key == "ventas",
            ))).scalar_one()
            await db.delete(state)
        # Existing historic answers may lack a state, but new API writes
        # now require explicit activation under the official APP-11 rule.
        response = await self.client.post(self.url + "/answers:batch", json={"answers":[
            {"question_id":str(self.questions["ventas"][0]),"value":4,"state":"answered"}]})
        self.assertEqual(response.status_code,403)
        async with self.sessions.begin() as db:
            db.add_all([Answer(assessment_id=self.assessment_id,question_id=qid,state="answered",value=4)
                        for qid in self.questions["ventas"]])
        area = (await self.areas())["ventas"]
        self.assertFalse(area["active"])
        self.assertEqual(area["progress"], 100)
        self.assertEqual(await self.overall(), 0)
        response = await self.client.post(self.url + "/areas/ventas:activate")
        self.assertEqual(response.json()["progress"], 100)
        self.assertEqual(await self.overall(), 50)

    async def test_free_plan_keeps_areas_locked_and_activation_gated(self):
        self.organization.plan = "free"
        self.assertTrue(all(area["locked"] for area in (await self.areas()).values()))
        response = await self.client.post(self.url + "/areas/ventas:activate")
        self.assertEqual(response.status_code, 402)
        response = await self.client.delete(self.url + "/areas/ventas")
        self.assertEqual(response.status_code, 402)


if __name__ == "__main__":
    unittest.main()
