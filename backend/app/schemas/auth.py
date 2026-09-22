"""Auth request/response schemas (magic link, verify, refresh, logout, me)."""
import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MagicLinkRequest(BaseModel):
    email: str
    locale: Optional[str] = "es"


class MagicLinkResponse(BaseModel):
    status: str = "sent"
    message: Optional[str] = None


class VerifyRequest(BaseModel):
    token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None
    all: bool = False


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    role: str
    locale: str


class VerifyResponse(TokenPair):
    user: UserPublic


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: Optional[str] = None
    role: str
    locale: str
    organization_id: Optional[uuid.UUID] = None
