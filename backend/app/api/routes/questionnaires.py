"""Questionnaire endpoints (maturity / area modules)."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.questionnaire import QuestionnaireOut
from app.services.questionnaire_service import get_questionnaire

router = APIRouter(prefix="/questionnaires", tags=["questionnaires"])


@router.get("", response_model=QuestionnaireOut)
async def read_questionnaire(
    module: str = Query(...),
    area_key: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await get_questionnaire(db, module, area_key, locale or "es")
