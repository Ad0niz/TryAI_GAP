"""Area activation / listing / use-case catalog endpoints."""
import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db, require_pro
from app.schemas.area import AreaActivateResponse, AreaListResponse, CasesResponse
from app.services.answer_service import load_assessment
from app.services.area_service import (
    activate_area, deactivate_area, get_cases, list_areas,
)

router = APIRouter(tags=["areas"])


@router.get("/assessments/{assessment_id}/areas", response_model=AreaListResponse)
async def get_areas(
    assessment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    assessment = await load_assessment(db, assessment_id, current)
    locale = current.user.locale or "es"
    locked = bool(current.organization and current.organization.plan == "free")
    return await list_areas(db, assessment, locale, locked)


@router.post("/assessments/{assessment_id}/areas/{area_key}:activate",
             response_model=AreaActivateResponse)
async def activate(
    assessment_id: uuid.UUID,
    area_key: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(require_pro),
):
    assessment = await load_assessment(db, assessment_id, current)
    return await activate_area(db, assessment, area_key)


@router.delete("/assessments/{assessment_id}/areas/{area_key}", status_code=204)
async def deactivate(
    assessment_id: uuid.UUID,
    area_key: str,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(require_pro),
):
    assessment = await load_assessment(db, assessment_id, current)
    await deactivate_area(db, assessment, area_key)
    return Response(status_code=204)


@router.get("/areas/{area_key}/cases", response_model=CasesResponse)
async def area_cases(
    area_key: str,
    current: CurrentUser = Depends(get_current_user),
):
    locale = current.user.locale or "es"
    return get_cases(area_key, locale)
