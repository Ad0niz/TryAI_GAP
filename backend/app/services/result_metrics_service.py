"""APP-14 metrics; no persistence, inferred question mapping or weighted scores."""
import unicodedata
from collections import defaultdict
from fractions import Fraction
from typing import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Answer, Question
from app.services.questionnaire_service import AREA_KEYS

VECTOR_KEYS = ("eficiencia", "ingresos", "experiencia", "riesgo", "talento")
BLOCKS = ("A", "B", "C", "D")


def vector_key(value):
    """Recognize explicit category names only, never infer a question's category.

    These API identifiers use Administration's Spanish category names. The exact
    stored vocabulary must be confirmed when their model/mapping is delivered.
    Unknown values remain unmapped rather than being guessed from question text.
    """
    if not isinstance(value, str):
        return None
    normalized = "".join(c for c in unicodedata.normalize("NFKD", value.strip().lower())
                         if not unicodedata.combining(c))
    return normalized if normalized in VECTOR_KEYS else None


def vector_scores(rows: Iterable[tuple]) -> list[dict]:
    """Rows are (explicit vector_type, numeric answered value); missing != zero."""
    values = {key: [] for key in VECTOR_KEYS}
    for category, value in rows:
        key = vector_key(category)
        if key and value is not None and 1 <= value <= 5:
            values[key].append(value)
    return [
        {"key": key, "percentage": float(Fraction(sum(items), len(items)) * 20) if items else None,
         "numeric_answers": len(items)}
        for key, items in values.items()
    ]


async def compute_value_vectors(db: AsyncSession, assessment_id: UUID) -> dict:
    # The shared model is deliberately not changed here. Administration owns its
    # migration and the 132-question classification. Current deployments return
    # an explicit dependency, without querying a nonexistent column.
    category = getattr(Question, "vector_type", None)
    if category is None:
        return {"status": "schema_pending", "vectors": vector_scores([]),
                "mapped_questions": 0, "total_questions": None,
                "unmapped_numeric_answers": 0}

    catalog = (await db.execute(select(category).select_from(Question).where(
        Question.module.in_(("maturity", "area"))
    ))).all()
    rows = (await db.execute(select(category, Answer.value)
        .select_from(Answer).join(Question, Question.id == Answer.question_id)
        .where(Answer.assessment_id == assessment_id, Answer.state == "answered",
               Answer.value.isnot(None), Question.module.in_(("maturity", "area"))))).all()
    mapped = sum(vector_key(item[0]) is not None for item in catalog)
    return {"status": "ready" if catalog and mapped == len(catalog) else "mapping_pending",
            "vectors": vector_scores(rows), "mapped_questions": mapped,
            "total_questions": len(catalog),
            "unmapped_numeric_answers": sum(vector_key(category) is None for category, _ in rows)}


def quadrant(pain, readiness):
    """Classify before display rounding, with equality reserved for the boundary."""
    if pain == 3 or readiness == 3:
        return "boundary"
    return ("high" if pain > 3 else "low") + "_" + ("high" if readiness > 3 else "low")


def pain_readiness_scores(catalog: Iterable[tuple], answers: Iterable[tuple]) -> dict:
    """Catalog: (question_id, area_key, block); answers: (question_id, value).

    Conservative publication guard pending Administration's acceptance: all
    catalog questions in each of A-D must have numeric answers. Partial answers
    are reported as coverage, never as fabricated coordinates or zero scores.
    Means use answers directly: B/C/D are pooled, not equally weighted blocks.
    """
    groups = defaultdict(lambda: {block: [] for block in BLOCKS})
    for question_id, area, block in catalog:
        if area in AREA_KEYS and block in BLOCKS:
            groups[area][block].append(question_id)
    numeric = {qid: value for qid, value in answers if value is not None and 1 <= value <= 5}
    points, pending = [], []
    for area in AREA_KEYS:
        if area not in groups:
            continue
        blocks = groups[area]
        total = sum(len(ids) for ids in blocks.values())
        count = sum(qid in numeric for ids in blocks.values() for qid in ids)
        coverage = {"area_key": area, "numeric_answers": count, "total_questions": total}
        if count != total or any(not blocks[block] for block in BLOCKS):
            pending.append(coverage)
            continue
        a = [numeric[qid] for qid in blocks["A"]]
        bcd = [numeric[qid] for block in ("B", "C", "D") for qid in blocks[block]]
        pain, readiness = Fraction(sum(a), len(a)), Fraction(sum(bcd), len(bcd))
        category = quadrant(pain, readiness)
        points.append({**coverage, "pain": float(pain), "readiness": float(readiness),
                       "quadrant": category, "quick_win": category == "high_high"})
    return {"threshold": 3.0, "coverage_rule": "complete_numeric_blocks",
            "points": points, "pending_areas": pending}


async def compute_pain_readiness(db: AsyncSession, assessment_id: UUID) -> dict:
    catalog = (await db.execute(select(Question.id, Question.area_key, Question.block_id)
        .where(Question.module == "area"))).all()
    rows = (await db.execute(select(Answer.question_id, Answer.value)
        .join(Question, Question.id == Answer.question_id)
        .where(Answer.assessment_id == assessment_id, Question.module == "area",
               Answer.state == "answered", Answer.value.isnot(None)))).all()
    return pain_readiness_scores(catalog, rows)
