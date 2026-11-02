"""Prepare APP-14 on an explicit existing local SQLite COPY; dry-run by default.

Usage: python -B -m app.update_area_vectors --database /absolute/copy.db [--apply]
This first integration stage refuses backend/dev.db and all remote URLs.
"""
import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.services.question_vector_service import backfill_area_vectors

REVISION = "20261027_app14_admin"


async def run(database: Path, *, apply: bool = False) -> dict:
    database = database.resolve(strict=True)
    original = Path(__file__).resolve().parents[1] / "dev.db"
    if database == original or (original.exists() and database.samefile(original)):
        raise ValueError("backend/dev.db is protected in this preparation stage. Use an independent copy.")
    if not database.is_file():
        raise ValueError("An existing SQLite database file is required")
    # mode=rw never creates a missing database; no app settings or .env are used.
    engine = create_async_engine(f"sqlite+aiosqlite:///file:{database.as_posix()}?mode=rw&uri=true")
    try:
        sessions = async_sessionmaker(engine)
        async with sessions.begin() as db:
            versions = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalars().all()
            if versions != [REVISION]:
                raise ValueError(f"Expected isolated copy at revision {REVISION}")
            result = await backfill_area_vectors(db, apply=apply)
        return result
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Apply only after a successful dry-run on the copy")
    args = parser.parse_args()
    try:
        result = asyncio.run(run(args.database, apply=args.apply))
    except (ValueError, RuntimeError) as error:
        parser.exit(1, f"STOP: {error}\n")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
