"""Stripe checkout sessions, payment reads and the Stripe webhook."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.payment import (
    CheckoutSessionCreate,
    CheckoutSessionResponse,
    PaymentOut,
)
from app.services import payment_service

router = APIRouter(tags=["payments"])


@router.post(
    "/payments/checkout-session",
    response_model=CheckoutSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_checkout_session(
    payload: CheckoutSessionCreate,
    idempotency_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await payment_service.create_checkout(
        db,
        current,
        payload.quote_id,
        payload.success_url,
        payload.cancel_url,
        idempotency_key,
    )


@router.get("/payments/{payment_id}", response_model=PaymentOut)
async def get_payment(
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await payment_service.get_payment(db, current, payment_id)


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    return await payment_service.process_webhook(db, payload, stripe_signature)
