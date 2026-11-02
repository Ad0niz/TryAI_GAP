"""Lead routes: public capture (creates org/user/assessment) and lead read."""
import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.lead import LeadCreate, LeadCreateResponse, LeadOut
from app.services import lead_service
from app.core.auth_limits import auth_limit

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", status_code=201, response_model=LeadCreateResponse)
async def create_lead(payload: LeadCreate, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    auth_limit(request, "register_complete", payload.verification_token.get_secret_value())
    result = await lead_service.create_lead(db, payload)
    return LeadCreateResponse(**result)


@router.get("/{lead_id}", response_model=LeadOut)
async def get_lead(
    lead_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await lead_service.get_lead(db, current, lead_id)
    return LeadOut.model_validate(lead)
