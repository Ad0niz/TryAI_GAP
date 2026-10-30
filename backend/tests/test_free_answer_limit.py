"""Free-plan answer limits through real API routes and isolated SQLite databases.

Run from backend: .venv/Scripts/python -B -m unittest discover -s tests -v
"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.assessments import router
from app.api.routes.team import router as team_router
from app.core.config import settings
from app.core.errors import APIError, register_error_handlers
from app.models import AreaState, Answer, Assessment, Delegation, Organization, Question, User
from app.schemas.answer import BatchAnswerItem
from app.services.answer_service import batch_upsert, upsert_answer


class FreeAnswerLimitTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.limit_patch = patch.object(settings, "free_maturity_limit", 5)
        self.limit_patch.start()
        self.addCleanup(self.limit_patch.stop)
        # Separate connections allow concurrent requests to exercise SQLite locking.
        self.temp = tempfile.TemporaryDirectory(prefix="tryaigap-free-test-")
        self.addCleanup(self.temp.cleanup)
        path = (Path(self.temp.name) / "test.db").as_posix()
        self.engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        async with self.engine.begin() as connection:
            for model in (Organization, User, Assessment, Question, Answer, Delegation):
                await connection.run_sync(model.__table__.create)
        self.org_id, self.other_org_id = uuid4(), uuid4()
        self.assessment_id, self.same_org_id, self.other_assessment_id = uuid4(), uuid4(), uuid4()
        self.user_id = uuid4()
        self.organization = Organization(id=self.org_id, name="Free test", plan="free")
        self.current = CurrentUser(
            user=User(id=self.user_id, email="free@example.test", organization_id=self.org_id, role="client"),
            organization=self.organization,
        )
        self.question_ids = [uuid4() for _ in range(12)]
        self.area_id = uuid4()
        async with self.sessions.begin() as db:
            db.add_all([self.organization, Organization(id=self.other_org_id, name="Other test", plan="free")])
            await db.flush()
            db.add(self.current.user)
            db.add_all([
                Assessment(id=self.assessment_id, organization_id=self.org_id, plan="free"),
                Assessment(id=self.same_org_id, organization_id=self.org_id, plan="free"),
                Assessment(id=self.other_assessment_id, organization_id=self.other_org_id, plan="free"),
            ])
            db.add_all([Question(id=qid, module="maturity", block_id="M", code=f"M{i}", dimension="datos")
                        for i, qid in enumerate(self.question_ids)])
            db.add(Question(id=self.area_id, module="area", area_key="ventas", block_id="A", code="A1"))
        await make_admin(self.engine, self.sessions, self.user_id, self.org_id)
        async with self.sessions.begin() as db:
            db.add(AreaState(assessment_id=self.assessment_id,area_key='ventas',active=True))
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.include_router(team_router, prefix="/api/v1")
        register_error_handlers(app)

        async def test_db():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: self.current
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
        self.url = f"/api/v1/assessments/{self.assessment_id}"

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    def item(self, question_id, state="answered", value=4):
        return {"question_id": str(question_id), "state": state,
                "value": value if state == "answered" else None}

    async def batch(self, items, assessment_id=None):
        url = f"/api/v1/assessments/{assessment_id}" if assessment_id else self.url
        return await self.client.post(url + "/answers:batch", json={"answers": items})

    async def stored(self, assessment_id=None):
        async with self.sessions() as db:
            rows = (await db.execute(select(Answer).where(
                Answer.assessment_id == (assessment_id or self.assessment_id)
            ))).scalars().all()
            return {row.question_id: (row.state, row.value) for row in rows}

    def assert_paywall(self, response):
        self.assertEqual(response.status_code, 402, response.text)
        self.assertEqual(response.json()["error"]["code"], "PLAN_UPGRADE_REQUIRED")

    async def fill(self, count=5):
        response = await self.batch([self.item(qid) for qid in self.question_ids[:count]])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"saved": count, "failed": []})

    async def test_exact_limit_allowed_and_sixth_batch_rejected(self):
        await self.fill()
        self.assert_paywall(await self.batch([self.item(self.question_ids[5])]))
        self.assertEqual(len(await self.stored()), 5)

    async def test_oversized_batch_is_rejected_without_saving_any_answers(self):
        response = await self.batch([self.item(qid) for qid in self.question_ids[:6]])
        self.assert_paywall(response)
        self.assertEqual(await self.stored(), {})

    async def test_rejected_mixed_batch_does_not_update_or_insert_any_answers(self):
        await self.fill()
        response = await self.batch([
            self.item(self.question_ids[0], value=1), self.item(self.area_id),
            self.item(self.question_ids[5]),
        ])
        self.assert_paywall(response)
        stored = await self.stored()
        self.assertEqual(len(stored), 5)
        self.assertEqual(stored[self.question_ids[0]], ("answered", 4))
        self.assertNotIn(self.area_id, stored)

    async def test_service_preflight_is_atomic_even_when_caller_catches_error(self):
        await self.fill()
        async with self.sessions.begin() as db:
            assessment = await db.get(Assessment, self.assessment_id)
            with self.assertRaises(APIError) as raised:
                await batch_upsert(db, assessment, [
                    BatchAnswerItem(question_id=self.question_ids[0], state="answered", value=1),
                    BatchAnswerItem(question_id=self.question_ids[5], state="answered", value=4),
                ], self.current)
            self.assertEqual(raised.exception.code, "PLAN_UPGRADE_REQUIRED")
        self.assertEqual((await self.stored())[self.question_ids[0]], ("answered", 4))

    async def test_duplicate_new_questions_use_one_slot_and_last_valid_value(self):
        items = [self.item(self.question_ids[0], value=1), self.item(self.question_ids[0], value=5)]
        items += [self.item(qid) for qid in self.question_ids[1:5]]
        response = await self.batch(items)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"saved": 6, "failed": []})
        stored = await self.stored()
        self.assertEqual(len(stored), 5)
        self.assertEqual(stored[self.question_ids[0]], ("answered", 5))
        self.assert_paywall(await self.batch([self.item(self.question_ids[5])]))

    async def test_duplicates_cannot_hide_six_distinct_questions(self):
        items = [self.item(qid) for qid in self.question_ids[:6]]
        items.insert(1, self.item(self.question_ids[0]))
        self.assert_paywall(await self.batch(items))
        self.assertEqual(await self.stored(), {})

    async def test_updates_at_limit_and_repeated_updates_do_not_use_extra_slots(self):
        await self.fill()
        response = await self.batch([
            self.item(self.question_ids[0], state="idk"),
            self.item(self.question_ids[0], value=2),
            self.item(self.question_ids[1], state="delegated"),
        ])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"saved": 3, "failed": []})
        stored = await self.stored()
        self.assertEqual(len(stored), 5)
        self.assertEqual(stored[self.question_ids[0]], ("answered", 2))

    async def test_all_persisted_states_reserve_slots_including_pending(self):
        states = ["answered", "idk", "delegated", "pending", "pending"]
        response = await self.batch([self.item(qid, state) for qid, state in zip(self.question_ids, states)])
        self.assertEqual(response.status_code, 200, response.text)
        for state in ("answered", "idk", "delegated", "pending"):
            with self.subTest(state=state):
                self.assert_paywall(await self.batch([self.item(self.question_ids[5], state)]))
        # Updating a pending answer uses its existing slot; pending does not release one.
        self.assertEqual((await self.batch([self.item(self.question_ids[3])])).status_code, 200)
        self.assertEqual((await self.batch([self.item(self.question_ids[0], "pending")])).status_code, 200)
        self.assert_paywall(await self.batch([self.item(self.question_ids[5])]))

    async def test_invalid_items_keep_batch_failure_contract_and_do_not_consume_slots(self):
        missing = uuid4()
        response = await self.batch([
            self.item(self.question_ids[5], value=0), self.item(missing),
            *[self.item(qid) for qid in self.question_ids[:5]],
        ])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"saved": 5, "failed": [
            {"question_id": str(self.question_ids[5]), "reason": "ANSWER_VALUE_INVALID"},
            {"question_id": str(missing), "reason": "QUESTION_NOT_FOUND"},
        ]})
        self.assertEqual(len(await self.stored()), 5)

    async def test_area_answers_do_not_consume_maturity_slots(self):
        await self.fill()
        response = await self.batch([self.item(self.area_id)])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(await self.stored()), 6)

    async def test_pro_can_save_more_than_free_limit(self):
        self.organization.plan = "pro"
        await self.fill(12)
        self.assertEqual(len(await self.stored()), 12)

    async def test_same_organization_assessments_have_independent_allowances(self):
        await self.fill()
        response = await self.batch([self.item(qid) for qid in self.question_ids[:5]], self.same_org_id)
        self.assertEqual(response.status_code, 200, response.text)
        response = await self.batch([self.item(self.question_ids[5])], self.same_org_id)
        self.assert_paywall(response)
        self.assertEqual(len(await self.stored(self.same_org_id)), 5)
        self.assertEqual(len(await self.stored()), 5)

    async def test_other_organization_answers_do_not_consume_slots_and_cross_tenant_is_forbidden(self):
        async with self.sessions.begin() as db:
            db.add_all([Answer(assessment_id=self.other_assessment_id, question_id=qid, state="answered", value=5)
                        for qid in self.question_ids])
        await self.fill()
        response = await self.batch([self.item(self.question_ids[0], value=1)], self.other_assessment_id)
        self.assertEqual(response.status_code, 403)
        self.assertEqual((await self.stored(self.other_assessment_id))[self.question_ids[0]], ("answered", 5))

    async def test_single_and_batch_share_allowance_and_same_error(self):
        for qid in self.question_ids[:4]:
            response = await self.client.put(self.url + f"/answers/{qid}", json={"state": "answered", "value": 4})
            self.assertEqual(response.status_code, 200, response.text)
        await self.batch([self.item(self.question_ids[4])])
        single = await self.client.put(self.url + f"/answers/{self.question_ids[5]}", json={"state": "answered", "value": 4})
        batch = await self.batch([self.item(self.question_ids[5])])
        self.assert_paywall(single)
        self.assert_paywall(batch)
        self.assertEqual(single.json(), batch.json())
        # Exercise service updates without invoking the unrelated PUT updated_at defect.
        async with self.sessions.begin() as db:
            assessment = await db.get(Assessment, self.assessment_id)
            await upsert_answer(db, assessment, self.question_ids[0], 2, "answered", self.current)
        self.assertEqual(len(await self.stored()), 5)

    async def test_configured_limit_is_used_instead_of_hardcoded_five(self):
        with patch.object(settings, "free_maturity_limit", 2):
            await self.fill(2)
            self.assert_paywall(await self.batch([self.item(self.question_ids[2])]))

    async def test_empty_batch_at_limit_keeps_response_contract(self):
        await self.fill()
        response = await self.batch([])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"saved": 0, "failed": []})

    async def test_legacy_over_limit_data_can_be_updated_but_not_extended(self):
        self.organization.plan = "pro"
        await self.fill(6)
        self.organization.plan = "free"
        response = await self.batch([self.item(self.question_ids[0], value=1)])
        self.assertEqual(response.status_code, 200, response.text)
        self.assert_paywall(await self.batch([self.item(self.question_ids[6])]))
        self.assertEqual(len(await self.stored()), 6)

    async def test_concurrent_batches_cannot_both_claim_last_slot(self):
        await self.fill(4)
        responses = await asyncio.gather(*[
            self.batch([self.item(qid)]) for qid in self.question_ids[4:6]
        ])
        self.assertEqual(sorted(response.status_code for response in responses), [200, 402])
        self.assertEqual(len(await self.stored()), 5)

    async def test_concurrent_single_and_batch_cannot_both_claim_last_slot(self):
        await self.fill(4)
        responses = await asyncio.gather(
            self.client.put(self.url + f"/answers/{self.question_ids[4]}", json={"state": "answered", "value": 4}),
            self.batch([self.item(self.question_ids[5])]),
        )
        self.assertEqual(sorted(response.status_code for response in responses), [200, 402])
        self.assertEqual(len(await self.stored()), 5)

    async def delegate(self, question_id):
        return await self.client.post(self.url + f"/questions/{question_id}/delegate", json={
            "name": "Test delegate", "email": "delegate@example.test",
        })

    async def test_delegation_reserves_slot_and_sixth_question_is_rejected_before_email(self):
        await self.fill(4)
        with patch('app.services.team_service._safe_send', new_callable=AsyncMock) as send:
            response = await self.delegate(self.question_ids[4])
            self.assertEqual(response.status_code, 201, response.text)
            send.assert_awaited_once()
            send.reset_mock()
            self.assert_paywall(await self.delegate(self.question_ids[5]))
            send.assert_not_awaited()
        self.assertEqual(len(await self.stored()), 5)
        async with self.sessions() as db:
            delegations = (await db.execute(select(Delegation))).scalars().all()
            self.assertEqual(len(delegations), 1)
        self.assert_paywall(await self.batch([self.item(self.question_ids[5])]))

    async def test_existing_answer_can_be_delegated_at_limit_and_pro_is_unrestricted(self):
        await self.fill()
        with patch('app.services.team_service._safe_send', new_callable=AsyncMock):
            response = await self.delegate(self.question_ids[0])
            self.assertEqual(response.status_code, 201, response.text)
            self.organization.plan = 'pro'
            response = await self.delegate(self.question_ids[5])
            self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(await self.stored()), 6)

    async def test_concurrent_delegation_and_batch_cannot_both_claim_last_slot(self):
        await self.fill(4)
        with patch('app.services.team_service._safe_send', new_callable=AsyncMock):
            responses = await asyncio.gather(
                self.delegate(self.question_ids[4]),
                self.batch([self.item(self.question_ids[5])]),
            )
        self.assertEqual(sorted(response.status_code for response in responses), [200, 402]
                         if responses[0].status_code == 402 else [201, 402])
        self.assertEqual(len(await self.stored()), 5)


if __name__ == "__main__":
    unittest.main()
