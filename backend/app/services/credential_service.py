"""Verified registration and password recovery using purpose-separated opaque tokens.

MagicLinkToken already provides user, digest, expiry and consumption fields.
Prefixes in token_hash distinguish purposes; a credential token never matches
the plain digest accepted by magic-link login. No schema change is required.
"""
import asyncio
import logging
import re
from datetime import timedelta
from html import escape

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.emailrules import is_valid_email, is_corporate_email
from app.core.errors import APIError
from app.core.passwords import hash_password, verify_password
from app.core.security import as_utc, generate_opaque_token, hash_token, now_utc
from app.integrations.email import send_email
from app.models import MagicLinkToken, RefreshToken, User
from app.services.auth_service import issue_tokens, lock_auth_user

log = logging.getLogger('app.credentials')


def validate_password(password: str, confirmation: str) -> None:
    if not 12 <= len(password) <= 128 or not password.strip():
        raise APIError(422, 'AUTH_PASSWORD_INVALID', 'Usa entre 12 y 128 caracteres.')
    if password != confirmation:
        raise APIError(422, 'AUTH_PASSWORD_MISMATCH', 'Las contraseñas no coinciden.')


async def find_user(db: AsyncSession, email: str):
    users = (await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))).scalars().all()
    return users[0] if len(users) == 1 else None


def purpose_hash(purpose: str, raw: str) -> str:
    if purpose not in ('register', 'password_reset'):
        raise ValueError('Unsupported credential purpose')
    return f'{purpose}:{hash_token(raw)}'


async def token_row(db: AsyncSession, raw: str, purpose: str):
    if not re.fullmatch(r'[A-Za-z0-9_-]{43}', raw):
        raise APIError(400, 'AUTH_LINK_INVALID', 'El enlace no es válido.')
    row = (await db.execute(select(MagicLinkToken).where(
        MagicLinkToken.token_hash == purpose_hash(purpose, raw),
    ).execution_options(populate_existing=True))).scalar_one_or_none()
    if row is None:
        raise APIError(400, 'AUTH_LINK_INVALID', 'El enlace no es válido.')
    if row.used_at is not None:
        raise APIError(409, 'AUTH_LINK_USED', 'El enlace ya fue utilizado.')
    if as_utc(row.expires_at) <= now_utc():
        raise APIError(410, 'AUTH_LINK_EXPIRED', 'El enlace venció.')
    return row


async def claim(db: AsyncSession, row, raw: str, purpose: str):
    now = now_utc()
    result = await db.execute(update(MagicLinkToken).where(
        MagicLinkToken.id == row.id, MagicLinkToken.token_hash == purpose_hash(purpose, raw),
        MagicLinkToken.used_at.is_(None), MagicLinkToken.expires_at > now,
    ).values(used_at=now).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise APIError(400, 'AUTH_LINK_INVALID', 'El enlace ya no está disponible.')


async def deliver_credential_email(email: str, subject: str, html: str) -> None:
    try:
        await send_email(email, subject, html, sensitive=True)
    except Exception:
        # Provider exceptions may contain message bodies; never log their content.
        log.warning('Credential email delivery failed; message content omitted')


async def send_credential_link(db, user, purpose, locale, background):
    raw = generate_opaque_token()
    db.add(MagicLinkToken(user_id=user.id, token_hash=purpose_hash(purpose, raw),
                         expires_at=now_utc() + timedelta(minutes=settings.magic_link_ttl_min)))
    await db.flush()
    path = '/start' if purpose == 'register' else '/password/reset'
    link = escape(f'{settings.web_app_url}{path}?token={raw}', quote=True)
    messages = {
        'es': ('Verifica tu correo' if purpose == 'register' else 'Establece tu contraseña', 'Abre el enlace para continuar.'),
        'en': ('Verify your email' if purpose == 'register' else 'Set your password', 'Open the link to continue.'),
        'de': ('E-Mail bestätigen' if purpose == 'register' else 'Passwort festlegen', 'Öffne den Link, um fortzufahren.'),
        'pt': ('Verifique o seu e-mail' if purpose == 'register' else 'Defina a sua palavra-passe', 'Abra o link para continuar.'),
    }
    subject, text = messages.get(locale, messages['es'])
    # Run delivery after returning the generic response. Provider latency must
    # not reveal whether an account exists. Tokens are persisted by get_db.
    background.add_task(deliver_credential_email, user.email, subject,
                        f'<p>{text}</p><p><a href="{link}">{subject}</a></p>')


async def request_registration(db: AsyncSession, email: str, locale: str, background):
    email = email.strip().lower()
    if not is_valid_email(email):
        raise APIError(400, 'LEAD_EMAIL_INVALID', 'El correo no es válido.')
    if not is_corporate_email(email):
        raise APIError(422, 'LEAD_EMAIL_FREE_PROVIDER', 'El correo debe ser corporativo.')
    users = (await db.execute(select(User).where(func.lower(User.email) == email))).scalars().all()
    if len(users) > 1:
        return
    user = users[0] if users else None
    if user is None:
        try:
            async with db.begin_nested():
                user = User(email=email, role='client', status='invited', locale=locale[:2])
                db.add(user)
                await db.flush()
        except IntegrityError:
            user = await find_user(db, email)
    if user is None or user.role != 'client' or user.organization_id is not None or user.status not in ('active', 'invited') or user.two_factor_enabled:
        return
    await send_credential_link(db, user, 'register', locale, background)


async def registration_identity(db: AsyncSession, raw: str, *, lock=False):
    row = await token_row(db, raw, 'register')
    user = await lock_auth_user(db, row.user_id) if lock else await db.get(User, row.user_id)
    if lock:
        row = await token_row(db, raw, 'register')
    if user is None or user.role != 'client' or user.status not in ('active', 'invited') or user.two_factor_enabled:
        raise APIError(400, 'AUTH_LINK_INVALID', 'El enlace no es válido.')
    if user.organization_id is not None:
        raise APIError(409, 'LEAD_ALREADY_EXISTS', 'La cuenta ya está registrada.')
    return user, row


async def password_login(db: AsyncSession, email: str, password: str):
    user = await find_user(db, email)
    # An unknown account and an account without password still incur a PBKDF2 cost.
    encoded = user.password_hash if user and user.password_hash else None
    if encoded:
        valid = await asyncio.to_thread(verify_password, password, encoded)
    else:
        await asyncio.to_thread(hash_password, password)
        valid = False
    if not user or user.status != 'active' or not valid:
        raise APIError(401, 'AUTH_LOGIN_FAILED', 'No se pudo iniciar sesión con esas credenciales.')
    user = await lock_auth_user(db, user.id)
    if user is None or user.status != 'active' or user.password_hash != encoded:
        raise APIError(401, 'AUTH_LOGIN_FAILED', 'No se pudo iniciar sesión con esas credenciales.')
    if user.two_factor_enabled:
        raise APIError(403, 'AUTH_2FA_UNAVAILABLE', 'Esta cuenta requiere un segundo factor no integrado.')
    return user, await issue_tokens(db, user)


async def request_password_reset(db: AsyncSession, email: str, locale: str, background):
    user = await find_user(db, email)
    if user and user.status == 'active':
        await send_credential_link(db, user, 'password_reset', locale, background)


async def reset_password(db: AsyncSession, raw: str, password: str, confirmation: str):
    validate_password(password, confirmation)
    row = await token_row(db, raw, 'password_reset')
    user = await lock_auth_user(db, row.user_id)
    row = await token_row(db, raw, 'password_reset')
    if user is None or user.status != 'active':
        raise APIError(400, 'AUTH_LINK_INVALID', 'El enlace no es válido.')
    encoded = await asyncio.to_thread(hash_password, password)
    await claim(db, row, raw, 'password_reset')
    user.password_hash = encoded
    now = now_utc()
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
    await db.execute(update(MagicLinkToken).where(MagicLinkToken.user_id == user.id, MagicLinkToken.used_at.is_(None)).values(used_at=now).execution_options(synchronize_session=False))
    await db.flush()
