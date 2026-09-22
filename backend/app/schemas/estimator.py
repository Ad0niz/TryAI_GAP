"""Estimator (pricing / quote / distributor-code) schemas."""
import uuid
from typing import List, Optional

from pydantic import BaseModel


class PricingResponse(BaseModel):
    currency: str = "USD"
    base_price: int = 500
    area_review: int = 200
    support_session: int = 150
    final_report_validation: int = 400


class AreaConfig(BaseModel):
    area_key: str
    active: bool = False
    review: bool = False
    sessions: int = 0


class QuoteCreate(BaseModel):
    areas: List[AreaConfig] = []
    final_report: bool = False
    distributor_code: Optional[str] = None


class QuoteLine(BaseModel):
    concept: str
    amount: float


class QuoteResponse(BaseModel):
    quote_id: uuid.UUID
    currency: str
    lines: List[QuoteLine]
    subtotal: float
    discount: float
    total: float


class DistributorCodeValidate(BaseModel):
    code: str


class DistributorCodeValidateResponse(BaseModel):
    valid: bool
    discount_pct: int
