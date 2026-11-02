"""Targeted English repair on isolated databases; no real database paths."""
import os
os.environ['DATABASE_URL']='sqlite+aiosqlite:///:memory:'
import json,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
from sqlalchemy import delete,event,select,func
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.db.base import Base
from app.models import Question,QuestionTranslation,Organization,User,Assessment,Answer
import app.seed as seed_module
import app.seed_area_questions as area_seed

REPO=Path(__file__).resolve().parents[2]
TARGETS=('marketing','operaciones')
class EnglishSeedTests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.engine=create_async_engine('sqlite+aiosqlite:///:memory:')
  if self.engine.dialect.name=='sqlite':
   @event.listens_for(self.engine.sync_engine,'connect')
   def foreign_keys(conn,_):
    cursor=conn.cursor();cursor.execute('PRAGMA foreign_keys=ON');cursor.close()
  self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
  async with self.engine.begin() as c:await c.run_sync(Base.metadata.create_all)
 async def asyncTearDown(self):await self.engine.dispose()
 async def seed(self):
  with patch.object(seed_module,'AsyncSessionLocal',self.sessions),patch.object(seed_module,'init_models',new_callable=AsyncMock):await seed_module.seed()
 async def snapshot(self):
  async with self.engine.connect() as c:return {t.name:(await c.execute(select(t).order_by(t.c.id))).all() for t in Base.metadata.sorted_tables}
 async def make_legacy(self):
  await self.seed()
  async with self.sessions.begin() as db:
   qs=(await db.scalars(select(Question).where(Question.area_key.in_(TARGETS)))).all()
   trs={(t.question_id,t.locale):t for t in (await db.scalars(select(QuestionTranslation))).all()}
   for q in qs:
    en,es=trs[q.id,'en'],trs[q.id,'es'];en.text=es.text;en.block_title=es.block_title
   org=Organization(name='Synthetic English repair',plan='pro');db.add(org);await db.flush()
   user=User(email='repair@synthetic.test',organization_id=org.id);db.add(user);await db.flush()
   a=Assessment(organization_id=org.id,plan='pro');db.add(a);await db.flush()
   db.add(Answer(assessment_id=a.id,question_id=qs[0].id,state='answered',value=4,updated_by=user.id))
 async def assert_english(self):
  source=json.loads((REPO/'web/src/i18n/locales/qbank.en.json').read_text(encoding='utf-8'))
  async with self.sessions() as db:
   self.assertEqual(await db.scalar(select(func.count()).select_from(Question)),132)
   self.assertEqual(await db.scalar(select(func.count()).select_from(QuestionTranslation)),528)
   qs=(await db.scalars(select(Question).where(Question.area_key.in_(TARGETS)))).all()
   trs={(t.question_id,t.locale):t for t in (await db.scalars(select(QuestionTranslation))).all()}
   self.assertEqual(len(qs),32)
   for q in qs:
    expected=next((b['title'],item['text']) for b in source['areas'][q.area_key] for item in b['questions'] if item['id']==q.code)
    self.assertEqual((trs[q.id,'en'].block_title,trs[q.id,'en'].text),expected)
    self.assertNotEqual(trs[q.id,'en'].text,trs[q.id,'es'].text)
 async def test_fresh_seed_has_real_english_for_all_32_questions(self):
  await self.seed();await self.assert_english()
 async def test_existing_fallback_repaired_in_place_without_operational_changes(self):
  await self.make_legacy();before=await self.snapshot();await self.seed();after=await self.snapshot()
  for t in before:
   if t!='question_translations':self.assertEqual(before[t],after[t],t)
  old={r.id:r for r in before['question_translations']};new={r.id:r for r in after['question_translations']}
  self.assertEqual(set(old),set(new))
  changed=[r for id,r in new.items() if r!=old[id]]
  self.assertEqual(len(changed),32);self.assertTrue(all(r.locale=='en' for r in changed))
  await self.assert_english()
 async def test_repeat_preserves_all_values_and_ids(self):
  await self.seed();before=await self.snapshot();await self.seed();self.assertEqual(await self.snapshot(),before)
 async def test_custom_english_and_custom_spanish_are_not_overwritten(self):
  await self.make_legacy()
  async with self.sessions.begin() as db:
   qs=(await db.scalars(select(Question).where(Question.area_key=='marketing').order_by(Question.code))).all()
   trs={(t.question_id,t.locale):t for t in (await db.scalars(select(QuestionTranslation))).all()}
   trs[qs[0].id,'en'].text='Approved custom English';trs[qs[0].id,'en'].block_title='Approved title'
   for lang in ('es','en'):
    trs[qs[1].id,lang].text='Texto personalizado';trs[qs[1].id,lang].block_title='Título propio'
  before=await self.snapshot();await self.seed();after=await self.snapshot()
  old={r.id:r for r in before['question_translations']};new={r.id:r for r in after['question_translations']}
  self.assertEqual(len([id for id in old if old[id]!=new[id]]),30)
  for id,row in old.items():
   if row.text in ('Approved custom English','Texto personalizado'):self.assertEqual(row,new[id])
 async def test_existing_valid_english_is_not_replaced(self):
  await self.seed();before=await self.snapshot()
  async with self.sessions.begin() as db:
   q=await db.scalar(select(Question).where(Question.area_key=='operaciones',Question.code=='A1'))
   en=await db.scalar(select(QuestionTranslation).where(QuestionTranslation.question_id==q.id,QuestionTranslation.locale=='en'))
   en.block_title='Existing approved English block title'
  before=await self.snapshot();await self.seed();self.assertEqual(await self.snapshot(),before)
 async def test_missing_english_translation_is_filled_without_recreating_question(self):
  await self.seed()
  async with self.sessions.begin() as db:
   q=await db.scalar(select(Question).where(Question.area_key=='marketing',Question.code=='A1'))
   await db.execute(delete(QuestionTranslation).where(QuestionTranslation.question_id==q.id,QuestionTranslation.locale=='en'))
  before=await self.snapshot();await self.seed();after=await self.snapshot()
  self.assertEqual(before['questions'],after['questions']);await self.assert_english()
 async def test_missing_source_kit_does_not_destroy_existing_translations(self):
  await self.make_legacy();before=await self.snapshot()
  original=area_seed.parse_kit
  def missing_english(path):return None if Path(path).parent.name=='English' else original(path)
  async with self.sessions.begin() as db:
   with patch.object(area_seed,'parse_kit',side_effect=missing_english):await area_seed.seed_area_questions(db)
  self.assertEqual(await self.snapshot(),before)
