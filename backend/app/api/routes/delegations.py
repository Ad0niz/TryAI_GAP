"""Public delegation answer endpoint (no auth; token-based)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import team_service

router = APIRouter(prefix="/delegations", tags=["delegations"])


class DelegationAnswerRequest(BaseModel):
    value: int


class DelegationAnswerResponse(BaseModel):
    status: str
    question_code: str | None = None


class DelegationInfoResponse(BaseModel):
    delegate_name: str
    question_code: Optional[str] = None
    question_text: Optional[str] = None
    status: str  # sent|answered|expired
    expires_at: Optional[datetime] = None


@router.get("/{token}", response_model=DelegationInfoResponse)
async def get_delegation(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    locale = (request.headers.get("Accept-Language") or "es")[:2]
    return await team_service.get_delegation_info(db, token, locale)


@router.post("/{token}/answer", response_model=DelegationAnswerResponse)
async def answer_delegation(
    token: str,
    payload: DelegationAnswerRequest,
    db: AsyncSession = Depends(get_db),
):
    return await team_service.answer_delegation(db, token, payload.value)
