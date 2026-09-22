"""Organization service: fetch, partial update and logo upload with tenancy checks."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.integrations.storage import signed_url, upload_bytes
from app.models import Organization
from app.schemas.organization import OrgUpdate

_ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/svg+xml"}
_MAX_LOGO_BYTES = 2 * 1024 * 1024


def _ensure_tenant(current: CurrentUser, organization_id: uuid.UUID) -> None:
    if current.organization_id != organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta organización.")


def serialize_org(org: Organization) -> dict:
    return {
        "id": org.id,
        "name": org.name,
        "sector": org.sector,
        "size": org.size,
        "country": org.country,
        "currency": org.currency,
        "plan": org.plan,
        "settings": {
            "doc_locale": org.doc_locale,
            "theme": org.theme,
            "logo_url": org.logo_url,
        },
    }


async def get_organization(
    db: AsyncSession, current: CurrentUser, organization_id: uuid.UUID
) -> Organization:
    _ensure_tenant(current, organization_id)
    org = await db.get(Organization, organization_id)
    if org is None:
        raise APIError(404, "RESOURCE_NOT_FOUND", "No se encontró la organización.")
    return org


async def update_organization(
    db: AsyncSession, current: CurrentUser, organization_id: uuid.UUID, payload: OrgUpdate
) -> Organization:
    org = await get_organization(db, current, organization_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(org, field, value)
    await db.flush()
    return org


async def set_logo(
    db: AsyncSession,
    current: CurrentUser,
    organization_id: uuid.UUID,
    data: bytes,
    filename: str,
    content_type: str,
) -> Organization:
    org = await get_organization(db, current, organization_id)
    if content_type not in _ALLOWED_LOGO_TYPES:
        raise APIError(415, "UNSUPPORTED_MEDIA_TYPE", "Formato de imagen no soportado.")
    if len(data) > _MAX_LOGO_BYTES:
        raise APIError(413, "FILE_TOO_LARGE", "El archivo supera el tamaño máximo permitido (2 MB).")

    key = await upload_bytes(data, filename or "logo", content_type)
    org.logo_url = signed_url(key)
    await db.flush()
    return org
