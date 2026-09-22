"""Area state / catalog schemas."""
import uuid
from typing import List, Optional

from pydantic import BaseModel


class AreaItem(BaseModel):
    area_key: str
    name: str
    active: bool
    progress: int
    leader: Optional[str] = None
    locked: bool


class AreaListResponse(BaseModel):
    items: List[AreaItem]


class AreaActivateResponse(BaseModel):
    area_key: str
    active: bool
    progress: int


class CaseItem(BaseModel):
    name: str
    family: str
    kpi: str
    effort: str
    maturity: str
    stage: str


class CasesResponse(BaseModel):
    area_key: str
    cases: List[CaseItem]
