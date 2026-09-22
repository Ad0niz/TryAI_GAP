"""Team roster, invitations and per-question delegation endpoints."""
import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.team import (
    DelegateCreate,
    DelegateResponse,
    InvitationCreate,
    InvitationResendResponse,
    InvitationResponse,
    TeamListResponse,
)
from app.services import team_service

router = APIRouter(tags=["team"])


@router.get("/team", response_model=TeamListResponse)
async def get_team(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await team_service.list_team(db, current)


@router.post("/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    payload: InvitationCreate,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await team_service.create_invitation(db, current, payload)


@router.post("/invitations/{invitation_id}/resend", response_model=InvitationResendResponse)
async def resend_invitation(
    invitation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await team_service.resend_invitation(db, current, invitation_id)


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invitation(
    invitation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    await team_service.delete_invitation(db, current, invitation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/assessments/{assessment_id}/questions/{question_id}/delegate",
    response_model=DelegateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def delegate_question(
    assessment_id: uuid.UUID,
    question_id: uuid.UUID,
    payload: DelegateCreate,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await team_service.delegate_question(db, current, assessment_id, question_id, payload)
