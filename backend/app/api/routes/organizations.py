"""Organization routes: read, partial update, logo upload (tenant-scoped)."""
import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.organization import LogoResponse, OrgOut, OrgUpdate
from app.services import organization_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/{organization_id}", response_model=OrgOut)
async def get_organization(
    organization_id: uuid.UUID,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await organization_service.get_organization(db, current, organization_id)
    return OrgOut(**organization_service.serialize_org(org))


@router.patch("/{organization_id}", response_model=OrgOut)
async def update_organization(
    organization_id: uuid.UUID,
    payload: OrgUpdate,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await organization_service.update_organization(db, current, organization_id, payload)
    return OrgOut(**organization_service.serialize_org(org))


@router.post("/{organization_id}/logo", response_model=LogoResponse)
async def upload_logo(
    organization_id: uuid.UUID,
    file: UploadFile = File(...),
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    org = await organization_service.set_logo(
        db, current, organization_id, data, file.filename, file.content_type
    )
    return LogoResponse(logo_url=org.logo_url)
