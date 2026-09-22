"""Stripe checkout sessions, payment reads and webhook processing."""
import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.errors import APIError
from app.core.security import now_utc
from app.integrations.payments import create_checkout_session, verify_webhook
from app.models import Assessment, Organization, Payment, Quote, WebhookEvent


def _require_org(current: CurrentUser) -> uuid.UUID:
    if not current.organization_id:
        raise APIError(403, "FORBIDDEN", "No pertenece a ninguna organización.")
    return current.organization_id


async def create_checkout(
    db: AsyncSession,
    current: CurrentUser,
    quote_id: uuid.UUID,
    success_url: Optional[str],
    cancel_url: Optional[str],
    idempotency_key: Optional[str],
) -> dict:
    org_id = _require_org(current)
    quote = await db.get(Quote, quote_id)
    if quote is None or quote.organization_id != org_id:
        raise APIError(404, "QUOTE_NOT_FOUND", "No se encontró la cotización.")

    existing = (
        await db.execute(
            select(Payment).where(
                Payment.quote_id == quote_id,
                Payment.status == "succeeded",
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise APIError(409, "PAYMENT_ALREADY_COMPLETED", "Esta cotización ya fue pagada.")

    payment = Payment(
        status="pending",
        amount=quote.total,
        currency=quote.currency,
        quote_id=quote_id,
        organization_id=org_id,
        provider="stripe",
    )
    db.add(payment)
    await db.flush()

    session = create_checkout_session(
        amount_cents=int(float(quote.total) * 100),
        currency=quote.currency,
        payment_id=str(payment.id),
        success_url=success_url or settings.stripe_success_url,
        cancel_url=cancel_url or settings.stripe_cancel_url,
        idempotency_key=idempotency_key,
    )
    payment.provider_ref = session["id"]
    await db.flush()

    return {
        "payment_id": payment.id,
        "provider": "stripe",
        "checkout_url": session["url"],
        "status": "pending",
    }


async def get_payment(db: AsyncSession, current: CurrentUser, payment_id: uuid.UUID) -> dict:
    org_id = _require_org(current)
    payment = await db.get(Payment, payment_id)
    if payment is None or payment.organization_id != org_id:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el pago.")
    paid_at = payment.updated_at if payment.status == "succeeded" else None
    return {
        "payment_id": payment.id,
        "status": payment.status,
        "amount": float(payment.amount),
        "currency": payment.currency,
        "paid_at": paid_at,
    }


async def _find_payment(db: AsyncSession, data_obj: dict) -> Optional[Payment]:
    metadata = data_obj.get("metadata") or {}
    raw_id = metadata.get("payment_id")
    if raw_id:
        try:
            pid = uuid.UUID(str(raw_id))
        except (TypeError, ValueError):
            pid = None
        if pid is not None:
            payment = await db.get(Payment, pid)
            if payment is not None:
                return payment

    provider_ref = data_obj.get("id")
    if provider_ref:
        return (
            await db.execute(select(Payment).where(Payment.provider_ref == provider_ref))
        ).scalar_one_or_none()
    return None


async def process_webhook(db: AsyncSession, payload: bytes, signature: Optional[str]) -> dict:
    try:
        event = verify_webhook(payload, signature or "")
    except ValueError:
        raise APIError(400, "WEBHOOK_SIGNATURE_INVALID", "La firma del webhook no es válida.")

    if not isinstance(event, dict):
        event = {}

    event_id = event.get("id")
    if event_id:
        already = (
            await db.execute(select(WebhookEvent).where(WebhookEvent.event_id == event_id))
        ).scalar_one_or_none()
        if already is not None:
            return {"received": True}

    event_type = event.get("type")
    if event_id:
        db.add(
            WebhookEvent(
                provider="stripe",
                event_id=event_id,
                type=event_type,
                processed_at=now_utc(),
            )
        )
        await db.flush()

    data_obj = (event.get("data") or {}).get("object") or {}
    if not isinstance(data_obj, dict):
        data_obj = {}

    if event_type in ("checkout.session.completed", "payment_intent.succeeded"):
        payment = await _find_payment(db, data_obj)
        if payment is not None:
            payment.status = "succeeded"
            org = await db.get(Organization, payment.organization_id)
            if org is not None:
                org.plan = "pro"
                # Keep the org's assessments in sync so plan-gated UI reads pro.
                await db.execute(
                    update(Assessment)
                    .where(Assessment.organization_id == org.id, Assessment.plan == "free")
                    .values(plan="pro")
                )
            await db.flush()
    elif event_type == "payment_intent.payment_failed":
        payment = await _find_payment(db, data_obj)
        if payment is not None:
            payment.status = "failed"
            await db.flush()

    return {"received": True}
