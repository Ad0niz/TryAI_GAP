"""Answer upsert / batch / listing schemas."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class AnswerUpdate(BaseModel):
    value: Optional[int] = None
    state: str = "answered"


class AnswerOut(BaseModel):
    question_id: uuid.UUID
    value: Optional[int] = None
    state: str
    updated_at: Optional[datetime] = None


class BatchAnswerItem(BaseModel):
    question_id: uuid.UUID
    value: Optional[int] = None
    state: Optional[str] = None


class BatchAnswerRequest(BaseModel):
    answers: List[BatchAnswerItem] = []


class BatchFailure(BaseModel):
    question_id: uuid.UUID
    reason: str


class BatchAnswerResult(BaseModel):
    saved: int
    failed: List[BatchFailure] = []


class AnswerListItem(BaseModel):
    question_id: uuid.UUID
    code: str
    value: Optional[int] = None
    state: str


class AnswerListMeta(BaseModel):
    total: int


class AnswerListResponse(BaseModel):
    items: List[AnswerListItem]
    meta: AnswerListMeta
