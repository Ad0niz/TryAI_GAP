"""Consultant workspace schemas (KPIs, clients, notes)."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class KpisOut(BaseModel):
    leads: int
    active_engagements: int
    avg_maturity: float
    free_to_paid_conversion_pct: int


class ClientItem(BaseModel):
    client_id: uuid.UUID
    name: str
    sector: Optional[str] = None
    plan: str
    progress: int
    maturity: Optional[float] = None
    status: str
    last_activity: Optional[str] = None


class ClientDimension(BaseModel):
    label: str
    score: float


class ClientDetail(BaseModel):
    client_id: uuid.UUID
    name: str
    plan: str
    status: str
    progress: int
    maturity: Optional[float] = None
    dimensions: List[ClientDimension]


class NoteCreate(BaseModel):
    body: str


class NoteOut(BaseModel):
    note_id: uuid.UUID
    created_at: datetime
