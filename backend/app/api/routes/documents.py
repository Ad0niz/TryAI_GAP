"""Document upload / listing / delete endpoints."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.core.config import settings
from app.integrations.storage import signed_url
from app.schemas.common import Page
from app.schemas.document import (
    DocumentCreateResponse, DocumentLink, DocumentListItem,
)
from app.services.document_service import (
    create_document, delete_document, document_file_path, list_documents,
    _owned_document,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentCreateResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    assessment_id: uuid.UUID = Form(...),
    question_id: Optional[uuid.UUID] = Form(None),
    area_key: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    data = await file.read()
    doc = await create_document(
        db, current, data, file.filename, file.content_type,
        assessment_id, question_id, area_key,
    )
    return DocumentCreateResponse(
        id=doc.id,
        filename=doc.filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        linked_to=DocumentLink(area_key=doc.area_key, question_id=doc.question_id),
    )


@router.get("", response_model=Page[DocumentListItem])
async def get_documents(
    assessment_id: Optional[uuid.UUID] = Query(None),
    area_key: Optional[str] = Query(None),
    page: int = Query(1),
    page_size: int = Query(20),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    return await list_documents(db, current, assessment_id, area_key, page, page_size)


@router.delete("/{document_id}", status_code=204)
async def remove_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    await delete_document(db, current, document_id)
    return Response(status_code=204)


@router.get("/{document_id}/download")
async def download_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    """Download/preview a document.

    Azure Blob configured → 302 to a short-lived signed URL.
    Dev local storage → stream the file directly (404 DOCUMENT_FILE_MISSING
    when the object is gone).
    """
    if settings.azure_storage_connection_string:
        doc = await _owned_document(db, current, document_id)
        return RedirectResponse(signed_url(doc.storage_key))
    path, filename, mime_type = await document_file_path(db, current, document_id)
    return FileResponse(path, media_type=mime_type, filename=filename)
