"""Pricing catalog, quote computation and distributor-code validation."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.models import DistributorCode, Quote
from app.schemas.estimator import QuoteCreate

BASE_PRICE = 500
AREA_REVIEW = 200
SUPPORT_SESSION = 150
FINAL_REPORT_VALIDATION = 400
CURRENCY = "USD"


def _require_org(current: CurrentUser) -> uuid.UUID:
    if not current.organization_id:
        raise APIError(403, "FORBIDDEN", "No pertenece a ninguna organización.")
    return current.organization_id


def pricing() -> dict:
    return {
        "currency": CURRENCY,
        "base_price": BASE_PRICE,
        "area_review": AREA_REVIEW,
        "support_session": SUPPORT_SESSION,
        "final_report_validation": FINAL_REPORT_VALIDATION,
    }


async def create_quote(db: AsyncSession, current: CurrentUser, payload: QuoteCreate) -> dict:
    org_id = _require_org(current)

    for area in payload.areas:
        if area.sessions < 0 or area.sessions > 3:
            raise APIError(
                422,
                "ESTIMATOR_INVALID_CONFIG",
                "El número de sesiones por área debe estar entre 0 y 3.",
            )

    lines = [{"concept": "base_price", "amount": float(BASE_PRICE)}]

    review_total = sum(AREA_REVIEW for a in payload.areas if a.review)
    if review_total:
        lines.append({"concept": "area_review", "amount": float(review_total)})

    session_total = sum(SUPPORT_SESSION * a.sessions for a in payload.areas if a.active)
    if session_total:
        lines.append({"concept": "support_session", "amount": float(session_total)})

    final_total = FINAL_REPORT_VALIDATION if payload.final_report else 0
    if final_total:
        lines.append({"concept": "final_report_validation", "amount": float(final_total)})

    subtotal = float(BASE_PRICE + review_total + session_total + final_total)

    discount = 0.0
    code = (payload.distributor_code or "").strip()
    if code:
        dc = (
            await db.execute(
                select(DistributorCode).where(
                    DistributorCode.code == code,
                    DistributorCode.active.is_(True),
                )
            )
        ).scalar_one_or_none()
        if dc is not None:
            discount = round(subtotal * 0.10, 2)

    total = round(subtotal - discount, 2)

    quote = Quote(
        organization_id=org_id,
        base_price=BASE_PRICE,
        areas=[a.model_dump() for a in payload.areas],
        final_report=payload.final_report,
        distributor_code=code or None,
        subtotal=subtotal,
        discount=discount,
        total=total,
        currency=CURRENCY,
    )
    db.add(quote)
    await db.flush()

    return {
        "quote_id": quote.id,
        "currency": CURRENCY,
        "lines": lines,
        "subtotal": subtotal,
        "discount": discount,
        "total": total,
    }


async def validate_distributor_code(db: AsyncSession, code: str) -> dict:
    value = (code or "").strip()
    dc = (
        await db.execute(
            select(DistributorCode).where(
                DistributorCode.code == value,
                DistributorCode.active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if dc is None:
        raise APIError(404, "DISTRIBUTOR_CODE_INVALID", "El código de distribuidor no es válido.")
    return {"valid": True, "discount_pct": dc.discount_pct}
