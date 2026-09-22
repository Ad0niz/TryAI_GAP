"""Shared FastAPI dependencies: DB session, current user, RBAC and plan gating."""
import uuid
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Organization, User

__all__ = ["get_db", "get_current_user", "require_roles", "require_pro", "CurrentUser"]


@dataclass
class CurrentUser:
    user: User
    organization: Optional[Organization]

    @property
    def id(self) -> uuid.UUID:
        return self.user.id

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def organization_id(self) -> Optional[uuid.UUID]:
        return self.user.organization_id


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise APIError(401, "UNAUTHENTICATED", "Falta el token o no es válido.")
    return auth.split(" ", 1)[1].strip()


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> CurrentUser:
    token = _bearer_token(request)
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise APIError(401, "TOKEN_EXPIRED", "El access token expiró; use el refresh token.")
    except jwt.InvalidTokenError:
        raise APIError(401, "UNAUTHENTICATED", "El token no es válido.")

    if payload.get("type") != "access":
        raise APIError(401, "UNAUTHENTICATED", "El token no es válido.")
    try:
        user_id = uuid.UUID(payload.get("sub"))
    except (TypeError, ValueError):
        raise APIError(401, "UNAUTHENTICATED", "El token no es válido.")

    user = await db.get(User, user_id)
    if not user or user.status == "disabled":
        raise APIError(401, "UNAUTHENTICATED", "Usuario no encontrado o deshabilitado.")

    org = None
    if user.organization_id:
        org = await db.get(Organization, user.organization_id)
    return CurrentUser(user=user, organization=org)


def require_roles(*roles: str):
    async def _dep(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current.role not in roles:
            raise APIError(403, "FORBIDDEN", "No tiene permisos para esta operación.")
        return current
    return _dep


async def require_pro(current: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not current.organization or current.organization.plan != "pro":
        raise APIError(402, "PLAN_UPGRADE_REQUIRED", "Esta función requiere el plan Pro.")
    return current
