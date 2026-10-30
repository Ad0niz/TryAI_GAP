"""Review service: request expert review, read review state, rate consultant."""
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.core.security import as_utc
from app.services.answer_service import load_assessment
from app.models import Assessment, ConsultantRating, Review, ReviewChapter, User
from app.schemas.review import RatingCreate, ReviewCreate

_VALID_MODES = {"sync", "async"}


async def create_review(
    db: AsyncSession, current: CurrentUser, payload: ReviewCreate
) -> Review:
    if payload.mode not in _VALID_MODES:
        raise APIError(422, "VALIDATION_ERROR", "El modo debe ser 'sync' o 'async'.", "mode")

    assessment = await db.get(Assessment, payload.assessment_id)
    if assessment is None or assessment.organization_id != current.organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta evaluación.")

    stmt = select(Review).where(
        Review.assessment_id == payload.assessment_id, Review.stage < 2
    )
    if (await db.execute(stmt)).scalars().first() is not None:
        raise APIError(409, "REVIEW_ALREADY_REQUESTED", "Ya existe una revisión en curso.")

    review = Review(assessment_id=payload.assessment_id, mode=payload.mode, stage=1)
    db.add(review)
    await db.flush()
    return review


async def list_reviews(db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID) -> dict:
    """Discover every review of an owned assessment, newest first with a stable tie-breaker.

    Read access follows the existing organization scope, independently of plan.
    Consultant assignment and cross-organization access are outside APP-17.
    """
    await load_assessment(db, assessment_id, current)
    rows = (await db.execute(
        select(Review, User.full_name)
        .outerjoin(User, Review.consultant_id == User.id)
        .where(Review.assessment_id == assessment_id)
        .order_by(Review.created_at.desc(), Review.id.desc())
    )).all()
    return {"assessment_id": assessment_id, "items": [
        {"review_id": review.id, "mode": review.mode, "stage": review.stage,
         "created_at": as_utc(review.created_at), "updated_at": as_utc(review.updated_at),
         "consultant": consultant}
        for review, consultant in rows
    ]}


async def _owned_review(db: AsyncSession, current: CurrentUser, review_id: uuid.UUID) -> Review:
    review = await db.get(Review, review_id)
    if review is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró la revisión.")
    await load_assessment(db, review.assessment_id, current)
    return review


async def get_review(
    db: AsyncSession, current: CurrentUser, review_id: uuid.UUID
) -> dict:
    review = await _owned_review(db, current, review_id)

    consultant_name: Optional[str] = None
    if review.consultant_id:
        consultant = await db.get(User, review.consultant_id)
        if consultant is not None:
            consultant_name = consultant.full_name

    chapters = (
        await db.execute(
            select(ReviewChapter).where(ReviewChapter.review_id == review_id)
        )
    ).scalars().all()

    return {
        "review_id": review.id,
        "stage": review.stage,
        "consultant": consultant_name,
        "chapters": [
            {
                "chapter_key": c.chapter_key,
                "validated": c.validated,
                "note": c.note,
                "validated_at": c.validated_at,
            }
            for c in chapters
        ],
    }


async def create_rating(
    db: AsyncSession, current: CurrentUser, review_id: uuid.UUID, payload: RatingCreate
) -> dict:
    review = await _owned_review(db, current, review_id)

    scores = (payload.knowledge, payload.friendliness, payload.methodology)
    if any(s is None or not (1 <= s <= 5) for s in scores):
        raise APIError(
            422, "RATING_INCOMPLETE", "Debe puntuar las tres dimensiones (1–5)."
        )

    rating = ConsultantRating(
        review_id=review_id,
        chapter_key=payload.chapter_key,
        knowledge=payload.knowledge,
        friendliness=payload.friendliness,
        methodology=payload.methodology,
        comments=payload.comments,
    )
    db.add(rating)
    await db.flush()

    average = round(sum(scores) / 3, 1)
    return {"rating_id": rating.id, "average": average}
