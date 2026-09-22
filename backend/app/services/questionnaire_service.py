"""Questionnaire service: localized question fetch + shared area constants."""
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.models import Question, QuestionTranslation

# The 7 area keys used across the assessment domain.
AREA_KEYS: List[str] = [
    "ventas", "marketing", "servicio", "finanzas", "rrhh", "operaciones", "legal",
]

# Localized display names per area (es/en/de/pt).
AREA_NAMES: Dict[str, Dict[str, str]] = {
    "ventas": {"es": "Ventas B2B", "en": "Sales B2B", "de": "Vertrieb B2B", "pt": "Vendas B2B"},
    "marketing": {"es": "Marketing", "en": "Marketing", "de": "Marketing", "pt": "Marketing"},
    "servicio": {"es": "Atención al Cliente", "en": "Customer Service", "de": "Kundenservice", "pt": "Atendimento ao Cliente"},
    "finanzas": {"es": "Finanzas", "en": "Finance", "de": "Finanzen", "pt": "Finanças"},
    "rrhh": {"es": "RR.HH.", "en": "HR", "de": "Personal", "pt": "RH"},
    "operaciones": {"es": "Operaciones", "en": "Operations", "de": "Betrieb", "pt": "Operações"},
    "legal": {"es": "Legal", "en": "Legal", "de": "Recht", "pt": "Jurídico"},
}


def area_name(area_key: str, locale: str) -> str:
    """Localized area display name with fallback to es, then the raw key."""
    names = AREA_NAMES.get(area_key, {})
    return names.get(locale) or names.get("es") or area_key


def resolve_localized(trans: Dict[str, Tuple[Optional[str], Optional[str]]],
                      locale: str) -> Tuple[Optional[str], Optional[str]]:
    """Resolve (text, block_title) with fallback order [locale, en, es, any]."""
    for loc in (locale, "en", "es"):
        if loc in trans:
            return trans[loc]
    if trans:
        return next(iter(trans.values()))
    return (None, None)


async def get_questionnaire(db: AsyncSession, module: str, area_key: Optional[str],
                            locale: str) -> dict:
    if module not in ("maturity", "area"):
        raise APIError(400, "VALIDATION_ERROR", "El módulo debe ser 'maturity' o 'area'.")
    if module == "area" and not area_key:
        raise APIError(400, "AREA_KEY_REQUIRED", "Debe indicar el área para este módulo.")

    stmt = (
        select(Question, QuestionTranslation)
        .outerjoin(QuestionTranslation, QuestionTranslation.question_id == Question.id)
        .where(Question.module == module)
    )
    if module == "area":
        stmt = stmt.where(Question.area_key == area_key)
    stmt = stmt.order_by(Question.block_id, Question.position)

    rows = (await db.execute(stmt)).all()

    q_objs: Dict = {}
    q_order: List = []
    q_trans: Dict = {}
    for q, tr in rows:
        if q.id not in q_objs:
            q_objs[q.id] = q
            q_order.append(q.id)
            q_trans[q.id] = {}
        if tr is not None:
            q_trans[q.id][tr.locale] = (tr.text, tr.block_title)

    blocks: Dict = {}
    block_order: List = []
    for qid in q_order:
        q = q_objs[qid]
        text, block_title = resolve_localized(q_trans[qid], locale)
        if q.block_id not in blocks:
            blocks[q.block_id] = {
                "id": q.block_id,
                "title": block_title,
                "dimension": q.dimension,
                "questions": [],
            }
            block_order.append(q.block_id)
        blocks[q.block_id]["questions"].append(
            {"id": q.id, "code": q.code, "text": text}
        )

    return {
        "module": module,
        "locale": locale,
        "blocks": [blocks[b] for b in block_order],
    }
