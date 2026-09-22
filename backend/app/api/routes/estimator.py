"""Pricing catalog, quote generation and distributor-code validation endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.estimator import (
    DistributorCodeValidate,
    DistributorCodeValidateResponse,
    PricingResponse,
    QuoteCreate,
    QuoteResponse,
)
from app.services import estimator_service

router = APIRouter(tags=["estimator"])


@router.get("/pricing", response_model=PricingResponse)
async def get_pricing():
    return estimator_service.pricing()


@router.post("/estimator/quote", response_model=QuoteResponse)
async def create_quote(
    payload: QuoteCreate,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await estimator_service.create_quote(db, current, payload)


@router.post("/distributor-codes/validate", response_model=DistributorCodeValidateResponse)
async def validate_distributor_code(
    payload: DistributorCodeValidate,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await estimator_service.validate_distributor_code(db, payload.code)
