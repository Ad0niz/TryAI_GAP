"""Public invitation acceptance. All writes share the request transaction."""
import asyncio
import re

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.core.passwords import hash_password, verify_password
from app.core.security import as_utc, hash_token, now_utc
from app.models import Invitation, Organization, OrgMember, User
from app.schemas.auth import MeResponse
from app.schemas.team import InvitationAccept
from app.services.auth_service import issue_tokens


def invitation_status(invitation: Invitation) -> str:
    if invitation.status == "accepted" or invitation.accepted_at is not None:
        return "accepted"
    if (invitation.status == "expired" or invitation.expires_at is None
            or as_utc(invitation.expires_at) <= now_utc()):
        return "expired"
    return invitation.status


async def _invitation(db: AsyncSession, token: str, *, lock: bool = False) -> Invitation:
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        raise APIError(400, "INVITE_TOKEN_INVALID", "La invitación no es válida.")
    stmt = select(Invitation).where(Invitation.token_hash == hash_token(token))
    if lock:
        stmt = stmt.with_for_update()
    invitation = (await db.execute(stmt)).scalar_one_or_none()
    if invitation is None:
        raise APIError(400, "INVITE_TOKEN_INVALID", "La invitación no es válida.")
    state = invitation_status(invitation)
    if state == "accepted":
        raise APIError(409, "INVITE_ALREADY_ACCEPTED", "La invitación ya fue aceptada.")
    if state == "expired":
        raise APIError(410, "INVITE_TOKEN_EXPIRED", "La invitación venció. Solicita un nuevo enlace.")
    if state != "sent":
        raise APIError(400, "INVITE_TOKEN_INVALID", "La invitación no es válida.")
    return invitation


def _check_user(user: User | None, invitation: Invitation) -> None:
    if user and user.status == "disabled":
        raise APIError(403, "INVITE_ACCOUNT_DISABLED", "La cuenta está deshabilitada. Contacta al administrador.")
    if user and (user.role != "client" or user.organization_id not in (None, invitation.organization_id)):
        raise APIError(409, "INVITE_ACCOUNT_CONFLICT", "La cuenta no puede asociarse a esta organización. Contacta al administrador.")


async def preview_invitation(db: AsyncSession, token: str) -> dict:
    invitation = await _invitation(db, token)
    organization = await db.get(Organization, invitation.organization_id)
    if organization is None:
        raise APIError(400, "INVITE_TOKEN_INVALID", "La organización ya no está disponible.")
    user = (await db.execute(select(User).where(func.lower(User.email) == invitation.email.lower()))).scalar_one_or_none()
    _check_user(user, invitation)
    return {
        "organization_name": organization.name, "full_name": invitation.full_name,
        "email": invitation.email, "area_key": invitation.area_key,
        "expires_at": invitation.expires_at, "password_is_set": bool(user and user.password_hash),
    }


async def accept_invitation(db: AsyncSession, payload: InvitationAccept) -> dict:
    invitation = await _invitation(db, payload.token, lock=True)
    # Serialize membership creation within an organization (including legacy placeholders).
    organization = (await db.execute(select(Organization).where(
        Organization.id == invitation.organization_id,
    ).with_for_update())).scalar_one_or_none()
    if organization is None:
        raise APIError(400, "INVITE_TOKEN_INVALID", "La organización ya no está disponible.")
    user = (await db.execute(select(User).where(
        func.lower(User.email) == invitation.email.lower(),
    ).with_for_update())).scalar_one_or_none()
    _check_user(user, invitation)
    password = payload.password.get_secret_value()
    if user and user.password_hash:
        if not await asyncio.to_thread(verify_password, password, user.password_hash):
            raise APIError(400, "INVITE_PASSWORD_INCORRECT", "La contraseña actual no es correcta.")
        password_hash = user.password_hash
    else:
        if not password.strip():
            raise APIError(422, "INVITE_PASSWORD_INVALID", "La contraseña no puede contener solo espacios.")
        password_hash = await asyncio.to_thread(hash_password, password)

    # Conditional claim also guards expiry while hashing and databases without row locks.
    accepted_at = now_utc()
    claimed = await db.execute(update(Invitation).where(
        Invitation.id == invitation.id, Invitation.status == "sent",
        Invitation.token_hash == hash_token(payload.token),
        Invitation.accepted_at.is_(None), Invitation.expires_at > accepted_at,
    ).values(status="accepted", accepted_at=accepted_at).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        raise APIError(409, "INVITE_CHANGED", "La invitación cambió. Vuelve a cargar el enlace.")

    try:
        if user is None:
            user = User(email=invitation.email.lower(), full_name=invitation.full_name, role="client", locale="es")
            db.add(user)
        user.password_hash = password_hash
        user.organization_id = invitation.organization_id
        user.status = "active"
        if not user.full_name:
            user.full_name = invitation.full_name
        await db.flush()
        member = (await db.execute(select(OrgMember).where(
            OrgMember.organization_id == invitation.organization_id,
            OrgMember.user_id == user.id, OrgMember.area_key == invitation.area_key,
        ).order_by(OrgMember.created_at))).scalars().first()
        if member is None:
            member = (await db.execute(select(OrgMember).where(
                OrgMember.organization_id == invitation.organization_id,
                OrgMember.user_id.is_(None), OrgMember.area_key == invitation.area_key,
                OrgMember.status.in_(["invited", "pending"]),
            ).order_by(OrgMember.created_at).with_for_update())).scalars().first()
        if member is None:
            member = OrgMember(organization_id=invitation.organization_id, area_key=invitation.area_key, role="leader")
            db.add(member)
        member.user_id = user.id
        member.status = "active"
        await db.flush()
        tokens = await issue_tokens(db, user)
        return {**tokens, "user": MeResponse.model_validate(user), "status": "accepted", "area_key": invitation.area_key}
    except IntegrityError as exc:
        # For example, concurrent invitations creating the same email in two organizations.
        # The request dependency rolls back the claim along with all account changes.
        raise APIError(409, "INVITE_CHANGED", "La cuenta cambió. Vuelve a cargar el enlace.") from exc
