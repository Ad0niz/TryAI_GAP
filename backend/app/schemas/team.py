"""Team, invitation and delegation request/response schemas."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TeamMemberOut(BaseModel):
    member_id: uuid.UUID
    name: Optional[str] = None
    email: Optional[str] = None
    area_key: Optional[str] = None
    role: str
    status: str


class InvitationOut(BaseModel):
    invitation_id: uuid.UUID
    full_name: str
    email: str
    area_key: Optional[str] = None
    status: str  # sent|accepted|expired
    created_at: Optional[datetime] = None


class TeamListResponse(BaseModel):
    items: List[TeamMemberOut]
    invitations: List[InvitationOut] = []


class InvitationCreate(BaseModel):
    full_name: str
    email: str
    area_key: Optional[str] = None
    whatsapp: Optional[str] = None
    phone: Optional[str] = None


class InvitationResponse(BaseModel):
    invitation_id: uuid.UUID
    status: str
    email: str
    area_key: Optional[str] = None


class InvitationResendResponse(BaseModel):
    invitation_id: uuid.UUID
    status: str


class DelegateCreate(BaseModel):
    name: str
    email: str


class DelegateResponse(BaseModel):
    delegation_id: uuid.UUID
    question_id: uuid.UUID
    status: str
    sent_to: str
