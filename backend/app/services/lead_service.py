"""Lead capture service: validate, create org/user/lead/assessment, issue tokens."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.emailrules import is_corporate_email, is_valid_email
from app.core.errors import APIError
from app.core.security import now_utc
from app.models import Assessment, Lead, Organization, User
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

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise APIError(409, "LEAD_ALREADY_EXISTS", "Ya existe una cuenta con este correo.", field="company_email")

    org = Organization(
        name=payload.company_name,
        sector=payload.industry,
        size=payload.company_size,
        country=payload.country,
        plan="free",
    )
    db.add(org)
    await db.flush()

    user = User(
        email=email,
        full_name=payload.full_name,
        role="client",
        locale=locale,
        organization_id=org.id,
    )
    db.add(user)
    await db.flush()

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


async def get_lead(db: AsyncSession, lead_id) -> Lead:
    lead = await db.get(Lead, lead_id)
    if lead is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró el lead.")
    return lead
