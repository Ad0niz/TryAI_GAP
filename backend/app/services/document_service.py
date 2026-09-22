"""Document upload / listing / soft-delete services."""
import os
import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.config import settings
from app.core.errors import APIError
from app.core.pagination import offset, page_meta
from app.core.security import now_utc
from app.integrations.storage import upload_bytes
from app.models import Assessment, Document, User

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg",
}
MAX_SIZE = 25 * 1024 * 1024


async def create_document(db: AsyncSession, current: CurrentUser, data: bytes,
                          filename: str, content_type: Optional[str],
                          assessment_id: uuid.UUID, question_id: Optional[uuid.UUID],
                          area_key: Optional[str]) -> Document:
    if content_type not in ALLOWED_TYPES:
        raise APIError(415, "UNSUPPORTED_MEDIA_TYPE", "Tipo de archivo no permitido.")
    if len(data) > MAX_SIZE:
        raise APIError(413, "FILE_TOO_LARGE", "El archivo supera el límite de 25 MB.")

    assessment = await db.get(Assessment, assessment_id)
    if not assessment:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Evaluación no encontrada.")
    if assessment.organization_id != current.organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta evaluación.")

    key = await upload_bytes(data, filename, content_type)
    doc = Document(
        organization_id=current.organization_id,
        assessment_id=assessment_id,
        question_id=question_id,
        area_key=area_key,
        filename=filename,
        mime_type=content_type,
        size_bytes=len(data),
        storage_key=key,
        uploaded_by=current.id,
    )
    db.add(doc)
    await db.flush()
    return doc


async def list_documents(db: AsyncSession, current: CurrentUser,
                         assessment_id: Optional[uuid.UUID], area_key: Optional[str],
                         page: int, page_size: int) -> dict:
    conds = [
        Document.organization_id == current.organization_id,
        Document.deleted_at.is_(None),
    ]
    if assessment_id:
        conds.append(Document.assessment_id == assessment_id)
    if area_key:
        conds.append(Document.area_key == area_key)

    total = int(await db.scalar(
        select(func.count(Document.id)).where(*conds)
    ) or 0)

    stmt = (
        select(Document, User.full_name)
        .outerjoin(User, Document.uploaded_by == User.id)
        .where(*conds)
        .order_by(Document.created_at.desc())
        .offset(offset(page, page_size))
        .limit(min(max(1, page_size), 100))
    )
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "id": d.id,
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "mime_type": d.mime_type,
            "area_key": d.area_key,
            "question_id": d.question_id,
            "created_at": d.created_at,
            "uploaded_by_name": uploader_name,
        }
        for d, uploader_name in rows
    ]
    return {"items": items, "meta": page_meta(page, page_size, total)}


async def delete_document(db: AsyncSession, current: CurrentUser,
                          document_id: uuid.UUID) -> None:
    doc = await _owned_document(db, current, document_id)
    doc.deleted_at = now_utc()
    await db.flush()


async def _owned_document(db: AsyncSession, current: CurrentUser,
                          document_id: uuid.UUID) -> Document:
    doc = await db.get(Document, document_id)
    if (not doc or doc.deleted_at is not None
            or doc.organization_id != current.organization_id):
        raise APIError(404, "RESOURCE_NOT_FOUND", "Documento no encontrado.")
    return doc


async def document_file_path(db: AsyncSession, current: CurrentUser,
                             document_id: uuid.UUID) -> tuple[str, str, str]:
    """Resolve an owned document to (local_path, filename, mime_type).

    Dev storage is the local filesystem; when Azure Blob is configured the
    route should use ``storage.signed_url`` instead of this helper.
    """
    doc = await _owned_document(db, current, document_id)
    path = os.path.join(settings.local_storage_dir, doc.storage_key)
    if not os.path.isfile(path):
        raise APIError(
            404, "DOCUMENT_FILE_MISSING",
            "El archivo ya no está disponible en el almacenamiento.",
        )
    return path, doc.filename, doc.mime_type
