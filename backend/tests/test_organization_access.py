"""APP-11 organizational scope and APP-14 lifecycle using synthetic SQLite data."""
import os
os.environ['DATABASE_URL']='sqlite+aiosqlite:///:memory:'
import unittest
from uuid import uuid4
from unittest.mock import AsyncMock, patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.api.deps import get_db
from app.api.routes.auth import router as auth
from app.api.routes.assessments import router as assessments
from app.api.routes.areas import router as areas
from app.api.routes.team import router as team
from app.api.routes.questionnaires import router as questionnaires
from app.api.routes.documents import router as documents
from app.api.routes.organizations import router as organizations
from app.api.routes.results import router as results
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.security import create_access_token
from app.db.base import Base
from app.models import (Answer, AreaState, Assessment, Document, Lead, OrgMember, Organization, Question, User)


class OrganizationAccessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine=create_async_engine('sqlite+aiosqlite:///:memory:')
        self.sessions=async_sessionmaker(self.engine,expire_on_commit=False,autoflush=False)
        async with self.engine.begin() as conn:await conn.run_sync(Base.metadata.create_all)
        self.org,self.other,self.aid,self.foreign,self.admin,self.leader,self.multi,self.inactive,self.global_admin,self.stranger,self.owner=[uuid4() for _ in range(11)]
        self.q={key:[uuid4() for _ in range(16)] for key in ['ventas','marketing','legal']}
        self.maturity=[uuid4() for _ in range(6)]
        async with self.sessions.begin() as db:
            db.add_all([Organization(id=self.org,name='Own org',plan='pro'),Organization(id=self.other,name='Other org',plan='pro')]);await db.flush()
            for uid in [self.admin,self.leader,self.multi,self.inactive,self.global_admin,self.stranger,self.owner]:
                db.add(User(id=uid,email=f'{uid}@synthetic.test',role='admin' if uid==self.global_admin else 'client',organization_id=self.org,status='active'))
            await db.flush()
            db.add_all([OrgMember(organization_id=self.org,user_id=self.admin,role='admin',status='active'),
                OrgMember(organization_id=self.org,user_id=self.leader,role='leader',area_key='ventas',status='active'),
                OrgMember(organization_id=self.org,user_id=self.multi,role='leader',area_key='ventas',status='active'),
                OrgMember(organization_id=self.org,user_id=self.multi,role='leader',area_key='marketing',status='active'),
                OrgMember(organization_id=self.org,user_id=self.inactive,role='leader',area_key='ventas',status='pending')])
            db.add_all([Assessment(id=self.aid,organization_id=self.org,plan='pro'),Assessment(id=self.foreign,organization_id=self.other,plan='pro')]);await db.flush()
            for area,ids in self.q.items():
                db.add(AreaState(assessment_id=self.aid,area_key=area,active=area!='legal'))
                for i,qid in enumerate(ids):db.add(Question(id=qid,module='area',area_key=area,block_id='ABCD'[i//4],code=f'{area[:1]}{i}',vector_type='efficiency'))
            for i,qid in enumerate(self.maturity):db.add(Question(id=qid,module='maturity',block_id='M',code=f'M{i}',dimension='datos'))
            await db.flush()
            db.add(Answer(assessment_id=self.aid,question_id=self.maturity[0],state='answered',value=3))
        self.app=FastAPI()
        for router in [auth,assessments,areas,team,questionnaires,documents,organizations,results]:self.app.include_router(router,prefix='/api/v1')
        register_error_handlers(self.app)
        async def isolated():
            async with self.sessions.begin() as db:yield db
        self.app.dependency_overrides[get_db]=isolated
        self.client=AsyncClient(transport=ASGITransport(app=self.app),base_url='http://test')
        self.mail=patch('app.services.team_service._safe_send',new_callable=AsyncMock);self.mail.start()
        self.storage=patch('app.services.document_service.upload_bytes',new_callable=AsyncMock,return_value='synthetic-object');self.upload=self.storage.start()

    async def asyncTearDown(self):
        self.mail.stop();self.storage.stop();await self.client.aclose();await self.engine.dispose()

    async def request(self,method,path,user=None,**kwargs):
        return await self.client.request(method,'/api/v1'+path,headers={'Authorization':'Bearer '+create_access_token(str(user or self.admin))},**kwargs)

    async def write(self,qid,user=None,aid=None):
        return await self.request('PUT',f'/assessments/{aid or self.aid}/answers/{qid}',user,json={'state':'answered','value':4})

    async def test_client_with_active_admin_membership_manages_all_scopes(self):
        self.assertEqual((await self.request('GET','/auth/permissions')).json(),{'organization_admin':True,'area_keys':[]})
        self.assertEqual((await self.write(self.maturity[0])).status_code,200)
        self.assertEqual((await self.write(self.q['marketing'][0])).status_code,200)
        self.assertEqual((await self.request('PATCH',f'/organizations/{self.org}',json={'name':'Updated'})).status_code,200)
        self.assertEqual((await self.request('POST',f'/assessments/{self.aid}/areas/legal:activate')).status_code,200)
        self.assertEqual((await self.write(self.q['legal'][0])).status_code,200)
        self.assertEqual((await self.request('POST','/invitations',json={'full_name':'New','email':'new@synthetic.test','area_key':'ventas'})).status_code,201)

    async def test_global_admin_and_unassigned_org_user_do_not_gain_org_admin(self):
        for uid in [self.global_admin,self.stranger,self.inactive]:
            self.assertFalse((await self.request('GET','/auth/permissions',uid)).json()['organization_admin'])
            self.assertEqual((await self.request('PATCH',f'/organizations/{self.org}',uid,json={'name':'Denied'})).status_code,403)
            self.assertEqual((await self.write(self.q['ventas'][0],uid)).status_code,403)

    async def test_leader_only_answers_enabled_assigned_area(self):
        self.assertEqual((await self.write(self.q['ventas'][0],self.leader)).status_code,200)
        self.assertEqual((await self.write(self.q['marketing'][0],self.leader)).status_code,403)
        self.assertEqual((await self.write(self.maturity[0],self.leader)).status_code,403)
        self.assertEqual((await self.request('GET','/questionnaires?module=maturity',self.leader)).status_code,403)
        self.assertEqual((await self.request('GET','/questionnaires?module=area&area_key=marketing',self.leader)).status_code,403)

    async def test_multiple_active_areas_and_inactive_memberships(self):
        for key in ['ventas','marketing']:self.assertEqual((await self.write(self.q[key][0],self.multi)).status_code,200)
        async with self.sessions.begin() as db:
            member=await db.scalar(select(OrgMember).where(OrgMember.user_id==self.multi,OrgMember.area_key=='marketing'));member.status='inactive'
        self.assertEqual((await self.write(self.q['marketing'][1],self.multi)).status_code,403)
        self.assertEqual((await self.write(self.q['ventas'][1],self.multi)).status_code,200)

    async def test_foreign_membership_does_not_grant_local_scope(self):
        async with self.sessions.begin() as db:db.add(OrgMember(user_id=self.stranger,organization_id=self.other,role='admin',status='active'))
        self.assertEqual((await self.write(self.q['ventas'][0],self.stranger)).status_code,403)
        self.assertEqual((await self.write(self.q['ventas'][0],self.admin,self.foreign)).status_code,403)

    async def test_forbidden_batch_is_atomic_even_with_invalid_value_or_duplicate(self):
        before=None
        async with self.sessions() as db:before=await db.scalar(select(func.count()).select_from(Answer))
        for state,value in [('answered',4),('answered',99),('pending',None)]:
            r=await self.request('POST',f'/assessments/{self.aid}/answers:batch',self.leader,json={'answers':[
                {'question_id':str(self.q['ventas'][0]),'state':'answered','value':5},
                {'question_id':str(self.q['marketing'][0]),'state':state,'value':value}]})
            self.assertIn(r.status_code,[400,403])
        async with self.sessions() as db:self.assertEqual(await db.scalar(select(func.count()).select_from(Answer)),before)

    async def test_valid_batch_spans_assigned_areas_and_preserves_duplicate_contract(self):
        ids=[self.q['ventas'][0],self.q['marketing'][0],self.q['ventas'][0]]
        r=await self.request('POST',f'/assessments/{self.aid}/answers:batch',self.multi,json={'answers':[{'question_id':str(q),'value':4,'state':'answered'} for q in ids]})
        self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['saved'],3)

    async def test_leader_cannot_manage_global_team_config_or_activation(self):
        for method,path,body in [('POST','/invitations',{'full_name':'No','email':'no@synthetic.test','area_key':'ventas'}),
            ('GET','/team',None),('PATCH',f'/organizations/{self.org}',{'name':'No'}),
            ('POST',f'/assessments/{self.aid}/areas/ventas:activate',None),('DELETE',f'/assessments/{self.aid}/areas/marketing',None)]:
            r=await self.request(method,path,self.leader,**({'json':body} if body else {}));self.assertEqual(r.status_code,403,r.text)

    async def test_leader_delegates_only_own_questions(self):
        for key,status in [('ventas',201),('marketing',403)]:
            r=await self.request('POST',f'/assessments/{self.aid}/questions/{self.q[key][0]}/delegate',self.leader,json={'name':'Delegate','email':'delegate@synthetic.test'})
            self.assertEqual(r.status_code,status,r.text)

    async def test_leader_reads_only_assigned_answers_and_areas(self):
        await self.write(self.q['ventas'][0]);await self.write(self.q['marketing'][0])
        r=await self.request('GET',f'/assessments/{self.aid}/answers',self.leader)
        self.assertEqual(r.status_code,200);self.assertEqual([x['question_id'] for x in r.json()['items']],[str(self.q['ventas'][0])])
        self.assertEqual((await self.request('GET',f'/assessments/{self.aid}/answers?module=area&area_key=marketing',self.leader)).status_code,403)
        r=await self.request('GET',f'/assessments/{self.aid}/areas',self.leader)
        self.assertEqual([x['area_key'] for x in r.json()['items']],['ventas'])

    async def test_global_results_are_restricted_and_free_paywall_remains(self):
        self.assertEqual((await self.request('GET',f'/results/{self.aid}',self.leader)).status_code,403)
        self.assertEqual((await self.request('GET',f'/results/{self.aid}/preview',self.leader)).status_code,403)
        self.assertEqual((await self.request('POST',f'/results/{self.aid}/report',self.leader)).status_code,403)
        async with self.sessions.begin() as db:(await db.get(Organization,self.org)).plan='free'
        self.assertEqual((await self.request('GET',f'/results/{self.aid}')).status_code,402)
        self.assertEqual((await self.request('GET',f'/results/{self.aid}/preview')).status_code,200)

    async def test_documents_validate_question_scope_before_upload_and_filter_reads(self):
        async def upload(area,question=None,user=None):
            data={'assessment_id':str(self.aid),'area_key':area}
            if question:data['question_id']=str(question)
            return await self.request('POST','/documents',user or self.leader,data=data,files={'file':('evidence.pdf',b'Synthetic PDF','application/pdf')})
        own=await upload('ventas',self.q['ventas'][0]);self.assertEqual(own.status_code,201,own.text)
        self.assertEqual((await upload('marketing')).status_code,403)
        self.assertEqual((await upload('ventas',self.q['marketing'][0])).status_code,422)
        self.assertEqual(self.upload.await_count,1)
        other=await upload('marketing',user=self.admin);self.assertEqual(other.status_code,201)
        listed=await self.request('GET','/documents',self.leader)
        self.assertEqual(listed.json()['meta']['total'],1)
        self.assertEqual((await self.request('DELETE',f"/documents/{own.json()['id']}",self.leader)).status_code,403)
        with patch.object(settings,'azure_storage_connection_string','synthetic'),patch('app.api.routes.documents.signed_url',return_value='https://synthetic.test/file'):
            self.assertEqual((await self.request('GET',f"/documents/{own.json()['id']}/download",self.leader)).status_code,307)
            self.assertEqual((await self.request('GET',f"/documents/{other.json()['id']}/download",self.leader)).status_code,403)

    async def test_legacy_owner_requires_unique_lead_and_no_membership_override(self):
        async with self.sessions.begin() as db:db.add(Lead(user_id=self.owner,full_name='Owner',company_email='owner@synthetic.test',company_name='Own org'))
        self.assertTrue((await self.request('GET','/auth/permissions',self.owner)).json()['organization_admin'])
        # An existing leader membership is not proof of administrative ownership.
        async with self.sessions.begin() as db:db.add(OrgMember(organization_id=self.org,user_id=self.owner,role='leader',area_key='ventas',status='active'))
        self.assertFalse((await self.request('GET','/auth/permissions',self.owner)).json()['organization_admin'])
        async with self.sessions.begin() as db:db.add(OrgMember(organization_id=self.org,user_id=self.owner,role='admin',status='inactive'))
        self.assertFalse((await self.request('GET','/auth/permissions',self.owner)).json()['organization_admin'])

    async def test_a_former_signup_owner_invited_as_leader_is_never_promoted(self):
        async with self.sessions.begin() as db:
            db.add(Lead(user_id=self.leader,full_name='Former owner',company_email='former@synthetic.test',company_name='Previous organization'))
        self.assertFalse((await self.request('GET','/auth/permissions',self.leader)).json()['organization_admin'])
        self.assertEqual((await self.request('PATCH',f'/organizations/{self.org}',self.leader,json={'name':'Denied'})).status_code,403)

    async def test_ambiguous_legacy_ownership_never_promotes_arbitrary_user(self):
        async with self.sessions.begin() as db:
            for uid in [self.owner,self.stranger]:db.add(Lead(user_id=uid,full_name='Ambiguous',company_email='ambiguous@synthetic.test',company_name='Own org'))
        self.assertFalse((await self.request('GET','/auth/permissions',self.owner)).json()['organization_admin'])

    async def test_inactive_area_blocks_writes_but_preserves_historical_records(self):
        await self.write(self.q['ventas'][0],self.leader)
        self.assertEqual((await self.request('DELETE',f'/assessments/{self.aid}/areas/ventas')).status_code,204)
        self.assertEqual((await self.write(self.q['ventas'][1],self.leader)).status_code,403)
        r=await self.request('GET',f'/assessments/{self.aid}/answers?module=area&area_key=ventas',self.leader)
        self.assertEqual(len(r.json()['items']),1)

    async def test_matrix_and_vectors_exclude_inactive_area_then_restore_unchanged_answers(self):
        for i,qid in enumerate(self.q['ventas']):
            if i==15:break
            self.assertEqual((await self.write(qid)).status_code,200)
        r=await self.request('GET',f'/results/{self.aid}')
        self.assertEqual(r.json()['pain_readiness']['points'],[])
        await self.write(self.q['ventas'][15])
        before=(await self.request('GET',f'/results/{self.aid}')).json()
        self.assertEqual(len(before['pain_readiness']['points']),1)
        self.assertEqual(before['value_vectors']['vectors'][0]['percentage'],80)
        async with self.sessions() as db:
            original={a.id:(a.question_id,a.value,a.state) for a in (await db.execute(select(Answer))).scalars()}
        await self.request('DELETE',f'/assessments/{self.aid}/areas/ventas')
        inactive=(await self.request('GET',f'/results/{self.aid}')).json()
        self.assertEqual(inactive['pain_readiness']['points'],[])
        self.assertEqual(inactive['pain_readiness']['pending_areas'][0]['area_key'],'marketing')
        self.assertIsNone(inactive['value_vectors']['vectors'][0]['percentage'])
        await self.request('POST',f'/assessments/{self.aid}/areas/ventas:activate')
        restored=(await self.request('GET',f'/results/{self.aid}')).json()
        self.assertEqual(restored['value_vectors'],before['value_vectors']);self.assertEqual(restored['pain_readiness'],before['pain_readiness'])
        async with self.sessions() as db:self.assertEqual({a.id:(a.question_id,a.value,a.state) for a in (await db.execute(select(Answer))).scalars()},original)

    async def test_authentication_is_required(self):
        self.assertEqual((await self.client.get('/api/v1/auth/permissions')).status_code,401)
        self.assertEqual((await self.client.post(f'/api/v1/assessments/{self.aid}/answers:batch',json={'answers':[]})).status_code,401)
