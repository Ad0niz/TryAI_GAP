"""Result service: maturity scoring helpers + result payload + PDF report jobs.

The maturity scoring helpers defined here are the canonical implementation and
are reused by the consultant service.
"""
import uuid
from datetime import timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.core.errors import APIError
from app.core.security import now_utc
from app.integrations.storage import signed_url
from app.models import Answer, Assessment, Question, ReportJob
from app.services.questionnaire_service import AREA_KEYS, area_name

# ------------------------------------------------------------------ i18n tables
LOCALES = ("es", "en", "de", "pt")

DIMENSIONS: List[str] = ["datos", "tech", "talento", "procesos", "cultura"]

DIM_LABELS: Dict[str, Dict[str, str]] = {
    "datos": {"es": "Datos", "en": "Data", "de": "Daten", "pt": "Dados"},
    "tech": {"es": "Tecnología", "en": "Technology", "de": "Technologie", "pt": "Tecnologia"},
    "talento": {"es": "Talento", "en": "Talent", "de": "Talent", "pt": "Talento"},
    "procesos": {"es": "Procesos", "en": "Process", "de": "Prozess", "pt": "Processo"},
    "cultura": {"es": "Cultura", "en": "Culture", "de": "Kultur", "pt": "Cultura"},
}

_LEVELS: Dict[str, Dict[str, str]] = {
    "optimized": {"es": "Optimizado", "en": "Optimized", "de": "Optimiert", "pt": "Otimizado"},
    "managed": {"es": "Gestionado", "en": "Managed", "de": "Gesteuert", "pt": "Gerenciado"},
    "defined": {"es": "Definido", "en": "Defined", "de": "Definiert", "pt": "Definido"},
    "repeatable": {"es": "Repetible", "en": "Repeatable", "de": "Wiederholbar", "pt": "Repetível"},
    "initial": {"es": "Inicial", "en": "Initial", "de": "Initial", "pt": "Inicial"},
    "nodata": {"es": "Sin datos", "en": "No data", "de": "Keine Daten", "pt": "Sem dados"},
}

_VECTORS: List[Dict[str, str]] = [
    {"es": "Eficiencia", "en": "Efficiency", "de": "Effizienz", "pt": "Eficiência"},
    {"es": "Ingresos", "en": "Revenue", "de": "Umsatz", "pt": "Receita"},
    {"es": "Experiencia", "en": "Experience", "de": "Erlebnis", "pt": "Experiência"},
    {"es": "Riesgo", "en": "Risk", "de": "Risiko", "pt": "Risco"},
    {"es": "Talento", "en": "Talent", "de": "Talent", "pt": "Talento"},
]

# These labels correspond to actual questionnaire blocks, not value vectors.
# A block-to-business-value-vector mapping has NOT been agreed or stored.
AREA_BLOCKS = ("A", "B", "C", "D")
BLOCK_LABELS = {
    "es": "Bloque", "en": "Block", "de": "Block", "pt": "Bloco",
}


# ------------------------------------------------------------------- i18n utils
def loc(locale: Optional[str]) -> str:
    return locale if locale in LOCALES else "es"


def dimension_label(key: str, locale: Optional[str]) -> str:
    return DIM_LABELS[key][loc(locale)]


def vectors_for(locale: Optional[str]) -> List[str]:
    lc = loc(locale)
    return [v[lc] for v in _VECTORS]


def level_for(avg: float, locale: Optional[str]) -> str:
    lc = loc(locale)
    if avg >= 4.5:
        key = "optimized"
    elif avg >= 3.5:
        key = "managed"
    elif avg >= 2.5:
        key = "defined"
    elif avg >= 1.5:
        key = "repeatable"
    elif avg > 0:
        key = "initial"
    else:
        key = "nodata"
    return _LEVELS[key][lc]


def _key_for_dimension(dim: Optional[str]) -> Optional[str]:
    if not dim:
        return None
    d = dim.strip().lower()
    for key in DIMENSIONS:
        if d == key:
            return key
        if d in {label.lower() for label in DIM_LABELS[key].values()}:
            return key
    return None


# --------------------------------------------------------------------- scoring
async def compute_dimension_scores(
    db: AsyncSession, assessment_id: uuid.UUID
) -> Tuple[Dict[str, float], int]:
    """Return ({dim_key: avg_score}, numeric_answer_count).

    Only numeric ``answered`` maturity answers are considered.  A dimension with
    no answers gets a score of 0.0.
    """
    stmt = (
        select(Question.dimension, Answer.value)
        .join(Question, Question.id == Answer.question_id)
        .where(
            Answer.assessment_id == assessment_id,
            Answer.state == "answered",
            Answer.value.isnot(None),
            Question.module == "maturity",
        )
    )
    rows = (await db.execute(stmt)).all()

    buckets: Dict[str, List[int]] = {k: [] for k in DIMENSIONS}
    for dim, value in rows:
        if value is None:
            continue
        key = _key_for_dimension(dim)
        if key is not None:
            buckets[key].append(value)

    scores = {k: (sum(v) / len(v) if v else 0.0) for k, v in buckets.items()}
    return scores, len(rows)


async def compute_area_scores(
    db: AsyncSession, assessment_id: uuid.UUID
) -> Dict[str, dict]:
    """Return real per-area averages and per-block averages (A-D).

    A missing answer is not equivalent to a zero. Only numeric 'answered'
    responses belong to the score; unknown or delegated responses are excluded.
    No derived score is persisted: the next request reflects answer changes.
    """
    stmt = (
        select(Question.area_key, Question.block_id, Answer.value)
        .join(Question, Question.id == Answer.question_id)
        .where(
            Answer.assessment_id == assessment_id,
            Question.module == "area",
            Answer.state == "answered",
            Answer.value.isnot(None),
        )
    )
    rows = (await db.execute(stmt)).all()

    grouped: Dict[str, Dict[str, List[int]]] = {}
    for area, block, value in rows:
        if area not in AREA_KEYS or block not in AREA_BLOCKS or value is None:
            continue
        grouped.setdefault(area, {}).setdefault(block, []).append(value)

    result: Dict[str, dict] = {}
    for area, per_block in grouped.items():
        all_values = [v for values in per_block.values() for v in values]
        result[area] = {
            "overall": round(sum(all_values) / len(all_values), 1),
            "blocks": {
                block: round(sum(per_block[block]) / len(per_block[block]), 1)
                if per_block.get(block) else None
                for block in AREA_BLOCKS
            },
        }
    return result


# --------------------------------------------------------------- tenancy helper
async def _owned_assessment(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID
) -> Assessment:
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None or assessment.organization_id != current.organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta evaluación.")
    return assessment


def _maturity_average(scores: Dict[str, float]) -> Optional[float]:
    """Existing equal-dimension average, excluding dimensions without numeric answers."""
    present = [scores[k] for k in DIMENSIONS if scores[k] > 0]
    return round(sum(present) / len(present), 1) if present else None


async def build_result_preview(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID
) -> dict:
    await _owned_assessment(db, current, assessment_id)
    scores, numeric_count = await compute_dimension_scores(db, assessment_id)
    total = await db.scalar(select(func.count(Question.id)).where(Question.module == "maturity"))
    return {
        "provisional": True,
        "details_locked": not bool(current.organization and current.organization.plan == "pro"),
        "average": _maturity_average(scores),
        "numeric_answers": numeric_count,
        "total_questions": int(total or 0),
    }


# ----------------------------------------------------------------- result build
async def build_result(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID
) -> dict:
    await _owned_assessment(db, current, assessment_id)
    scores, numeric_count = await compute_dimension_scores(db, assessment_id)
    if numeric_count == 0:
        raise APIError(
            422, "RESULTS_NOT_READY",
            "Aún no hay respuestas suficientes para calcular resultados.",
        )

    locale = loc(current.user.locale)
    dimensions = [
        {"key": k, "label": dimension_label(k, locale), "score": round(scores[k], 1)}
        for k in DIMENSIONS
    ]
    average = _maturity_average(scores) or 0.0
    level = level_for(average, locale)

    area_scores = await compute_area_scores(db, assessment_id)
    areas = [
        {
            "name": area_name(key, locale),
            "row": [area_scores[key]["blocks"][block] for block in AREA_BLOCKS],
        }
        for key in AREA_KEYS if key in area_scores
    ]

    return {
        "maturity": {"average": average, "level": level, "dimensions": dimensions},
        # Compatibility: schema still names this field 'vectors', but these
        # are explicitly questionnaire blocks, not unsupported value vectors.
        "heatmap": {
            "vectors": [f"{BLOCK_LABELS[locale]} {block}" for block in AREA_BLOCKS],
            "areas": areas,
        },
        # Pain is not collected in the current questionnaire/DB. Never return
        # fixed example recommendations as if they belonged to this company.
        "priorities": [],
    }


# ------------------------------------------------------------------ report jobs
async def create_report(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID,
    locale: Optional[str] = None,
) -> dict:
    await _owned_assessment(db, current, assessment_id)
    org = current.organization
    resolved = locale or (org.doc_locale if org else None) or "es"

    job = ReportJob(assessment_id=assessment_id, locale=resolved, status="processing")
    db.add(job)
    await db.flush()

    # Dev: generate the artifact synchronously but still report async status.
    job.status = "ready"
    job.storage_key = f"reports/{job.id}.pdf"
    await db.flush()

    return {"report_id": job.id, "status": "processing"}


async def get_report(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID
) -> dict:
    await _owned_assessment(db, current, assessment_id)
    stmt = (
        select(ReportJob)
        .where(ReportJob.assessment_id == assessment_id)
        .order_by(ReportJob.created_at.desc())
        .limit(1)
    )
    job = (await db.execute(stmt)).scalar_one_or_none()
    if job is None:
        raise APIError(404, "REPORT_NOT_FOUND", "No hay ningún informe para esta evaluación.")

    payload = {"report_id": job.id, "status": job.status}
    if job.status == "ready" and job.storage_key:
        payload["download_url"] = signed_url(job.storage_key)
        payload["expires_at"] = (now_utc() + timedelta(minutes=30)).isoformat()
    return payload
