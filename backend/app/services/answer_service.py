"""Assessment progress + answer upsert / batch / listing services."""
import uuid
from typing import List, Optional

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.errors import APIError
from app.models import Answer, Assessment, AreaState, Question
from app.services.organization_access import authorize_question, authorize_module, require_org_member

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


async def enforce_free_maturity_limit(db: AsyncSession, assessment: Assessment,
                                      question_ids: List[uuid.UUID], current: CurrentUser) -> None:
    """Reserve distinct maturity-question slots under the existing Free rule.

    Call with validated maturity question IDs before changing any answers.
    Every persisted state (including pending) reserves a slot, just as in PUT.
    The transaction lock serializes concurrent saves until commit/rollback.
    """
    org = current.organization
    if org is None or org.plan != "free" or not question_ids:
        return

    if db.get_bind().dialect.name == "sqlite":
        # SQLite has no FOR UPDATE. A no-op write obtains its transaction's
        # writer lock without changing assessment fields or its timestamp.
        await db.execute(
            update(Assessment).where(Assessment.id == assessment.id)
            .values(id=Assessment.id, updated_at=Assessment.updated_at)
        )
    else:
        await db.execute(
            select(Assessment.id).where(Assessment.id == assessment.id).with_for_update()
        )

    candidates = set(question_ids)
    existing = set((await db.execute(
        select(Answer.question_id).where(
            Answer.assessment_id == assessment.id, Answer.question_id.in_(candidates)
        )
    )).scalars().all())
    new_count = len(candidates - existing)
    count = await _existing_maturity_answers(db, assessment.id)
    # Existing answers remain editable, including legacy assessments already
    # above the limit. They must not gain additional slots.
    if new_count and count + new_count > settings.free_maturity_limit:
        raise APIError(
            402, "PLAN_UPGRADE_REQUIRED",
            "Completó la vista gratuita; adquiera el diagnóstico completo para continuar.",
        )


async def area_progress_by_key(db: AsyncSession, assessment_id: uuid.UUID) -> dict:
    """Compute progress from registered answers, scoped to one assessment and area."""
    stmt = (
        select(
            Question.area_key,
            func.count(func.distinct(Question.id)),
            func.count(func.distinct(Answer.question_id)),
        )
        .select_from(Question)
        .outerjoin(Answer, and_(
            Answer.question_id == Question.id,
            Answer.assessment_id == assessment_id,
            Answer.state.in_(ANSWERED_STATES),
        ))
        .where(Question.module == "area")
        .group_by(Question.area_key)
    )
    rows = (await db.execute(stmt)).all()
    return {key: round(100 * answered / total) if total else 0
            for key, total, answered in rows}


async def assessment_summary(db: AsyncSession, assessment: Assessment) -> dict:
    total_maturity = await _total_maturity_count(db)
    answered_maturity = await _answered_maturity_count(db, assessment.id)
    maturity_progress = round(100 * answered_maturity / total_maturity) if total_maturity else 0

    area_progress = await area_progress_by_key(db, assessment.id)
    active_keys = (await db.execute(
        select(AreaState.area_key).where(
            AreaState.assessment_id == assessment.id, AreaState.active.is_(True)
        )
    )).scalars().all()
    areas_overall = (
        round(sum(area_progress.get(key, 0) for key in active_keys) / len(active_keys))
        if active_keys else 0
    )

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

    await authorize_question(db, current, assessment, question)
    _validate_value(state, value)

    if enforce_free_gate and question.module == "maturity":
        await enforce_free_maturity_limit(db, assessment, [question_id], current)
    existing = await _get_existing(db, assessment.id, question_id)

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
    await db.refresh(answer, attribute_names=["updated_at"])
    return answer


async def batch_upsert(db: AsyncSession, assessment: Assessment, items: list,
                       current: CurrentUser) -> dict:
    await require_org_member(db, current)
    saved = 0
    failed: List[dict] = []
    prepared = []
    for item in items:
        candidate = await db.get(Question, item.question_id)
        if candidate is not None:
            await authorize_question(db, current, assessment, candidate)
        state = item.state or "answered"
        value = item.value
        if state == "answered" and (value is None or not (1 <= value <= 5)):
            failed.append({"question_id": item.question_id, "reason": "ANSWER_VALUE_INVALID"})
            continue
        question = await db.get(Question, item.question_id)
        if not question:
            failed.append({"question_id": item.question_id, "reason": "QUESTION_NOT_FOUND"})
            continue
        prepared.append((question, state, value))

    # Preflight the whole valid batch before applying even an existing-answer
    # update. An oversized Free batch fails atomically with the same error as PUT.
    await enforce_free_maturity_limit(
        db, assessment, [q.id for q, _, _ in prepared if q.module == "maturity"], current
    )
    existing_by_id = {}
    for question, state, value in prepared:
        if question.id not in existing_by_id:
            existing_by_id[question.id] = await _get_existing(db, assessment.id, question.id)
        existing = existing_by_id[question.id]
        if existing is not None:
            existing.value = value
            existing.state = state
            existing.updated_by = current.id
        else:
            answer = Answer(
                assessment_id=assessment.id,
                question_id=question.id,
                value=value,
                state=state,
                updated_by=current.id,
            )
            db.add(answer)
            # autoflush is disabled: reuse pending inserts for duplicate IDs.
            existing_by_id[question.id] = answer
        saved += 1
    await db.flush()
    return {"saved": saved, "failed": failed}


async def list_answers(db: AsyncSession, assessment: Assessment, module: Optional[str],
                       area_key: Optional[str], current: CurrentUser) -> dict:
    access = await require_org_member(db, current)
    if module == "maturity" or area_key:
        await authorize_module(db, current, module or 'area', area_key)
    stmt = (
        select(Answer.question_id, Question.code, Answer.value, Answer.state)
        .join(Question, Question.id == Answer.question_id)
        .where(Answer.assessment_id == assessment.id)
    )
    if not access.admin:
        stmt = stmt.where(Question.module == 'area', Question.area_key.in_(access.area_keys))
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
