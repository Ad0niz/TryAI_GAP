"""Assessment progress + answer upsert / batch / listing services."""
import uuid
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.errors import APIError
from app.models import Answer, Assessment, AreaState, Question

ANSWERED_STATES = ("answered", "idk", "delegated")


async def load_assessment(db: AsyncSession, assessment_id: uuid.UUID,
                          current: CurrentUser) -> Assessment:
    """Load an assessment and verify it belongs to the caller's organization."""
    assessment = await db.get(Assessment, assessment_id)
    if not assessment:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Evaluación no encontrada.")
    if assessment.organization_id != current.organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta evaluación.")
    return assessment


async def _answered_maturity_count(db: AsyncSession, assessment_id: uuid.UUID) -> int:
    stmt = (
        select(func.count(func.distinct(Answer.question_id)))
        .select_from(Answer)
        .join(Question, Question.id == Answer.question_id)
        .where(
            Answer.assessment_id == assessment_id,
            Question.module == "maturity",
            Answer.state.in_(ANSWERED_STATES),
        )
    )
    return int(await db.scalar(stmt) or 0)


async def _total_maturity_count(db: AsyncSession) -> int:
    stmt = select(func.count(Question.id)).where(Question.module == "maturity")
    return int(await db.scalar(stmt) or 0)


async def _existing_maturity_answers(db: AsyncSession, assessment_id: uuid.UUID) -> int:
    stmt = (
        select(func.count(func.distinct(Answer.question_id)))
        .select_from(Answer)
        .join(Question, Question.id == Answer.question_id)
        .where(Answer.assessment_id == assessment_id, Question.module == "maturity")
    )
    return int(await db.scalar(stmt) or 0)


async def assessment_summary(db: AsyncSession, assessment: Assessment) -> dict:
    total_maturity = await _total_maturity_count(db)
    answered_maturity = await _answered_maturity_count(db, assessment.id)
    maturity_progress = round(100 * answered_maturity / total_maturity) if total_maturity else 0

    avg = await db.scalar(
        select(func.avg(AreaState.progress)).where(
            AreaState.assessment_id == assessment.id, AreaState.active.is_(True)
        )
    )
    areas_overall = round(float(avg)) if avg is not None else 0

    free_preview_reached = (
        assessment.plan == "free" and answered_maturity >= settings.free_maturity_limit
    )
    return {
        "id": assessment.id,
        "organization_id": assessment.organization_id,
        "plan": assessment.plan,
        "status": assessment.status,
        "started_at": assessment.started_at,
        "completed_at": assessment.completed_at,
        "progress": {"maturity": maturity_progress, "areas_overall": areas_overall},
        "free_preview_reached": free_preview_reached,
    }


def _validate_value(state: str, value: Optional[int]) -> None:
    if state == "answered" and (value is None or not (1 <= value <= 5)):
        raise APIError(422, "ANSWER_VALUE_INVALID", "El puntaje debe estar entre 1 y 5.")


async def _get_existing(db: AsyncSession, assessment_id: uuid.UUID,
                        question_id: uuid.UUID) -> Optional[Answer]:
    stmt = select(Answer).where(
        Answer.assessment_id == assessment_id, Answer.question_id == question_id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def upsert_answer(db: AsyncSession, assessment: Assessment, question_id: uuid.UUID,
                        value: Optional[int], state: str, current: CurrentUser,
                        enforce_free_gate: bool = True) -> Answer:
    question = await db.get(Question, question_id)
    if not question:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Pregunta no encontrada.")

    _validate_value(state, value)

    existing = await _get_existing(db, assessment.id, question_id)

    org = current.organization
    if (enforce_free_gate and org is not None and org.plan == "free"
            and question.module == "maturity" and existing is None):
        count = await _existing_maturity_answers(db, assessment.id)
        if count >= settings.free_maturity_limit:
            raise APIError(
                402, "PLAN_UPGRADE_REQUIRED",
                "Completó la vista gratuita; adquiera el diagnóstico completo para continuar.",
            )

    if existing is not None:
        existing.value = value
        existing.state = state
        existing.updated_by = current.id
        answer = existing
    else:
        answer = Answer(
            assessment_id=assessment.id,
            question_id=question_id,
            value=value,
            state=state,
            updated_by=current.id,
        )
        db.add(answer)
    await db.flush()
    return answer


async def batch_upsert(db: AsyncSession, assessment: Assessment, items: list,
                       current: CurrentUser) -> dict:
    saved = 0
    failed: List[dict] = []
    for item in items:
        state = item.state or "answered"
        value = item.value
        if state == "answered" and (value is None or not (1 <= value <= 5)):
            failed.append({"question_id": item.question_id, "reason": "ANSWER_VALUE_INVALID"})
            continue
        question = await db.get(Question, item.question_id)
        if not question:
            failed.append({"question_id": item.question_id, "reason": "QUESTION_NOT_FOUND"})
            continue
        existing = await _get_existing(db, assessment.id, item.question_id)
        if existing is not None:
            existing.value = value
            existing.state = state
            existing.updated_by = current.id
        else:
            db.add(Answer(
                assessment_id=assessment.id,
                question_id=item.question_id,
                value=value,
                state=state,
                updated_by=current.id,
            ))
        saved += 1
    await db.flush()
    return {"saved": saved, "failed": failed}


async def list_answers(db: AsyncSession, assessment: Assessment, module: Optional[str],
                       area_key: Optional[str]) -> dict:
    stmt = (
        select(Answer.question_id, Question.code, Answer.value, Answer.state)
        .join(Question, Question.id == Answer.question_id)
        .where(Answer.assessment_id == assessment.id)
    )
    if module:
        stmt = stmt.where(Question.module == module)
    if area_key:
        stmt = stmt.where(Question.area_key == area_key)

    rows = (await db.execute(stmt)).all()
    items = [
        {"question_id": r[0], "code": r[1], "value": r[2], "state": r[3]}
        for r in rows
    ]
    return {"items": items, "meta": {"total": len(items)}}
