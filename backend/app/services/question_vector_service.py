"""Strict in-place classification of the 112 official functional questions."""
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.question_vectors import AREA_QUESTION_CODES, AREA_VECTOR_TYPES
from app.models import Question


async def backfill_area_vectors(db: AsyncSession, *, apply: bool = False) -> dict:
    """Validate the complete catalog before any write; caller owns the transaction.

    Only absent vector_type values are filled. Contradictions, incomplete or
    duplicate keys fail closed. No question/translation/answer is inserted/deleted.
    """
    statement = select(Question.id, Question.area_key, Question.code,
                       Question.block_id, Question.vector_type).where(Question.module == "area")
    if apply:
        statement = statement.with_for_update()
    rows = (await db.execute(statement)).all()
    expected = {(area, code) for area in AREA_VECTOR_TYPES for code in AREA_QUESTION_CODES}
    by_key = {}
    for question_id, area, code, block, vector in rows:
        key = (area, code)
        if key in by_key:
            raise ValueError(f"Duplicate question key: {key}")
        if key not in expected or block != code[0]:
            raise ValueError(f"Unexpected functional question: {key}")
        if vector not in (None, AREA_VECTOR_TYPES[area]):
            raise ValueError(f"Conflicting vector_type for {key}: review before updating")
        by_key[key] = (question_id, vector)
    missing = expected - set(by_key)
    if missing:
        raise ValueError(f"Incomplete functional catalog: {len(missing)} of 112 keys missing")
    pending = {vector: [] for vector in set(AREA_VECTOR_TYPES.values())}
    for (area, _), (question_id, existing) in by_key.items():
        if existing is None:
            pending[AREA_VECTOR_TYPES[area]].append(question_id)
    would_update = sum(len(ids) for ids in pending.values())
    if apply:
        for vector, ids in pending.items():
            if not ids:
                continue
            result = await db.execute(update(Question).where(
                Question.id.in_(ids), Question.vector_type.is_(None),
            ).values(vector_type=vector).execution_options(synchronize_session=False))
            if result.rowcount != len(ids):
                raise RuntimeError("Catalog changed concurrently; roll back the complete transaction")
    return {"functional_questions": 112, "already_classified": 112 - would_update,
            "would_update": would_update, "updated": would_update if apply else 0,
            "mode": "apply" if apply else "dry_run"}
