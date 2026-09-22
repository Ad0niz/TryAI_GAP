"""Assessment read schemas (summary + current-assessment discovery)."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AssessmentProgress(BaseModel):
    maturity: int
    areas_overall: int


class AssessmentOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    plan: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: AssessmentProgress
    free_preview_reached: bool
