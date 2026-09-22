"""Assessment progress + answer endpoints."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, get_db
from app.schemas.answer import (
    AnswerListResponse, AnswerOut, AnswerUpdate, BatchAnswerRequest, BatchAnswerResult,
)
from app.schemas.assessment import AssessmentOut
from app.services.answer_service import (
    assessment_summary, batch_upsert, list_answers, load_assessment, upsert_answer,
)
from app.services.assessment_service import get_current_assessment

router = APIRouter(prefix="/assessments", tags=["assessments"])


@router.get("/current", response_model=AssessmentOut)
async def get_current(
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    """Latest assessment of the caller's organization (discovery endpoint)."""
    return await get_current_assessment(db, current)


@router.get("/{assessment_id}", response_model=AssessmentOut)
async def get_assessment(
    assessment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    assessment = await load_assessment(db, assessment_id, current)
    return await assessment_summary(db, assessment)


@router.put("/{assessment_id}/answers/{question_id}", response_model=AnswerOut)
async def put_answer(
    assessment_id: uuid.UUID,
    question_id: uuid.UUID,
    body: AnswerUpdate,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    assessment = await load_assessment(db, assessment_id, current)
    answer = await upsert_answer(
        db, assessment, question_id, body.value, body.state, current
    )
    return AnswerOut(
        question_id=answer.question_id,
        value=answer.value,
        state=answer.state,
        updated_at=answer.updated_at,
    )


@router.post("/{assessment_id}/answers:batch", response_model=BatchAnswerResult)
async def batch_answers(
    assessment_id: uuid.UUID,
    body: BatchAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    assessment = await load_assessment(db, assessment_id, current)
    return await batch_upsert(db, assessment, body.answers, current)


@router.get("/{assessment_id}/answers", response_model=AnswerListResponse)
async def get_answers(
    assessment_id: uuid.UUID,
    module: Optional[str] = Query(None),
    area_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    assessment = await load_assessment(db, assessment_id, current)
    return await list_answers(db, assessment, module, area_key)
