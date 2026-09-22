"""Lead routes: public capture (creates org/user/assessment) and lead read."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.lead import LeadCreate, LeadCreateResponse, LeadOut
from app.services import lead_service

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("", status_code=201, response_model=LeadCreateResponse)
async def create_lead(payload: LeadCreate, db: AsyncSession = Depends(get_db)):
    result = await lead_service.create_lead(db, payload)
    return LeadCreateResponse(**result)


@router.get("/{lead_id}", response_model=LeadOut)
async def get_lead(
    lead_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lead = await lead_service.get_lead(db, lead_id)
    return LeadOut.model_validate(lead)
