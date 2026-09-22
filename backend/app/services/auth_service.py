"""Auth service: magic link issuance/verification, token pair issue/rotation."""
import logging
from datetime import timedelta
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import APIError
from app.core.security import (
    access_token_expires_in,
    as_utc,
    create_access_token,
    generate_opaque_token,
    hash_token,
    now_utc,
)
from app.integrations.email import magic_link_email, send_email
from app.models import MagicLinkToken, RefreshToken, User

log = logging.getLogger("app.auth")


async def issue_tokens(db: AsyncSession, user: User) -> dict:
    """Create an access JWT plus a hashed opaque refresh token row."""
    access_token = create_access_token(str(user.id), {"role": user.role})

    raw_refresh = generate_opaque_token()
    refresh = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=now_utc() + timedelta(days=settings.refresh_token_ttl_days),
    )
    db.add(refresh)
    await db.flush()

    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": access_token_expires_in(),
    }


async def request_magic_link(db: AsyncSession, email: str, locale: str = "es") -> None:
    """Create the user if needed, issue a magic link token and send the email."""
    email = (email or "").strip().lower()
    locale = (locale or "es")[:2]

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(email=email, role="client", status="active", locale=locale)
        db.add(user)
        await db.flush()

    raw = generate_opaque_token()
    token = MagicLinkToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=now_utc() + timedelta(minutes=settings.magic_link_ttl_min),
    )
    db.add(token)
    await db.flush()

    link = f"{settings.web_app_url}/auth/verify?token={raw}"
    subject, html = magic_link_email(link, locale)
    try:
        await send_email(email, subject, html)
    except Exception:  # pragma: no cover - never fail on email delivery
        log.exception("Failed to send magic link email to %s", email)


async def verify_magic_link(db: AsyncSession, token: str) -> tuple[User, dict]:
    """Validate a magic link token, mark it used and issue tokens."""
    result = await db.execute(
        select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(token))
    )
    mlt = result.scalar_one_or_none()
    if mlt is None:
        raise APIError(400, "TOKEN_INVALID", "El enlace no es válido.")
    if mlt.used_at is not None:
        raise APIError(409, "TOKEN_ALREADY_USED", "El enlace ya fue utilizado.")
    if as_utc(mlt.expires_at) <= now_utc():
        raise APIError(410, "TOKEN_EXPIRED", "El enlace expiró.")

    mlt.used_at = now_utc()
    user = await db.get(User, mlt.user_id)
    if user is None:
        raise APIError(400, "TOKEN_INVALID", "El enlace no es válido.")

    tokens = await issue_tokens(db, user)
    return user, tokens


async def rotate_refresh_token(db: AsyncSession, refresh_token: str) -> dict:
    """Validate + rotate a refresh token, returning a new token pair."""
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    rt = result.scalar_one_or_none()
    if rt is None or rt.revoked_at is not None:
        raise APIError(401, "REFRESH_TOKEN_INVALID", "El refresh token no es válido.")
    if rt.expires_at <= now_utc():
        raise APIError(410, "REFRESH_TOKEN_EXPIRED", "El refresh token expiró.")

    rt.revoked_at = now_utc()
    user = await db.get(User, rt.user_id)
    if user is None:
        raise APIError(401, "REFRESH_TOKEN_INVALID", "El refresh token no es válido.")

    return await issue_tokens(db, user)


async def revoke_tokens(
    db: AsyncSession,
    user: User,
    refresh_token: Optional[str] = None,
    all_tokens: bool = False,
) -> None:
    """Revoke a single refresh token or every active token for the user."""
    now = now_utc()
    if all_tokens:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        return

    if refresh_token:
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == hash_token(refresh_token),
                RefreshToken.user_id == user.id,
            )
        )
        rt = result.scalar_one_or_none()
        if rt is not None and rt.revoked_at is None:
            rt.revoked_at = now
