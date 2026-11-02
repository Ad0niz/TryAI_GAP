"""APP-17 list/detail/creation/rating isolation with real auth and in-memory SQLite."""
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone

os.environ['DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.api.deps import get_db
from app.api.routes.reviews import router
from app.core.errors import register_error_handlers
from app.core.security import create_access_token
from app.db.base import Base
from app.models import Organization, User, Assessment, Review, ReviewChapter, ConsultantRating


class ReviewAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.execute(text('PRAGMA foreign_keys=ON'))
            await conn.run_sync(Base.metadata.create_all)
        self.org, self.other, self.uid, self.other_uid, self.consultant, self.assessment, self.empty, self.foreign = [uuid.uuid4() for _ in range(8)]
        self.old = uuid.UUID(int=1)
        self.recent = uuid.UUID(int=2)
        self.tie = uuid.UUID(int=3)
        self.foreign_review = uuid.uuid4()
        self.now = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
        async with self.sessions.begin() as db:
            db.add_all([Organization(id=self.org, name='Own', plan='pro'), Organization(id=self.other, name='PRIVATE OTHER', plan='pro')])
            await db.flush()
            db.add_all([User(id=self.uid, email='own@example.test', organization_id=self.org, role='client'),
                        User(id=self.other_uid, email='foreign@example.test', organization_id=self.other, role='client'),
                        User(id=self.consultant, email='consultant@example.test', full_name='Synthetic consultant', role='consultant')])
            await db.flush()
            db.add_all([Assessment(id=self.assessment, organization_id=self.org), Assessment(id=self.empty, organization_id=self.org),
                        Assessment(id=self.foreign, organization_id=self.other)])
            await db.flush()
            db.add_all([Review(id=self.old, assessment_id=self.assessment, mode='async', stage=2, consultant_id=self.consultant,
                               created_at=self.now-timedelta(days=1), updated_at=self.now),
                        Review(id=self.recent, assessment_id=self.assessment, mode='sync', stage=2, created_at=self.now, updated_at=self.now),
                        Review(id=self.tie, assessment_id=self.assessment, mode='async', stage=1, created_at=self.now, updated_at=self.now),
                        Review(id=self.foreign_review, assessment_id=self.foreign, mode='async', stage=2)])
            await db.flush()
            db.add_all([ReviewChapter(review_id=self.old, chapter_key='data', validated=True, note='Own validated chapter', validated_at=self.now),
                        ReviewChapter(review_id=self.foreign_review, chapter_key='private', note='PRIVATE FOREIGN NOTE')])
        app=FastAPI()
        app.include_router(router, prefix='/api/v1')
        register_error_handlers(app)

        async def isolated_db():
            async with self.sessions.begin() as db:
                yield db

        app.dependency_overrides[get_db]=isolated_db
        self.client=AsyncClient(transport=ASGITransport(app=app), base_url='http://test', headers=self.headers(self.uid))

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()

    def headers(self, uid):
        return {'Authorization':'Bearer '+create_access_token(str(uid))}

    async def listing(self, aid=None, **kwargs):
        return await self.client.get('/api/v1/reviews', params={'assessment_id':str(aid or self.assessment)}, **kwargs)

    async def test_empty_assessment_returns_empty_list(self):
        result=await self.listing(self.empty)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json(),{'assessment_id':str(self.empty),'items':[]})

    async def test_multiple_reviews_are_scoped_and_ordered_by_date_then_id(self):
        result=await self.listing()
        self.assertEqual(result.status_code,200,result.text)
        items=result.json()['items']
        self.assertEqual([i['review_id'] for i in items],list(map(str,[self.tie,self.recent,self.old])))
        self.assertEqual([i['stage'] for i in items],[1,2,2])
        self.assertEqual(items[2]['consultant'],'Synthetic consultant')
        self.assertIsNone(items[0]['consultant'])
        self.assertTrue(items[0]['created_at'].endswith('Z'))
        self.assertEqual((await self.listing()).json(),result.json())
        self.assertNotIn(str(self.foreign_review),result.text)
        self.assertNotIn('PRIVATE FOREIGN NOTE',result.text)

    async def test_individual_review_keeps_existing_detail_contract(self):
        result=await self.client.get(f'/api/v1/reviews/{self.old}')
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['review_id'],str(self.old))
        self.assertEqual(result.json()['consultant'],'Synthetic consultant')
        self.assertEqual(result.json()['chapters'][0]['note'],'Own validated chapter')
        self.assertTrue(result.json()['chapters'][0]['validated'])

    async def test_cross_organization_list_detail_and_rating_are_forbidden(self):
        for response in [await self.listing(self.foreign),
                         await self.client.get(f'/api/v1/reviews/{self.foreign_review}'),
                         await self.client.post(f'/api/v1/reviews/{self.foreign_review}/ratings',json={
                             'chapter_key':'overall','knowledge':5,'friendliness':5,'methodology':5})]:
            self.assertEqual(response.status_code,403,response.text)
            self.assertEqual(response.json()['error']['code'],'FORBIDDEN')
            self.assertNotIn('PRIVATE',response.text)
        async with self.sessions() as db:
            self.assertEqual(await db.scalar(select(func.count()).select_from(ConsultantRating)),0)

    async def test_cross_organization_access_also_denied_in_reverse(self):
        response=await self.listing(headers=self.headers(self.other_uid))
        self.assertEqual(response.status_code,403)

    async def test_global_consultant_role_does_not_grant_cross_tenant_access(self):
        for result in [await self.listing(headers=self.headers(self.consultant)),
                       await self.client.get(f'/api/v1/reviews/{self.old}',headers=self.headers(self.consultant))]:
            self.assertEqual(result.status_code,403,result.text)

    async def test_unauthenticated_requests_cannot_list_read_create_or_rate(self):
        for method,path,body in [('GET',f'/reviews?assessment_id={self.assessment}',None),('GET',f'/reviews/{self.old}',None),
                                 ('POST','/reviews',{'assessment_id':str(self.empty),'mode':'async'}),
                                 ('POST',f'/reviews/{self.old}/ratings',{'chapter_key':'overall','knowledge':4,'friendliness':4,'methodology':4})]:
            result=await self.client.request(method,'/api/v1'+path,headers={'Authorization':''},**({'json':body} if body else {}))
            self.assertEqual(result.status_code,401,result.text)

    async def test_missing_assessment_and_review_return_404(self):
        self.assertEqual((await self.listing(uuid.uuid4())).status_code,404)
        self.assertEqual((await self.client.get(f'/api/v1/reviews/{uuid.uuid4()}')).status_code,404)

    async def test_list_requires_valid_assessment_identifier(self):
        for params in [{},{'assessment_id':'invalid'}]:
            result=await self.client.get('/api/v1/reviews',params=params)
            self.assertEqual(result.status_code,400,result.text)

    async def test_pro_creation_appears_in_list_without_assigning_consultant(self):
        result=await self.client.post('/api/v1/reviews',json={'assessment_id':str(self.empty),'mode':'sync'})
        self.assertEqual(result.status_code,201,result.text)
        listing=await self.listing(self.empty)
        self.assertEqual(len(listing.json()['items']),1)
        self.assertEqual(listing.json()['items'][0]['review_id'],result.json()['review_id'])
        self.assertIsNone(listing.json()['items'][0]['consultant'])
        duplicate=await self.client.post('/api/v1/reviews',json={'assessment_id':str(self.empty),'mode':'async'})
        self.assertEqual(duplicate.status_code,409)
        self.assertEqual(duplicate.json()['error']['code'],'REVIEW_ALREADY_REQUESTED')

    async def test_free_keeps_history_readable_but_cannot_create(self):
        async with self.sessions.begin() as db:
            (await db.get(Organization,self.org)).plan='free'
        self.assertEqual((await self.listing()).status_code,200)
        self.assertEqual((await self.client.get(f'/api/v1/reviews/{self.old}')).status_code,200)
        result=await self.client.post('/api/v1/reviews',json={'assessment_id':str(self.empty),'mode':'async'})
        self.assertEqual(result.status_code,402)

    async def test_rating_own_review_preserves_values_and_average(self):
        result=await self.client.post(f'/api/v1/reviews/{self.old}/ratings',json={
            'chapter_key':'overall','knowledge':3,'friendliness':4,'methodology':5})
        self.assertEqual(result.status_code,201,result.text)
        self.assertEqual(result.json()['average'],4)
        async with self.sessions() as db:
            row=await db.scalar(select(ConsultantRating))
            self.assertEqual(row.review_id,self.old)
            self.assertEqual((row.knowledge,row.friendliness,row.methodology),(3,4,5))

    async def test_invalid_modes_ratings_and_cross_tenant_creation_stay_rejected(self):
        mode=await self.client.post('/api/v1/reviews',json={'assessment_id':str(self.empty),'mode':'invented'})
        self.assertEqual(mode.status_code,422)
        cross=await self.client.post('/api/v1/reviews',json={'assessment_id':str(self.foreign),'mode':'async'})
        self.assertEqual(cross.status_code,403)
        rating=await self.client.post(f'/api/v1/reviews/{self.old}/ratings',json={'chapter_key':'overall','knowledge':0,'friendliness':4,'methodology':5})
        self.assertEqual(rating.status_code,422)
