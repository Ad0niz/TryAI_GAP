"""Consultant workspace service: KPIs, client portfolio, client detail, notes."""
import uuid
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.core.pagination import offset, page_meta
from app.models import Answer, Assessment, ConsultantNote, Organization, Question
from app.services import result_service


async def _latest_assessment(
    db: AsyncSession, organization_id: uuid.UUID
) -> Optional[Assessment]:
    stmt = (
        select(Assessment)
        .where(Assessment.organization_id == organization_id)
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _assessment_progress(db: AsyncSession, assessment_id: uuid.UUID) -> int:
    answered = (
        await db.execute(
            select(func.count())
            .select_from(Answer)
            .where(Answer.assessment_id == assessment_id, Answer.state == "answered")
        )
    ).scalar_one()
    total_q = (
        await db.execute(select(func.count()).select_from(Question))
    ).scalar_one()
    if not total_q:
        return 0
    return min(100, round(100 * answered / total_q))


async def _assessment_maturity(
    db: AsyncSession, assessment_id: uuid.UUID
) -> Optional[float]:
    scores, numeric_count = await result_service.compute_dimension_scores(
        db, assessment_id
    )
    if numeric_count == 0:
        return None
    present = [scores[k] for k in result_service.DIMENSIONS if scores[k] > 0]
    if not present:
        return None
    return round(sum(present) / len(present), 1)


# ------------------------------------------------------------------------ KPIs
async def kpis(db: AsyncSession) -> dict:
    leads = (
        await db.execute(
            select(func.count()).select_from(Organization).where(Organization.plan == "free")
        )
    ).scalar_one()
    active = (
        await db.execute(
            select(func.count()).select_from(Assessment).where(Assessment.status == "in_progress")
        )
    ).scalar_one()

    avg_val = (
        await db.execute(
            select(func.avg(Answer.value))
            .join(Question, Question.id == Answer.question_id)
            .where(
                Question.module == "maturity",
                Answer.state == "answered",
                Answer.value.isnot(None),
            )
        )
    ).scalar_one()
    avg_maturity = round(float(avg_val), 1) if avg_val is not None else 0.0

    total = (
        await db.execute(select(func.count()).select_from(Organization))
    ).scalar_one()
    pro = (
        await db.execute(
            select(func.count()).select_from(Organization).where(Organization.plan == "pro")
        )
    ).scalar_one()
    conversion = round(100 * pro / total) if total else 0

    return {
        "leads": leads,
        "active_engagements": active,
        "avg_maturity": avg_maturity,
        "free_to_paid_conversion_pct": conversion,
    }


# --------------------------------------------------------------------- clients
async def list_clients(
    db: AsyncSession,
    status: Optional[str] = None,
    plan: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    stmt = select(Organization).order_by(Organization.updated_at.desc())
    if plan:
        stmt = stmt.where(Organization.plan == plan)
    orgs = (await db.execute(stmt)).scalars().all()

    items: List[dict] = []
    for org in orgs:
        assessment = await _latest_assessment(db, org.id)
        if assessment is not None:
            client_status = assessment.status
            progress = await _assessment_progress(db, assessment.id)
            maturity = await _assessment_maturity(db, assessment.id)
        else:
            client_status = "lead"
            progress = 0
            maturity = None

        if status and client_status != status:
            continue

        items.append(
            {
                "client_id": org.id,
                "name": org.name,
                "sector": org.sector,
                "plan": org.plan,
                "progress": progress,
                "maturity": maturity,
                "status": client_status,
                "last_activity": org.updated_at.isoformat() if org.updated_at else None,
            }
        )

    total = len(items)
    start = offset(page, page_size)
    page_items = items[start:start + page_size]
    return {"items": page_items, "meta": page_meta(page, page_size, total)}


async def get_client(
    db: AsyncSession, current: CurrentUser, client_id: uuid.UUID
) -> dict:
    org = await db.get(Organization, client_id)
    if org is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el cliente.")

    assessment = await _latest_assessment(db, org.id)
    locale = result_service.loc(current.user.locale)

    if assessment is not None:
        scores, _ = await result_service.compute_dimension_scores(db, assessment.id)
        progress = await _assessment_progress(db, assessment.id)
        maturity = await _assessment_maturity(db, assessment.id)
        client_status = assessment.status
    else:
        scores = {k: 0.0 for k in result_service.DIMENSIONS}
        progress = 0
        maturity = None
        client_status = "lead"

    dimensions = [
        {
            "label": result_service.dimension_label(k, locale),
            "score": round(scores[k], 1),
        }
        for k in result_service.DIMENSIONS
    ]

    return {
        "client_id": org.id,
        "name": org.name,
        "plan": org.plan,
        "status": client_status,
        "progress": progress,
        "maturity": maturity,
        "dimensions": dimensions,
    }


async def create_note(
    db: AsyncSession, current: CurrentUser, client_id: uuid.UUID, body: str
) -> dict:
    org = await db.get(Organization, client_id)
    if org is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el cliente.")

    note = ConsultantNote(
        organization_id=client_id, consultant_id=current.id, body=body
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return {"note_id": note.id, "created_at": note.created_at}
