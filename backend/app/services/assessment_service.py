"""Assessment discovery services (current-assessment lookup)."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.models import Assessment
from app.services.answer_service import assessment_summary


async def get_current_assessment(db: AsyncSession, current: CurrentUser) -> dict:
    """Return the latest assessment of the caller's organization.

    Raises 404 ASSESSMENT_NOT_FOUND when the user has no organization or the
    organization has no assessment yet.
    """
    if current.organization_id is None:
        raise APIError(
            404, "ASSESSMENT_NOT_FOUND",
            "El usuario no pertenece a ninguna organización con evaluación.",
        )
    stmt = (
        select(Assessment)
        .where(Assessment.organization_id == current.organization_id)
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None:
        raise APIError(
            404, "ASSESSMENT_NOT_FOUND",
            "La organización no tiene ninguna evaluación.",
        )
    return await assessment_summary(db, assessment)
