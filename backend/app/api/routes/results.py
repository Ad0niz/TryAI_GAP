"""Results routes: maturity results + async PDF report jobs (Pro-only)."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_db, require_pro
from app.schemas.result import ReportCreateOut, ReportOut, ReportRequest, ResultOut
from app.services import result_service

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/{assessment_id}", response_model=ResultOut)
async def get_results(
    assessment_id: uuid.UUID,
    current: CurrentUser = Depends(require_pro),
    db: AsyncSession = Depends(get_db),
):
    return await result_service.build_result(db, current, assessment_id)


@router.post(
    "/{assessment_id}/report",
    response_model=ReportCreateOut,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_report(
    assessment_id: uuid.UUID,
    payload: Optional[ReportRequest] = None,
    current: CurrentUser = Depends(require_pro),
    db: AsyncSession = Depends(get_db),
):
    locale = payload.locale if payload else None
    return await result_service.create_report(db, current, assessment_id, locale)


@router.get("/{assessment_id}/report", response_model=ReportOut)
async def get_report(
    assessment_id: uuid.UUID,
    current: CurrentUser = Depends(require_pro),
    db: AsyncSession = Depends(get_db),
):
    return await result_service.get_report(db, current, assessment_id)
