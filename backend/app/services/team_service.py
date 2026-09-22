"""Team roster, invitations and per-question delegation."""
import logging
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.emailrules import is_valid_email
from app.core.errors import APIError
from app.core.security import generate_opaque_token, hash_token, now_utc, as_utc
from app.integrations.email import send_email
from app.models import (
    Answer, Assessment, Delegation, Invitation, OrgMember, Question,
    QuestionTranslation, User,
)
from app.schemas.team import DelegateCreate, InvitationCreate

log = logging.getLogger("app.team")


def _require_org(current: CurrentUser) -> uuid.UUID:
    if not current.organization_id:
        raise APIError(403, "FORBIDDEN", "No pertenece a ninguna organización.")
    return current.organization_id


async def _safe_send(to: str, subject: str, html: str) -> None:
    try:
        await send_email(to, subject, html)
    except Exception:  # best-effort; never block the request on email delivery
        log.warning("send_email failed to=%s subject=%s", to, subject, exc_info=True)


async def list_team(db: AsyncSession, current: CurrentUser) -> dict:
    org_id = _require_org(current)
    stmt = (
        select(OrgMember, User)
        .outerjoin(User, OrgMember.user_id == User.id)
        .where(OrgMember.organization_id == org_id)
    )
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "member_id": member.id,
            "name": user.full_name if user else None,
            "email": user.email if user else None,
            "area_key": member.area_key,
            "role": member.role,
            "status": member.status,
        }
        for member, user in rows
    ]

    invitations = (
        (
            await db.execute(
                select(Invitation)
                .where(Invitation.organization_id == org_id)
                .order_by(Invitation.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {
        "items": items,
        "invitations": [
            {
                "invitation_id": inv.id,
                "full_name": inv.full_name,
                "email": inv.email,
                "area_key": inv.area_key,
                "status": inv.status,
                "created_at": inv.created_at,
            }
            for inv in invitations
        ],
    }


async def create_invitation(db: AsyncSession, current: CurrentUser, payload: InvitationCreate) -> dict:
    org_id = _require_org(current)
    email = (payload.email or "").strip().lower()
    if not is_valid_email(email):
        raise APIError(422, "INVITE_EMAIL_INVALID", "El correo no es válido.", field="email")

    existing = await db.execute(
        select(Invitation).where(
            Invitation.organization_id == org_id,
            Invitation.email == email,
            Invitation.area_key == payload.area_key,
            Invitation.status == "sent",
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise APIError(409, "INVITE_ALREADY_EXISTS", "Ya existe una invitación activa para este correo y área.")

    raw = generate_opaque_token()
    invitation = Invitation(
        organization_id=org_id,
        full_name=payload.full_name,
        email=email,
        whatsapp=payload.whatsapp,
        phone=payload.phone,
        area_key=payload.area_key,
        token_hash=hash_token(raw),
        status="sent",
    )
    db.add(invitation)

    member_q = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.area_key == payload.area_key,
        )
    )
    if member_q.scalars().first() is None:
        db.add(
            OrgMember(
                organization_id=org_id,
                role="leader",
                area_key=payload.area_key,
                status="invited",
            )
        )
    await db.flush()

    link = f"{settings.web_app_url}/invite/{raw}"
    await _safe_send(
        email,
        "Invitación al diagnóstico",
        f'<p>Has sido invitado a participar en el diagnóstico.</p>'
        f'<p><a href="{link}">Aceptar invitación</a></p>',
    )
    return {"invitation_id": invitation.id, "status": "sent", "email": email, "area_key": invitation.area_key}


async def resend_invitation(db: AsyncSession, current: CurrentUser, invitation_id: uuid.UUID) -> dict:
    org_id = _require_org(current)
    invitation = await db.get(Invitation, invitation_id)
    if invitation is None or invitation.organization_id != org_id:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró la invitación.")

    raw = generate_opaque_token()
    invitation.token_hash = hash_token(raw)
    invitation.status = "sent"
    await db.flush()

    link = f"{settings.web_app_url}/invite/{raw}"
    await _safe_send(
        invitation.email,
        "Invitación al diagnóstico",
        f'<p>Recordatorio de invitación.</p><p><a href="{link}">Aceptar invitación</a></p>',
    )
    return {"invitation_id": invitation.id, "status": "sent"}


async def delete_invitation(db: AsyncSession, current: CurrentUser, invitation_id: uuid.UUID) -> None:
    org_id = _require_org(current)
    invitation = await db.get(Invitation, invitation_id)
    if invitation is None or invitation.organization_id != org_id:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró la invitación.")
    await db.delete(invitation)
    await db.flush()


async def delegate_question(
    db: AsyncSession,
    current: CurrentUser,
    assessment_id: uuid.UUID,
    question_id: uuid.UUID,
    payload: DelegateCreate,
) -> dict:
    org_id = _require_org(current)
    name = (payload.name or "").strip()
    email = (payload.email or "").strip().lower()
    if not name or not is_valid_email(email):
        raise APIError(422, "DELEGATE_EMAIL_INVALID", "Indique un nombre y un correo válidos.")

    assessment = await db.get(Assessment, assessment_id)
    if assessment is None or assessment.organization_id != org_id:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el diagnóstico.")

    raw = generate_opaque_token()
    delegation = Delegation(
        assessment_id=assessment_id,
        question_id=question_id,
        delegate_name=name,
        delegate_email=email,
        token_hash=hash_token(raw),
        status="sent",
        expires_at=now_utc() + timedelta(hours=settings.delegation_ttl_hours),
    )
    db.add(delegation)

    answer_q = await db.execute(
        select(Answer).where(
            Answer.assessment_id == assessment_id,
            Answer.question_id == question_id,
        )
    )
    answer = answer_q.scalar_one_or_none()
    if answer is None:
        db.add(Answer(assessment_id=assessment_id, question_id=question_id, state="delegated"))
    else:
        answer.state = "delegated"
    await db.flush()

    link = f"{settings.web_app_url}/delegate/{raw}"
    await _safe_send(
        email,
        "Solicitud de respuesta",
        f'<p>Hola {name}, te han pedido responder una pregunta del diagnóstico.</p>'
        f'<p><a href="{link}">Responder</a></p>',
    )
    return {"delegation_id": delegation.id, "question_id": question_id, "status": "sent", "sent_to": name}


async def get_delegation_info(db: AsyncSession, token: str, locale: str = "es") -> dict:
    """Public read for the delegation landing page (no auth).

    Returns the question text (localized, fallback en→es) plus the effective
    delegation status so the page can render answered/expired states.
    """
    delegation = (
        await db.execute(select(Delegation).where(Delegation.token_hash == hash_token(token)))
    ).scalar_one_or_none()
    if delegation is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "El enlace no es válido.")

    if delegation.status == "answered":
        effective = "answered"
    elif delegation.status == "expired" or now_utc() > as_utc(delegation.expires_at):
        effective = "expired"
    else:
        effective = "sent"

    question = await db.get(Question, delegation.question_id)
    question_text: Optional[str] = None
    question_code: Optional[str] = None
    if question is not None:
        question_code = question.code
        translations = (
            await db.execute(
                select(QuestionTranslation).where(
                    QuestionTranslation.question_id == question.id
                )
            )
        ).scalars().all()
        by_locale = {tr.locale: tr.text for tr in translations}
        question_text = by_locale.get(locale) or by_locale.get("en") or by_locale.get("es")

    return {
        "delegate_name": delegation.delegate_name,
        "question_code": question_code,
        "question_text": question_text,
        "status": effective,
        "expires_at": delegation.expires_at,
    }


async def answer_delegation(db: AsyncSession, token: str, value: int) -> dict:
    token_hash = hash_token(token)
    delegation = (
        await db.execute(select(Delegation).where(Delegation.token_hash == token_hash))
    ).scalar_one_or_none()
    if delegation is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "El enlace no es válido.")
    if delegation.status == "answered":
        raise APIError(409, "DELEGATION_ALREADY_ANSWERED", "Esta pregunta ya fue respondida.")
    if delegation.status == "expired" or now_utc() > as_utc(delegation.expires_at):
        raise APIError(410, "DELEGATION_TOKEN_EXPIRED", "El enlace ha expirado.")
    if value not in (1, 2, 3, 4, 5):
        raise APIError(422, "ANSWER_VALUE_INVALID", "El valor debe estar entre 1 y 5.")

    answer_q = await db.execute(
        select(Answer).where(
            Answer.assessment_id == delegation.assessment_id,
            Answer.question_id == delegation.question_id,
        )
    )
    answer = answer_q.scalar_one_or_none()
    if answer is None:
        db.add(
            Answer(
                assessment_id=delegation.assessment_id,
                question_id=delegation.question_id,
                value=value,
                state="answered",
            )
        )
    else:
        answer.value = value
        answer.state = "answered"

    delegation.status = "answered"
    delegation.answered_at = now_utc()

    question = await db.get(Question, delegation.question_id)
    await db.flush()
    return {"status": "answered", "question_code": question.code if question else None}
