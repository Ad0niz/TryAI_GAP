"""Document upload / listing schemas."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class DocumentLink(BaseModel):
    area_key: Optional[str] = None
    question_id: Optional[uuid.UUID] = None


class DocumentCreateResponse(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: str
    size_bytes: int
    linked_to: DocumentLink


class DocumentListItem(BaseModel):
    id: uuid.UUID
    filename: str
    size_bytes: int
    mime_type: str
    area_key: Optional[str] = None
    question_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime] = None
    uploaded_by_name: Optional[str] = None
