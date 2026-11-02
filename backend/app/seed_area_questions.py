"""Seed area questionnaires (module='area') from the Excel kits.

Each kit has a `Cuestionario` (ES) / ` Questionnaire` (EN) sheet with
16 questions in 4 blocks:

    BLOQUE A — <title>      # block header row
    A1 | <question text>    # code in col 1, text in col 2
    ...

Paths are resolved relative to the repo root (this file is
backend/app/seed_area_questions.py, so parents[2] is the repo root).
If a kit file is missing at runtime (e.g. production deploys that do not
ship the Excel files) the seed logs a warning and continues.

Marketing and Operations English kits reuse the existing qbank.en texts.
Existing exact Spanish-as-English fallback rows are repaired in place; custom
translations and every question/answer identity are preserved.
"""
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.question_vectors import AREA_VECTOR_TYPES
from app.models import Question, QuestionTranslation

log = logging.getLogger("app.seed.areas")

REPO_ROOT = Path(__file__).resolve().parents[2]

# area_key -> (spanish kit, english kit or None)
AREA_KITS: Dict[str, Tuple[str, Optional[str]]] = {
    "ventas":      ("Spanish/Kit_Ventas_B2B.xlsx",               "English/EN Sales Kit B2B.xlsx"),
    "marketing":   ("Spanish/Kit_Marketing_DemandGen_B2B.xlsx",  "English/EN Marketing and Demand Generation.xlsx"),
    "servicio":    ("Spanish/Kit_Servicio_Cliente_B2B.xlsx",     "English/EN Customer Service Kit.xlsx"),
    "finanzas":    ("Spanish/Kit_Finanzas_Administracion.xlsx",  "English/EN Finance and Administration.xlsx"),
    "rrhh":        ("Spanish/Kit_RRHH_Talento.xlsx",             "English/EN HR and Talent Kit.xlsx"),
    "operaciones": ("Spanish/Kit_Operaciones_Planta_PYME.xlsx",  "English/EN Plant operations and production.xlsx"),
    "legal":       ("Spanish/Kit_Legal_Compliance.xlsx",         "English/EN Legal and compliance kit.xlsx"),
}

_BLOCK_RE = re.compile(r"^(?:BLOQUE|BLOCK)\s+([A-D])\b", re.IGNORECASE)
_CODE_RE = re.compile(r"^([A-D])(\d)$")


def _cell(value) -> str:
    return str(value).strip() if value is not None else ""


def parse_kit(path: Path) -> Optional[Tuple[Dict[str, str], List[Tuple[str, str]]]]:
    """Parse one kit. Returns ({block_id: block_title}, [(code, text), ...])
    ordered by appearance, or None if the file is missing/unreadable."""
    if not path.is_file():
        log.warning("Area kit not found, skipping: %s", path)
        return None
    try:
        from openpyxl import load_workbook
        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            sheet = next(
                (s for s in wb.sheetnames
                 if s.strip().lower() in ("cuestionario", "questionnaire")),
                None,
            )
            if sheet is None:
                log.warning("No Cuestionario/Questionnaire sheet in %s", path)
                return None
            blocks: Dict[str, str] = {}
            questions: List[Tuple[str, str]] = []
            for row in wb[sheet].iter_rows(values_only=True):
                if not row:
                    continue
                first = _cell(row[0])
                if not first:
                    continue
                m = _BLOCK_RE.match(first)
                if m:
                    blocks[m.group(1).upper()] = first
                    continue
                if _CODE_RE.match(first):
                    text = _cell(row[1]) if len(row) > 1 else ""
                    if text:
                        questions.append((first.upper(), text))
            return blocks, questions
        finally:
            wb.close()
    except Exception:
        log.exception("Failed to parse area kit %s", path)
        return None


async def _repair_known_english_fallback(db: AsyncSession, area_key: str,
                                         es_rel: str, en_rel: Optional[str]) -> int:
    """Repair only the known, unchanged ES-as-EN fallback of these two areas.

    Both stored ES and EN must still equal the Spanish source (text and title).
    This protects customized copy. An absent EN row is added only for a question
    whose stored Spanish text matches its canonical source. Caller owns commit.
    """
    if area_key not in ("marketing", "operaciones") or en_rel is None:
        return 0
    es = parse_kit(REPO_ROOT / es_rel)
    en = parse_kit(REPO_ROOT / en_rel)
    if es is None or en is None:
        return 0
    es_blocks, es_items = es
    en_blocks, en_items = en
    es_texts, en_texts = dict(es_items), dict(en_items)
    questions = (await db.scalars(select(Question).where(
        Question.module == "area", Question.area_key == area_key,
    ))).all()
    translations = (await db.scalars(select(QuestionTranslation).where(
        QuestionTranslation.question_id.in_([q.id for q in questions]),
        QuestionTranslation.locale.in_(("es", "en")),
    ))).all()
    rows = {}
    for row in translations:
        key = (row.question_id, row.locale)
        if key in rows:
            raise ValueError("Duplicate translation; review before repairing English")
        rows[key] = row
    repaired = 0
    for question in questions:
        source = es_texts.get(question.code)
        replacement = en_texts.get(question.code)
        title = es_blocks.get(question.block_id)
        english_title = en_blocks.get(question.block_id)
        if not source or not replacement or not english_title:
            continue
        spanish = rows.get((question.id, "es"))
        english = rows.get((question.id, "en"))
        if spanish is None or (spanish.text, spanish.block_title) != (source, title):
            continue
        if english is None:
            db.add(QuestionTranslation(question_id=question.id, locale="en",
                                       text=replacement, block_title=english_title))
            repaired += 1
        elif (english.text, english.block_title) == (source, title) and replacement != source:
            english.text = replacement
            english.block_title = english_title
            repaired += 1
    await db.flush()
    return repaired


async def seed_area_questions(db: AsyncSession) -> None:
    """Idempotently load area questions + ES/EN translations into the DB."""
    existing = (
        await db.execute(
            select(Question.area_key).where(Question.module == "area").distinct()
        )
    ).scalars().all()
    done = set(existing)

    seeded_areas = 0
    for area_key, (es_rel, en_rel) in AREA_KITS.items():
        if area_key in done:
            repaired = await _repair_known_english_fallback(db, area_key, es_rel, en_rel)
            if repaired:
                log.info("Repaired %d known English fallback rows for %s.", repaired, area_key)
            log.info("Area questions already present for %s. Skipping questions.", area_key)
            continue

        es = parse_kit(REPO_ROOT / es_rel)
        if es is None:
            continue  # warning already logged; Spanish kit is the source of truth
        es_blocks, es_questions = es

        en_blocks: Dict[str, str] = {}
        en_questions: List[Tuple[str, str]] = []
        if en_rel is not None:
            en = parse_kit(REPO_ROOT / en_rel)
            if en is not None:
                en_blocks, en_questions = en
        else:
            log.warning(
                "No English kit for area '%s' — EN translations fall back to "
                "the Spanish text (known gap: missing EN marketing kit).",
                area_key,
            )
        en_by_code = dict(en_questions)

        for pos, (code, es_text) in enumerate(es_questions, start=1):
            block_id = code[0]
            q = Question(
                module="area",
                area_key=area_key,
                block_id=block_id,
                code=code,
                position=pos,
                dimension=None,
                vector_type=AREA_VECTOR_TYPES[area_key],
            )
            db.add(q)
            await db.flush()
            db.add(QuestionTranslation(
                question_id=q.id, locale="es",
                text=es_text, block_title=es_blocks.get(block_id),
            ))
            en_text = en_by_code.get(code, es_text)  # Fallback only if a kit is unavailable.
            en_title = en_blocks.get(block_id) or es_blocks.get(block_id)
            db.add(QuestionTranslation(
                question_id=q.id, locale="en",
                text=en_text, block_title=en_title,
            ))
        seeded_areas += 1
        log.info(
            "Seeded area '%s': %d questions in %d blocks (es%s).",
            area_key, len(es_questions), len(es_blocks),
            "+en" if en_questions else ", en=es fallback",
        )

    if seeded_areas:
        print(f"Seeded {seeded_areas} area questionnaire(s).")
    else:
        print("No new area questionnaires to seed.")
