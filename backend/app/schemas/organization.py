"""Organization read/update schemas."""
import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict


class OrgSettings(BaseModel):
    doc_locale: str
    theme: str
    logo_url: Optional[str] = None


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    sector: Optional[str] = None
    size: Optional[str] = None
    country: Optional[str] = None
    currency: str
    plan: str
    settings: OrgSettings


class OrgUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    sector: Optional[str] = None
    size: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    legal_name: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    doc_locale: Optional[str] = None
    theme: Optional[str] = None


class LogoResponse(BaseModel):
    logo_url: Optional[str] = None
