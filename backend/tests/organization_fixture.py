"""Explicit org-admin test fixture; uses only the test's isolated engine."""
from app.db.base import Base
from app.models import User, OrgMember

async def make_admin(engine, sessions, uid, org_id):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with sessions.begin() as db:
        if await db.get(User, uid) is None:
            db.add(User(id=uid,email=f'{uid}@synthetic.test',organization_id=org_id,status='active',role='client'))
            await db.flush()
        db.add(OrgMember(user_id=uid,organization_id=org_id,role='admin',status='active'))
