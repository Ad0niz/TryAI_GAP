"""Consultant workspace routes (role=consultant only): KPIs, clients, notes."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_db, require_roles
from app.schemas.common import Page
from app.schemas.consultant import (
    ClientDetail, ClientItem, KpisOut, NoteCreate, NoteOut,
)
from app.services import consultant_service

router = APIRouter(prefix="/consultant", tags=["consultant"])

_consultant_only = require_roles("consultant")


@router.get("/kpis", response_model=KpisOut)
async def get_kpis(
    current: CurrentUser = Depends(_consultant_only),
    db: AsyncSession = Depends(get_db),
):
    return await consultant_service.kpis(db)


@router.get("/clients", response_model=Page[ClientItem])
async def list_clients(
    status: Optional[str] = Query(default=None),
    plan: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current: CurrentUser = Depends(_consultant_only),
    db: AsyncSession = Depends(get_db),
):
    return await consultant_service.list_clients(db, status, plan, page, page_size)


@router.get("/clients/{client_id}", response_model=ClientDetail)
async def get_client(
    client_id: uuid.UUID,
    current: CurrentUser = Depends(_consultant_only),
    db: AsyncSession = Depends(get_db),
):
    return await consultant_service.get_client(db, current, client_id)


@router.post(
    "/clients/{client_id}/notes",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_note(
    client_id: uuid.UUID,
    payload: NoteCreate,
    current: CurrentUser = Depends(_consultant_only),
    db: AsyncSession = Depends(get_db),
):
    return await consultant_service.create_note(db, current, client_id, payload.body)
