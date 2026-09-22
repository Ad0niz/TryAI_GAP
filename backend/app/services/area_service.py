"""Area state management + static use-case catalog."""
import uuid
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.models import Assessment, AreaState
from app.services.questionnaire_service import AREA_KEYS, area_name


async def _states_by_key(db: AsyncSession, assessment_id: uuid.UUID) -> Dict[str, AreaState]:
    stmt = select(AreaState).where(AreaState.assessment_id == assessment_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {s.area_key: s for s in rows}


async def list_areas(db: AsyncSession, assessment: Assessment, locale: str,
                     locked: bool) -> dict:
    states = await _states_by_key(db, assessment.id)
    items = []
    for key in AREA_KEYS:
        state = states.get(key)
        items.append({
            "area_key": key,
            "name": area_name(key, locale),
            "active": bool(state.active) if state else False,
            "progress": int(state.progress) if state else 0,
            "leader": None,
            "locked": locked,
        })
    return {"items": items}


async def _get_or_create_state(db: AsyncSession, assessment_id: uuid.UUID,
                               area_key: str) -> AreaState:
    stmt = select(AreaState).where(
        AreaState.assessment_id == assessment_id, AreaState.area_key == area_key
    )
    state = (await db.execute(stmt)).scalar_one_or_none()
    if state is None:
        state = AreaState(assessment_id=assessment_id, area_key=area_key,
                          active=False, progress=0)
        db.add(state)
    return state


async def activate_area(db: AsyncSession, assessment: Assessment, area_key: str) -> dict:
    if area_key not in AREA_KEYS:
        raise APIError(404, "AREA_NOT_FOUND", "Área no encontrada.")
    state = await _get_or_create_state(db, assessment.id, area_key)
    state.active = True
    await db.flush()
    return {"area_key": area_key, "active": True, "progress": int(state.progress)}


async def deactivate_area(db: AsyncSession, assessment: Assessment, area_key: str) -> None:
    if area_key not in AREA_KEYS:
        raise APIError(404, "AREA_NOT_FOUND", "Área no encontrada.")
    state = await _get_or_create_state(db, assessment.id, area_key)
    state.active = False
    await db.flush()


# ---- static use-case catalog (localized name; other fields language-neutral) ----
_CASE_CATALOG: Dict[str, List[dict]] = {
    "ventas": [
        {"name": {"es": "Puntuación de leads con IA", "en": "AI lead scoring"},
         "family": "Predictive", "kpi": "Conversion rate", "effort": "medium",
         "maturity": "emerging", "stage": "pilot"},
        {"name": {"es": "Asistente de propuestas", "en": "Proposal assistant"},
         "family": "GenAI", "kpi": "Cycle time", "effort": "low",
         "maturity": "established", "stage": "production"},
    ],
    "marketing": [
        {"name": {"es": "Generación de contenido", "en": "Content generation"},
         "family": "GenAI", "kpi": "Content output", "effort": "low",
         "maturity": "established", "stage": "production"},
        {"name": {"es": "Segmentación de audiencias", "en": "Audience segmentation"},
         "family": "ML", "kpi": "CAC", "effort": "medium",
         "maturity": "emerging", "stage": "pilot"},
    ],
    "servicio": [
        {"name": {"es": "Chatbot de soporte", "en": "Support chatbot"},
         "family": "GenAI", "kpi": "First response time", "effort": "medium",
         "maturity": "established", "stage": "production"},
        {"name": {"es": "Análisis de sentimiento", "en": "Sentiment analysis"},
         "family": "NLP", "kpi": "CSAT", "effort": "low",
         "maturity": "emerging", "stage": "pilot"},
    ],
    "finanzas": [
        {"name": {"es": "Detección de anomalías", "en": "Anomaly detection"},
         "family": "ML", "kpi": "Fraud losses", "effort": "high",
         "maturity": "emerging", "stage": "pilot"},
        {"name": {"es": "Previsión de flujo de caja", "en": "Cash flow forecasting"},
         "family": "Predictive", "kpi": "Forecast accuracy", "effort": "medium",
         "maturity": "established", "stage": "production"},
    ],
    "rrhh": [
        {"name": {"es": "Cribado de currículums", "en": "Resume screening"},
         "family": "NLP", "kpi": "Time to hire", "effort": "medium",
         "maturity": "emerging", "stage": "pilot"},
        {"name": {"es": "Análisis de rotación", "en": "Attrition analytics"},
         "family": "ML", "kpi": "Turnover rate", "effort": "medium",
         "maturity": "emerging", "stage": "pilot"},
    ],
    "operaciones": [
        {"name": {"es": "Mantenimiento predictivo", "en": "Predictive maintenance"},
         "family": "ML", "kpi": "Downtime", "effort": "high",
         "maturity": "emerging", "stage": "pilot"},
        {"name": {"es": "Optimización de inventario", "en": "Inventory optimization"},
         "family": "Predictive", "kpi": "Stockouts", "effort": "medium",
         "maturity": "established", "stage": "production"},
    ],
    "legal": [
        {"name": {"es": "Revisión de contratos", "en": "Contract review"},
         "family": "GenAI", "kpi": "Review time", "effort": "medium",
         "maturity": "emerging", "stage": "pilot"},
        {"name": {"es": "Búsqueda de cláusulas", "en": "Clause search"},
         "family": "NLP", "kpi": "Research time", "effort": "low",
         "maturity": "established", "stage": "production"},
    ],
}


def get_cases(area_key: str, locale: str) -> dict:
    if area_key not in AREA_KEYS:
        raise APIError(404, "AREA_NOT_FOUND", "Área no encontrada.")
    cases = []
    for c in _CASE_CATALOG.get(area_key, []):
        names = c["name"]
        name = names.get(locale) or names.get("en") or names.get("es")
        cases.append({
            "name": name,
            "family": c["family"],
            "kpi": c["kpi"],
            "effort": c["effort"],
            "maturity": c["maturity"],
            "stage": c["stage"],
        })
    return {"area_key": area_key, "cases": cases}
