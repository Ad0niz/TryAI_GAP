"""Lead capture schemas (public signup) and lead read model."""
import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LeadCreate(BaseModel):
    full_name: str
    job_title: Optional[str] = None
    company_email: str
    company_name: str
    company_size: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    terms_accepted: bool = False
    locale: Optional[str] = "es"


class LeadCreateResponse(BaseModel):
    lead_id: uuid.UUID
    organization_id: uuid.UUID
    assessment_id: uuid.UUID
    plan: str = "free"
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    job_title: Optional[str] = None
    company_email: str
    company_name: str
    company_size: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    terms_accepted: bool
    locale: str
    user_id: Optional[uuid.UUID] = None
