"""Auth routes: passwordless magic link, verify, refresh, logout, me."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.auth import (
    LogoutRequest,
    MagicLinkRequest,
    MagicLinkResponse,
    MeResponse,
    RefreshRequest,
    TokenPair,
    UserPublic,
    VerifyRequest,
    VerifyResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/magic-link", status_code=202, response_model=MagicLinkResponse)
async def magic_link(payload: MagicLinkRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.request_magic_link(db, payload.email, payload.locale or "es")
    # Always return the same body to avoid user enumeration.
    return MagicLinkResponse(status="sent", message="Si el correo existe, enviaremos un enlace de acceso.")


@router.post("/verify", response_model=VerifyResponse)
async def verify(payload: VerifyRequest, db: AsyncSession = Depends(get_db)):
    user, tokens = await auth_service.verify_magic_link(db, payload.token)
    return VerifyResponse(user=UserPublic.model_validate(user), **tokens)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.rotate_refresh_token(db, payload.refresh_token)
    return TokenPair(**tokens)


@router.post("/logout", status_code=204)
async def logout(
    payload: LogoutRequest,
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.revoke_tokens(
        db, current.user, refresh_token=payload.refresh_token, all_tokens=payload.all
    )
    return None


@router.get("/me", response_model=MeResponse)
async def me(current: CurrentUser = Depends(get_current_user)):
    return MeResponse.model_validate(current.user)
