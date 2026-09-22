"""Result / report schemas (maturity scoring, heatmap, priorities, PDF report)."""
import uuid
from typing import List, Optional

from pydantic import BaseModel


class DimensionScore(BaseModel):
    key: str
    label: str
    score: float


class MaturityBlock(BaseModel):
    average: float
    level: str
    dimensions: List[DimensionScore]


class HeatmapArea(BaseModel):
    name: str
    row: List[int]


class HeatmapBlock(BaseModel):
    vectors: List[str]
    areas: List[HeatmapArea]


class PriorityItem(BaseModel):
    initiative: str
    area: str
    vector: str
    pain: int
    readiness: int
    recommendation: str


class ResultOut(BaseModel):
    maturity: MaturityBlock
    heatmap: HeatmapBlock
    priorities: List[PriorityItem]


class ReportRequest(BaseModel):
    locale: Optional[str] = None


class ReportCreateOut(BaseModel):
    report_id: uuid.UUID
    status: str


class ReportOut(BaseModel):
    report_id: uuid.UUID
    status: str
    download_url: Optional[str] = None
    expires_at: Optional[str] = None
