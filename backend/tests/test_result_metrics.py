"""APP-14: pure formulas and real API/SQL reads, always isolated in memory."""
import os
import unittest
from fractions import Fraction
from uuid import uuid4

os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from organization_fixture import make_admin
from app.api.deps import CurrentUser, get_current_user, get_db
from app.api.routes.results import router
from app.core.errors import register_error_handlers
from app.models import AreaState, Answer, Assessment, Organization, Question, User
from app.services.result_metrics_service import (
    VECTOR_KEYS, pain_readiness_scores, quadrant, vector_scores,
)


class MetricsFormulaTests(unittest.TestCase):
    def test_all_five_vectors_use_simple_mean_divided_by_five(self):
        scores = vector_scores([(key, value) for key in VECTOR_KEYS for value in (1, 3, 5)])
        self.assertEqual([item['key'] for item in scores], list(VECTOR_KEYS))
        self.assertTrue(all(item['percentage'] == 60 and item['numeric_answers'] == 3 for item in scores))

    def test_vector_groups_are_independent_and_missing_is_none(self):
        scores = vector_scores([('eficiencia', 1), ('eficiencia', 4), ('ingresos', 5)])
        self.assertEqual([item['percentage'] for item in scores], [50, 100, None, None, None])

    def test_unknown_mapping_and_non_numeric_answers_are_not_inferred(self):
        scores = vector_scores([('A', 5), ('ventas', 5), (None, 4), ('unknown', 3),
                               ('riesgo', None), ('talento', 0), ('talento', 6)])
        self.assertTrue(all(item['percentage'] is None for item in scores))

    def test_category_name_normalization_does_not_map_questions(self):
        scores = vector_scores([(' EFICIENCIA ', 2), ('Eficiencia', 4)])
        self.assertEqual(scores[0]['percentage'], 60)

    def test_quadrants_and_both_exact_thresholds(self):
        for pain, readiness, expected in [(4, 4, 'high_high'), (4, 2, 'high_low'),
                (2, 4, 'low_high'), (2, 2, 'low_low'), (3, 4, 'boundary'),
                (4, 3, 'boundary'), (3, 3, 'boundary'), (2, 3, 'boundary')]:
            with self.subTest(pain=pain, readiness=readiness):
                self.assertEqual(quadrant(pain, readiness), expected)

    def test_classification_precedes_rounding(self):
        self.assertEqual(quadrant(Fraction(3001, 1000), Fraction(3001, 1000)), 'high_high')
        self.assertEqual(quadrant(Fraction(2999, 1000), 4), 'low_high')

    def test_readiness_pools_answers_not_block_averages_and_pain_is_not_reversed(self):
        catalog = [(i, 'ventas', block) for i, block in enumerate('A'+'B'*9+'C'*3+'D'*3)]
        result = pain_readiness_scores(catalog, list(enumerate([5]+[1]*9+[5]*6)))
        point = result['points'][0]
        self.assertEqual((point['pain'], point['readiness']), (5, 2.6))
        self.assertEqual(point['quadrant'], 'high_low')
        self.assertFalse(point['quick_win'])

    def test_incomplete_answers_and_missing_blocks_produce_coverage_not_points(self):
        catalog = [(i, 'ventas', block) for i, block in enumerate('ABCD')]
        for answers in ([], [(0, 4)], [(0, 4), (1, 5), (2, 3)]):
            result = pain_readiness_scores(catalog, answers)
            self.assertEqual(result['points'], [])
            self.assertEqual(result['pending_areas'][0]['numeric_answers'], len(answers))
        result = pain_readiness_scores(catalog[:3], [(0, 4), (1, 5), (2, 3)])
        self.assertEqual(result['points'], [])

    def test_empty_catalog_unknown_areas_and_blocks_never_create_coordinates(self):
        for catalog in ([], [(0, 'unknown', 'A')], [(0, 'ventas', 'Z')]):
            result = pain_readiness_scores(catalog, [(0, 5)])
            self.assertEqual(result['points'], [])
            self.assertEqual(result['pending_areas'], [])


class MetricsIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        # Use the real integrated ORM. Every record is synthetic and isolated.
        self.question_table = Question.__table__
        async with self.engine.begin() as db:
            for model in (Organization, User, Assessment):
                await db.run_sync(model.__table__.create)
            await db.run_sync(self.question_table.create)
            await db.run_sync(Answer.__table__.create)
        self.org = Organization(id=uuid4(), name='APP14 A', plan='pro')
        self.other_org = Organization(id=uuid4(), name='APP14 B', plan='pro')
        self.user = User(id=uuid4(), email='app14@example.test', role='client', locale='es', organization_id=self.org.id)
        self.assessment_id, self.second_id, self.foreign_id = uuid4(), uuid4(), uuid4()
        self.maturity_id = uuid4()
        self.area_ids = [uuid4() for _ in range(6)]
        async with self.sessions.begin() as db:
            db.add_all([self.org, self.other_org])
            await db.flush()
            db.add(self.user)
            db.add_all([Assessment(id=aid, organization_id=org, plan='pro') for aid, org in (
                (self.assessment_id, self.org.id), (self.second_id, self.org.id), (self.foreign_id, self.other_org.id))])
            await db.execute(self.question_table.insert(), [
                {'id': self.maturity_id, 'module': 'maturity', 'area_key': None, 'code': 'M1',
                 'block_id': 'A', 'dimension': 'datos', 'vector_type': 'efficiency'},
                *[{'id': qid, 'module': 'area', 'area_key': 'ventas', 'code': f'V{i}',
                   'block_id': block, 'dimension': None, 'vector_type': vector}
                  for i, (qid, block, vector) in enumerate(zip(self.area_ids, 'ABBBCD',
                     ('efficiency', 'revenue', 'revenue', 'experience', 'risk', 'talent')))]])
            db.add(Answer(assessment_id=self.assessment_id, question_id=self.maturity_id, state='answered', value=3))
        await make_admin(self.engine, self.sessions, self.user.id, self.org.id)
        async with self.sessions.begin() as db:
            db.add(AreaState(assessment_id=self.assessment_id,area_key='ventas',active=True))
        app = FastAPI()
        app.include_router(router, prefix='/api/v1')
        register_error_handlers(app)

        async def session():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db] = session
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(self.user, self.org)
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url='http://test')
        self.url = f'/api/v1/results/{self.assessment_id}'

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    async def answer_area(self, values, states=None, assessment=None):
        async with self.sessions.begin() as db:
            for i, value in enumerate(values):
                db.add(Answer(assessment_id=assessment or self.assessment_id, question_id=self.area_ids[i],
                              state=states[i] if states else 'answered', value=value))

    async def result(self):
        response = await self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_integrated_model_reads_real_classification_without_fake_area_scores(self):
        data = await self.result()
        self.assertEqual(data['value_vectors']['status'], 'ready')
        self.assertEqual([item['percentage'] for item in data['value_vectors']['vectors']], [60, None, None, None, None])
        self.assertEqual(data['pain_readiness']['points'], [])
        self.assertEqual(data['maturity']['average'], 3)

    async def test_maturity_without_official_mapping_stays_pending_and_is_not_inferred(self):
        async with self.sessions.begin() as db:
            await db.execute(update(Question).where(Question.id == self.maturity_id).values(vector_type=None))
        data = await self.result()
        self.assertEqual(data['value_vectors']['status'], 'mapping_pending')
        self.assertEqual(data['value_vectors']['mapped_questions'], 6)
        self.assertEqual(data['value_vectors']['unmapped_numeric_answers'], 1)
        self.assertTrue(all(item['percentage'] is None for item in data['value_vectors']['vectors']))

    async def test_official_weight_fields_do_not_change_vector_or_matrix_formulas(self):
        await self.answer_area([5, 1, 3, 2, 4, 5])
        before = await self.result()
        async with self.sessions.begin() as db:
            await db.execute(update(Question).where(Question.id == self.area_ids[0]).values(weight_pain=100, weight_readiness=50))
        self.assertEqual(await self.result(), before)

    async def test_six_question_catalog_is_not_a_complete_official_area(self):
        await self.answer_area([5, 1, 1, 1, 5, 5])
        data = await self.result()
        self.assertEqual(data['pain_readiness']['points'], [])
        self.assertEqual(data['heatmap']['areas'][0]['row'], [5, 1, 5, 5])
        self.assertEqual(data['priorities'], [])

    async def test_only_numeric_answered_states_count_and_incomplete_area_is_not_plotted(self):
        await self.answer_area([5, 5, 5, 5, None, 5], ['answered', 'idk', 'delegated', 'pending', 'answered', 'answered'])
        data = await self.result()
        self.assertEqual(data['pain_readiness']['points'], [])
        self.assertEqual(data['pain_readiness']['pending_areas'][0]['numeric_answers'], 2)
        self.assertEqual([v['numeric_answers'] for v in data['value_vectors']['vectors']], [2, 0, 0, 0, 1])

    async def test_official_english_mapping_keeps_api_keys_and_ignores_other_assessments(self):
        await self.answer_area([5, 1, 3, 2, 4, 5])
        await self.answer_area([1] * 6, assessment=self.second_id)
        await self.answer_area([1] * 6, assessment=self.foreign_id)
        data = await self.result()
        self.assertEqual(data['value_vectors']['status'], 'ready')
        self.assertEqual([v['percentage'] for v in data['value_vectors']['vectors']], [80, 40, 40, 80, 100])
        self.assertEqual(data['pain_readiness']['points'], [])

    async def test_unknown_and_null_vector_types_report_mapping_gap_without_guessing(self):
        await self.answer_area([5, 1, 3, 2, 4, 5])
        async with self.sessions.begin() as db:
            await db.execute(self.question_table.update().where(self.question_table.c.id == self.area_ids[0]).values(vector_type='A'))
            await db.execute(self.question_table.update().where(self.question_table.c.id == self.area_ids[1]).values(vector_type=None))
        data = await self.result()
        self.assertEqual(data['value_vectors']['status'], 'mapping_pending')
        self.assertEqual(data['value_vectors']['mapped_questions'], 5)
        self.assertEqual(data['value_vectors']['unmapped_numeric_answers'], 2)
        self.assertEqual(data['value_vectors']['vectors'][0]['percentage'], 60)

    async def test_free_cannot_request_new_metrics_and_preview_whitelist_is_unchanged(self):
        await self.answer_area([5] * 6)
        self.org.plan = 'free'
        for suffix in ('', '?include=value_vectors,pain_readiness&plan=pro'):
            response = await self.client.get(self.url + suffix)
            self.assertEqual(response.status_code, 402)
            self.assertEqual(response.json()['error']['code'], 'PLAN_UPGRADE_REQUIRED')
        response = await self.client.get(self.url + '/preview?include=value_vectors,pain_readiness')
        self.assertEqual(set(response.json()), {'provisional', 'details_locked', 'average', 'numeric_answers', 'total_questions'})

    async def test_foreign_organization_is_forbidden_and_other_assessment_answers_do_not_leak(self):
        await self.answer_area([5] * 6, assessment=self.foreign_id)
        await self.answer_area([5] * 6, assessment=self.second_id)
        self.assertEqual((await self.result())['pain_readiness']['points'], [])
        response = await self.client.get(f'/api/v1/results/{self.foreign_id}')
        self.assertEqual(response.status_code, 403)

    async def test_six_numeric_answers_cannot_publish_even_if_all_high(self):
        await self.answer_area([4] * 6)
        self.assertEqual((await self.result())['pain_readiness']['points'], [])


if __name__ == '__main__':
    unittest.main()
