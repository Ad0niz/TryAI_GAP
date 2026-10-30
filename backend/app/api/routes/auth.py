"""Verified signup, password and magic-link authentication, recovery and sessions."""
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
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
from app.services import auth_service, credential_service
from app.core.auth_limits import auth_limit
from app.schemas.auth import (CredentialEmailRequest, CredentialTokenRequest,
    PasswordLoginRequest, PasswordResetRequest, PasswordLoginResponse, RegistrationPreview)

def private_auth_response(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(private_auth_response)])


@router.post("/magic-link", status_code=202, response_model=MagicLinkResponse)
async def magic_link(payload: MagicLinkRequest, request: Request, db: AsyncSession = Depends(get_db)):
    auth_limit(request, "magic_request", payload.email.strip().lower())
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


@router.post("/login", response_model=PasswordLoginResponse)
async def password_login(payload: PasswordLoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    limiter = auth_limit(request, "login", payload.email.strip().lower())
    user, tokens = await credential_service.password_login(db, payload.email, payload.password.get_secret_value())
    limiter.forgive_login(payload.email.strip().lower())
    return PasswordLoginResponse(user=MeResponse.model_validate(user), **tokens)


@router.post("/register/request", status_code=202, response_model=MagicLinkResponse)
async def request_registration(payload: CredentialEmailRequest, request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    auth_limit(request, "register_request", payload.email.strip().lower())
    await credential_service.request_registration(db, payload.email, payload.locale, background)
    return MagicLinkResponse()


@router.post("/register/preview", response_model=RegistrationPreview)
async def registration_preview(payload: CredentialTokenRequest, request: Request, db: AsyncSession = Depends(get_db)):
    raw = payload.token.get_secret_value()
    auth_limit(request, "register_preview", raw)
    user, _ = await credential_service.registration_identity(db, raw)
    return RegistrationPreview(email=user.email)


@router.post("/password/reset/request", status_code=202, response_model=MagicLinkResponse)
async def request_password_reset(payload: CredentialEmailRequest, request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    auth_limit(request, "reset_request", payload.email.strip().lower())
    await credential_service.request_password_reset(db, payload.email, payload.locale, background)
    return MagicLinkResponse()


@router.post("/password/reset", status_code=204)
async def password_reset(payload: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    raw = payload.token.get_secret_value()
    auth_limit(request, "password_reset", raw)
    await credential_service.reset_password(db, raw, payload.password.get_secret_value(), payload.password_confirmation.get_secret_value())


@router.get("/permissions")
async def permissions(current: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.services.organization_access import organization_access
    access = await organization_access(db, current)
    return {"organization_admin": access.admin, "area_keys": sorted(access.area_keys)}
