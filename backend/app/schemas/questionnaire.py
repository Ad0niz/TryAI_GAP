"""Questionnaire read schemas (maturity / area modules, localized)."""
import uuid
from typing import List, Optional

from pydantic import BaseModel


class QuestionOut(BaseModel):
    id: uuid.UUID
    code: str
    text: Optional[str] = None


class BlockOut(BaseModel):
    id: str
    title: Optional[str] = None
    dimension: Optional[str] = None
    questions: List[QuestionOut]


class QuestionnaireOut(BaseModel):
    module: str
    locale: str
    blocks: List[BlockOut]
