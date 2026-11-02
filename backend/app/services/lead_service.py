"""Lead capture service: validate, create org/user/lead/assessment, issue tokens."""
import uuid
import asyncio

from app.core.passwords import hash_password, verify_password
from app.services.credential_service import registration_identity, validate_password, claim

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.emailrules import is_corporate_email, is_valid_email
from app.core.errors import APIError
from app.core.security import now_utc
from app.models import Assessment, Lead, Organization, OrgMember, User
from app.schemas.lead import LeadCreate
from app.services.auth_service import issue_tokens


async def create_lead(db: AsyncSession, payload: LeadCreate) -> dict:
    email = (payload.company_email or "").strip().lower()
    locale = (payload.locale or "es")[:2]

    # Validation order matters (see spec).
    if not is_valid_email(email):
        raise APIError(400, "LEAD_EMAIL_INVALID", "El correo no es válido.", field="company_email")
    if not is_corporate_email(email):
        raise APIError(
            422,
            "LEAD_EMAIL_FREE_PROVIDER",
            "El correo debe ser corporativo; no se aceptan proveedores gratuitos.",
            field="company_email",
        )
    if not payload.terms_accepted:
        raise APIError(422, "TERMS_NOT_ACCEPTED", "Debe aceptar los términos y condiciones.", field="terms_accepted")

    password = payload.password.get_secret_value()
    validate_password(password, payload.password_confirmation.get_secret_value())
    raw = payload.verification_token.get_secret_value()
    user, verification = await registration_identity(db, raw, lock=True)
    if user.email.strip().lower() != email:
        raise APIError(400, "AUTH_LINK_INVALID", "El enlace no corresponde al correo verificado.")
    if user.password_hash:
        if not await asyncio.to_thread(verify_password, password, user.password_hash):
            raise APIError(401, "AUTH_LOGIN_FAILED", "Utiliza tu contraseña actual o restablécela.")
        encoded = user.password_hash
    else:
        encoded = await asyncio.to_thread(hash_password, password)
    await claim(db, verification, raw, 'register')

    org = Organization(
        name=payload.company_name,
        sector=payload.industry,
        size=payload.company_size,
        country=payload.country,
        plan="free",
    )
    db.add(org)
    await db.flush()

    user.full_name = payload.full_name
    user.locale = locale
    user.organization_id = org.id
    user.status = "active"
    user.password_hash = encoded
    await db.flush()

    # The creator is an organizational admin, independently of global role.
    db.add(OrgMember(organization_id=org.id, user_id=user.id, role="admin", status="active"))

    lead = Lead(
        full_name=payload.full_name,
        job_title=payload.job_title,
        company_email=email,
        company_name=payload.company_name,
        company_size=payload.company_size,
        industry=payload.industry,
        country=payload.country,
        terms_accepted=payload.terms_accepted,
        locale=locale,
        user_id=user.id,
    )
    db.add(lead)

    assessment = Assessment(
        organization_id=org.id,
        plan="free",
        status="in_progress",
        started_at=now_utc(),
    )
    db.add(assessment)
    await db.flush()

    tokens = await issue_tokens(db, user)
    return {
        "lead_id": lead.id,
        "organization_id": org.id,
        "assessment_id": assessment.id,
        "plan": "free",
        **tokens,
    }


async def get_lead(db: AsyncSession, current: CurrentUser, lead_id: uuid.UUID) -> Lead:
    """Read a lead owned by the caller or by a user in the same organization.

    A missing owner never grants access, and users without an organization do
    not share a tenant. Foreign and nonexistent IDs have the same response.
    """
    access = Lead.user_id == current.id
    if current.organization_id is not None:
        access = or_(access, User.organization_id == current.organization_id)
    lead = (await db.execute(
        select(Lead).outerjoin(User, Lead.user_id == User.id).where(
            Lead.id == lead_id, access,
        )
    )).scalar_one_or_none()
    if lead is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el lead.")
    return lead
