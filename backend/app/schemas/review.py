"""Review / consultant-rating schemas."""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class ReviewCreate(BaseModel):
    assessment_id: uuid.UUID
    mode: str  # sync|async (validated in service to control the error code)


class ReviewCreateOut(BaseModel):
    review_id: uuid.UUID
    mode: str
    stage: int


class ChapterOut(BaseModel):
    chapter_key: str
    validated: bool
    note: Optional[str] = None
    validated_at: Optional[datetime] = None


class ReviewOut(BaseModel):
    review_id: uuid.UUID
    stage: int
    consultant: Optional[str] = None
    chapters: List[ChapterOut]


class RatingCreate(BaseModel):
    chapter_key: str
    knowledge: Optional[int] = None
    friendliness: Optional[int] = None
    methodology: Optional[int] = None
    comments: Optional[str] = None


class RatingOut(BaseModel):
    rating_id: uuid.UUID
    average: float
