"""Payment / checkout schemas."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CheckoutSessionCreate(BaseModel):
    quote_id: uuid.UUID
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    payment_id: uuid.UUID
    provider: str = "stripe"
    checkout_url: str
    status: str


class PaymentOut(BaseModel):
    payment_id: uuid.UUID
    status: str
    amount: float
    currency: str
    paid_at: Optional[datetime] = None
