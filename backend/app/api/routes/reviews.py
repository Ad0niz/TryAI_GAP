"""Review routes: request expert review, read review state, rate the consultant."""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db, require_pro
from app.schemas.review import (
    RatingCreate, RatingOut, ReviewCreate, ReviewCreateOut, ReviewOut,
)
from app.services import review_service

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("", response_model=ReviewCreateOut, status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    current: CurrentUser = Depends(require_pro),
    db: AsyncSession = Depends(get_db),
):
    review = await review_service.create_review(db, current, payload)
    return ReviewCreateOut(review_id=review.id, mode=review.mode, stage=review.stage)


@router.get("/{review_id}", response_model=ReviewOut)
async def get_review(
    review_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await review_service.get_review(db, current, review_id)


@router.post(
    "/{review_id}/ratings",
    response_model=RatingOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_rating(
    review_id: uuid.UUID,
    payload: RatingCreate,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await review_service.create_rating(db, current, review_id, payload)
