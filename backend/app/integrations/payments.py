"""Stripe wrapper. In dev without valid keys, creates a mock checkout session."""
import stripe

from app.core.config import settings

stripe.api_key = settings.stripe_secret_key


def _is_configured() -> bool:
    return bool(settings.stripe_secret_key and settings.stripe_secret_key.startswith("sk_") and settings.stripe_secret_key != "sk_test_xxx")


def create_checkout_session(*, amount_cents: int, currency: str, payment_id: str,
                            success_url: str, cancel_url: str, idempotency_key: str | None = None) -> dict:
    if not _is_configured():
        # Dev fallback: deterministic mock session
        return {"id": f"cs_mock_{payment_id}", "url": f"{success_url}?mock_session=cs_mock_{payment_id}"}
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": currency.lower(),
                "product_data": {"name": "AI Assessment"},
                "unit_amount": amount_cents,
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"payment_id": payment_id},
        idempotency_key=idempotency_key,
    )
    return {"id": session.id, "url": session.url}


def verify_webhook(payload: bytes, signature: str) -> dict:
    """Returns the verified Stripe event dict, or raises ValueError on bad signature."""
    if not settings.stripe_webhook_secret or settings.stripe_webhook_secret == "whsec_xxx":
        # Dev fallback: trust the payload as-is
        import json
        return json.loads(payload.decode("utf-8"))
    try:
        return stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:  # SignatureVerificationError, ValueError
        raise ValueError(str(exc))
