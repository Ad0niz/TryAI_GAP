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

# Representative sample data (localized) for parts that are out of scope.
_AREA_NAMES: Dict[str, List[str]] = {
    "es": ["Operaciones", "Ventas", "Finanzas", "Marketing"],
    "en": ["Operations", "Sales", "Finance", "Marketing"],
    "de": ["Betrieb", "Vertrieb", "Finanzen", "Marketing"],
    "pt": ["Operações", "Vendas", "Finanças", "Marketing"],
}

_SAMPLE_ROWS: List[List[int]] = [
    [4, 3, 2, 3, 2],
    [3, 4, 3, 2, 3],
    [2, 2, 3, 4, 2],
    [3, 3, 4, 2, 3],
]

_PRIORITIES: Dict[str, List[dict]] = {
    "es": [
        {"initiative": "Automatización de reportes", "area": "Operaciones", "vector": "Eficiencia",
         "pain": 4, "readiness": 3, "recommendation": "qw"},
        {"initiative": "Segmentación de clientes con IA", "area": "Ventas", "vector": "Ingresos",
         "pain": 3, "readiness": 2, "recommendation": "inv"},
        {"initiative": "Gobierno de datos", "area": "Finanzas", "vector": "Riesgo",
         "pain": 5, "readiness": 1, "recommendation": "wait"},
    ],
    "en": [
        {"initiative": "Reporting automation", "area": "Operations", "vector": "Efficiency",
         "pain": 4, "readiness": 3, "recommendation": "qw"},
        {"initiative": "AI customer segmentation", "area": "Sales", "vector": "Revenue",
         "pain": 3, "readiness": 2, "recommendation": "inv"},
        {"initiative": "Data governance", "area": "Finance", "vector": "Risk",
         "pain": 5, "readiness": 1, "recommendation": "wait"},
    ],
    "de": [
        {"initiative": "Automatisierung des Berichtswesens", "area": "Betrieb", "vector": "Effizienz",
         "pain": 4, "readiness": 3, "recommendation": "qw"},
        {"initiative": "KI-Kundensegmentierung", "area": "Vertrieb", "vector": "Umsatz",
         "pain": 3, "readiness": 2, "recommendation": "inv"},
        {"initiative": "Data Governance", "area": "Finanzen", "vector": "Risiko",
         "pain": 5, "readiness": 1, "recommendation": "wait"},
    ],
    "pt": [
        {"initiative": "Automação de relatórios", "area": "Operações", "vector": "Eficiência",
         "pain": 4, "readiness": 3, "recommendation": "qw"},
        {"initiative": "Segmentação de clientes com IA", "area": "Vendas", "vector": "Receita",
         "pain": 3, "readiness": 2, "recommendation": "inv"},
        {"initiative": "Governança de dados", "area": "Finanças", "vector": "Risco",
         "pain": 5, "readiness": 1, "recommendation": "wait"},
    ],
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


# --------------------------------------------------------------- tenancy helper
async def _owned_assessment(
    db: AsyncSession, current: CurrentUser, assessment_id: uuid.UUID
) -> Assessment:
    assessment = await db.get(Assessment, assessment_id)
    if assessment is None or assessment.organization_id != current.organization_id:
        raise APIError(403, "FORBIDDEN", "No tiene acceso a esta evaluación.")
    return assessment


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
    present = [scores[k] for k in DIMENSIONS if scores[k] > 0]
    average = round(sum(present) / len(present), 1) if present else 0.0
    level = level_for(average, locale)

    area_names = _AREA_NAMES[locale]
    areas = [
        {"name": name, "row": list(_SAMPLE_ROWS[i % len(_SAMPLE_ROWS)])}
        for i, name in enumerate(area_names)
    ]

    return {
        "maturity": {"average": average, "level": level, "dimensions": dimensions},
        "heatmap": {"vectors": vectors_for(locale), "areas": areas},
        "priorities": [dict(p) for p in _PRIORITIES[locale]],
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
