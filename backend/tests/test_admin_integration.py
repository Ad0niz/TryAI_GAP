"""Official fields and real Alembic/CLI integration on synthetic temporary files."""
import asyncio
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from uuid import uuid4

from sqlalchemy import MetaData, String, create_engine

from app.core.question_vectors import AREA_QUESTION_CODES, AREA_VECTOR_TYPES
from app.db.base import Base
import app.models  # register metadata; never initialize the application DB

BACKEND = Path(__file__).parents[1]
REVISION = '20261027_app14_admin'
NEW_FIELDS = {'users': ('two_factor_enabled',),
              'questions': ('vector_type', 'weight_pain', 'weight_readiness')}


def contents(path, projection=None):
    with closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as db:
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='alembic_version'")]
        result = {}
        for table in tables:
            columns = projection[table][0] if projection else [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')]
            query = 'SELECT ' + ','.join('"' + c + '"' for c in columns) + f' FROM "{table}" ORDER BY id'
            result[table] = (columns, db.execute(query).fetchall())
        return result


class AdminIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='tryaigap-admin-test-')
        self.path = Path(self.temp.name) / 'isolated.db'

    def tearDown(self):
        self.temp.cleanup()

    def fixture(self, *, pre_app11=False, missing_question=False, incompatible=False, current=False):
        metadata = MetaData()
        for table in Base.metadata.sorted_tables:
            table.to_metadata(metadata)
        if not current:
            for table, columns in NEW_FIELDS.items():
                for name in columns:
                    metadata.tables[table]._columns.remove(metadata.tables[table].c[name])
            if pre_app11:
                for table, columns in {'users': ('password_hash',), 'invitations': ('expires_at', 'accepted_at')}.items():
                    for name in columns:
                        metadata.tables[table]._columns.remove(metadata.tables[table].c[name])
            if incompatible:
                from sqlalchemy import Column
                metadata.tables['questions'].append_column(Column('vector_type', String(10), nullable=True))
        engine = create_engine('sqlite:///' + self.path.as_posix())
        org, other_org, user, assessment = uuid4(), uuid4(), uuid4(), uuid4()
        self.org, self.user, self.assessment = org, user, assessment
        self.maturity_ids, self.area_ids = [], {}
        try:
            with engine.begin() as db:
                db.exec_driver_sql('PRAGMA foreign_keys=ON')
                metadata.create_all(db)
                db.execute(metadata.tables['organizations'].insert(), [{'id': org, 'name': 'Synthetic A', 'plan': 'pro'}, {'id': other_org, 'name': 'Synthetic B', 'plan': 'free'}])
                values = {'id': user, 'email': 'synthetic@example.test', 'organization_id': org}
                if not pre_app11:
                    values['password_hash'] = 'synthetic-fixture-only'
                db.execute(metadata.tables['users'].insert(), values)
                db.execute(metadata.tables['assessments'].insert(), {'id': assessment, 'organization_id': org, 'plan': 'pro'})
                for block, dimension in zip('ABCDE', ('datos', 'tech', 'talento', 'procesos', 'cultura')):
                    for number in range(1, 5):
                        qid = uuid4()
                        self.maturity_ids.append(qid)
                        db.execute(metadata.tables['questions'].insert(), {'id': qid, 'module': 'maturity', 'area_key': None, 'block_id': block, 'code': f'{block}{number}', 'dimension': dimension})
                for area in AREA_VECTOR_TYPES:
                    for position, code in enumerate(AREA_QUESTION_CODES):
                        if missing_question and area == 'legal' and code == 'D4':
                            continue
                        qid = uuid4()
                        self.area_ids[area, code] = qid
                        db.execute(metadata.tables['questions'].insert(), {'id': qid, 'module': 'area', 'area_key': area, 'block_id': code[0], 'code': code, 'position': position})
                for qid in self.maturity_ids + list(self.area_ids.values()):
                    for locale in ('es', 'en'):
                        db.execute(metadata.tables['question_translations'].insert(), {'question_id': qid, 'locale': locale, 'text': f'Synthetic preserved {locale}', 'block_title': 'Preserved title'})
                for qid, value in ((self.maturity_ids[0], 4), (self.area_ids['ventas', 'A1'], 5), (self.area_ids['ventas', 'B1'], 1)):
                    db.execute(metadata.tables['answers'].insert(), {'assessment_id': assessment, 'question_id': qid, 'value': value, 'state': 'answered'})
                db.execute(metadata.tables['invitations'].insert(), {'organization_id': org, 'full_name': 'Synthetic invite', 'email': 'invited@example.test', 'token_hash': 'synthetic-hash', 'status': 'sent'})
                if not pre_app11:
                    db.exec_driver_sql('CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)')
                    db.exec_driver_sql("INSERT INTO alembic_version VALUES ('20261022_app11')")
        finally:
            engine.dispose()
        return contents(self.path)

    def command(self, module, *args, success=True):
        env = os.environ.copy()
        env['DATABASE_URL'] = 'sqlite+aiosqlite:///' + self.path.as_posix()
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        result = subprocess.run([sys.executable, '-B', '-m', module, *args], cwd=BACKEND, env=env,
                                capture_output=True, text=True, timeout=60)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def migrate(self, success=True):
        return self.command('alembic', 'upgrade', REVISION, success=success)

    def classify(self, *, apply=False, success=True):
        args = ['--database', str(self.path)] + (['--apply'] if apply else [])
        return self.command('app.update_area_vectors', *args, success=success)

    def assert_integrity(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchall(), [('ok',)])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('SELECT version_num FROM alembic_version').fetchall(), [(REVISION,)])

    def test_existing_head_adds_official_fields_preserves_every_original_value_and_app11(self):
        before = self.fixture()
        self.migrate()
        self.assertEqual(contents(self.path, before), before)
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute('SELECT two_factor_enabled,password_hash FROM users').fetchall(), [(0, 'synthetic-fixture-only')])
            self.assertEqual(db.execute('SELECT DISTINCT vector_type,weight_pain,weight_readiness FROM questions').fetchall(), [(None, 1, 1)])
            self.assertIn('accepted_at', [row[1] for row in db.execute('PRAGMA table_info(invitations)')])
            for table, fields in NEW_FIELDS.items():
                columns = {row[1]: row for row in db.execute(f'PRAGMA table_info({table})')}
                for field in fields:
                    self.assertEqual(columns[field][3], 0 if field == 'vector_type' else 1)
        self.assert_integrity()

    def test_real_chain_from_legacy_database_keeps_existing_revision_unchanged(self):
        before = self.fixture(pre_app11=True)
        result = self.migrate()
        self.assertIn('20261022_app11', result.stderr)
        self.assertEqual(contents(self.path, before), before)
        self.assert_integrity()

    def test_dry_run_then_classification_preserves_ids_answers_translations_and_maturity(self):
        before = self.fixture()
        self.migrate()
        schema_before = contents(self.path)
        preview = json.loads(self.classify().stdout)
        self.assertEqual((preview['would_update'], preview['updated']), (112, 0))
        self.assertEqual(contents(self.path), schema_before)
        result = json.loads(self.classify(apply=True).stdout)
        self.assertEqual(result['updated'], 112)
        self.assertEqual(contents(self.path, before), before)
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute("SELECT count(*) FROM questions WHERE module='maturity' AND vector_type IS NULL").fetchone()[0], 20)
            self.assertEqual(dict(db.execute("SELECT vector_type,count(*) FROM questions WHERE module='area' GROUP BY vector_type")), {'efficiency': 32, 'revenue': 32, 'experience': 16, 'risk': 16, 'talent': 16})
        stable = contents(self.path)
        self.assertEqual(json.loads(self.classify(apply=True).stdout)['updated'], 0)
        self.migrate()
        self.assertEqual(contents(self.path), stable)
        self.assert_integrity()

    def test_missing_catalog_is_rejected_without_partial_updates(self):
        self.fixture(missing_question=True)
        self.migrate()
        before = contents(self.path)
        self.assertIn('Incomplete', self.classify(apply=True, success=False).stderr)
        self.assertEqual(contents(self.path), before)

    def test_conflicting_existing_classification_is_not_silently_overwritten(self):
        self.fixture()
        self.migrate()
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("UPDATE questions SET vector_type='risk' WHERE module='area' AND area_key='ventas' AND code='A1'")
        before = contents(self.path)
        self.assertIn('Conflicting', self.classify(apply=True, success=False).stderr)
        self.assertEqual(contents(self.path), before)

    def test_incompatible_partial_schema_stops_before_adding_any_column(self):
        before = self.fixture(incompatible=True)
        result = self.migrate(success=False)
        self.assertIn('Incompatible existing definition', result.stderr)
        self.assertEqual(contents(self.path), before)
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertNotIn('two_factor_enabled', [r[1] for r in db.execute('PRAGMA table_info(users)')])
            self.assertEqual(db.execute('SELECT version_num FROM alembic_version').fetchall(), [('20261022_app11',)])

    def test_current_model_created_schema_is_compatible_with_additive_migration(self):
        before = self.fixture(current=True)
        self.migrate()
        self.assertEqual(contents(self.path), before)
        self.assert_integrity()

    def test_fresh_area_seed_uses_same_official_mapping_and_keeps_ids_on_repeat(self):
        async def check():
            from unittest.mock import patch
            from sqlalchemy import select
            from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
            from app.models import Question, QuestionTranslation
            from app.seed_area_questions import seed_area_questions
            engine = create_async_engine('sqlite+aiosqlite:///:memory:')
            try:
                async with engine.begin() as db:
                    await db.run_sync(Question.__table__.create)
                    await db.run_sync(QuestionTranslation.__table__.create)
                kits = ({block: block for block in 'ABCD'}, [(code, f'Synthetic {code}') for code in AREA_QUESTION_CODES])
                sessions = async_sessionmaker(engine)
                with patch('app.seed_area_questions.parse_kit', return_value=kits):
                    async with sessions.begin() as db:
                        await seed_area_questions(db)
                        rows = (await db.execute(select(Question.id, Question.area_key, Question.vector_type).order_by(Question.id))).all()
                        self.assertEqual(len(rows), 112)
                        self.assertTrue(all(vector == AREA_VECTOR_TYPES[area] for _, area, vector in rows))
                        await seed_area_questions(db)
                        repeated = (await db.execute(select(Question.id, Question.area_key, Question.vector_type).order_by(Question.id))).all()
                        self.assertEqual(repeated, rows)
            finally:
                await engine.dispose()
        asyncio.run(check())

    def test_updater_protects_original_path_and_wrong_revision(self):
        self.fixture()
        self.assertIn('Expected isolated copy', self.classify(apply=True, success=False).stderr)
        result = self.command('app.update_area_vectors', '--database', str(BACKEND / 'dev.db'), '--apply', success=False)
        self.assertIn('protected', result.stderr)

    def test_results_after_migration_and_real_backfill_use_english_values_with_stable_contract(self):
        self.fixture()
        self.migrate()
        self.classify(apply=True)

        async def check():
            from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
            from app.api.deps import CurrentUser
            from app.models import User, Organization, AreaState
            from organization_fixture import make_admin
            from app.services.result_service import build_result
            engine = create_async_engine('sqlite+aiosqlite:///' + self.path.as_posix())
            try:
                sessions = async_sessionmaker(engine, expire_on_commit=False)
                await make_admin(engine,sessions,self.user,self.org)
                async with sessions.begin() as db:
                    db.add_all([AreaState(assessment_id=self.assessment,area_key=key,active=True)
                                for key in ('ventas','marketing','servicio','finanzas','rrhh','operaciones','legal')])
                async with sessions() as db:
                    user = await db.get(User, self.user)
                    org = await db.get(Organization, self.org)
                    result = await build_result(db, CurrentUser(user, org), self.assessment)
                    self.assertEqual(result['value_vectors']['status'], 'mapping_pending')
                    self.assertEqual((result['value_vectors']['mapped_questions'], result['value_vectors']['total_questions']), (112, 132))
                    vectors = {v['key']: v for v in result['value_vectors']['vectors']}
                    self.assertEqual(vectors['ingresos']['percentage'], 60)
                    self.assertIsNone(vectors['eficiencia']['percentage'])
                    self.assertEqual(result['value_vectors']['unmapped_numeric_answers'], 1)
                    self.assertEqual(result['maturity']['average'], 4)
                    self.assertEqual(result['heatmap']['areas'][0]['row'], [5, 1, None, None])
            finally:
                await engine.dispose()

        asyncio.run(check())


if __name__ == '__main__':
    unittest.main()
