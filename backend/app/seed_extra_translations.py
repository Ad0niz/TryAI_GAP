"""Add German and Portuguese questionnaire translations from the frontend qbanks.

This seed does not create Question records and does not modify ES/EN.
It only adds missing DE/PT QuestionTranslation rows.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Question, QuestionTranslation

log = logging.getLogger("app.seed.extra_translations")

REPO_ROOT = Path(__file__).resolve().parents[2]

QBANK_PATHS = {
    "de": REPO_ROOT / "web/src/i18n/locales/qbank.de.json",
    "pt": REPO_ROOT / "web/src/i18n/locales/qbank.pt.json",
}

QuestionKey = Tuple[str, Optional[str], str]
TranslationValue = Tuple[str, Optional[str]]


def _load_qbank(locale: str) -> Dict[QuestionKey, TranslationValue]:
    path = QBANK_PATHS[locale]

    if not path.is_file():
        raise FileNotFoundError(
            f"Question bank for locale '{locale}' not found: {path}"
        )

    data = json.loads(path.read_text(encoding="utf-8"))

    result: Dict[QuestionKey, TranslationValue] = {}

    # Maturity questionnaire
    for block in data["maturity"]["blocks"]:
        block_title = block.get("title")

        for question in block["questions"]:
            key = ("maturity", None, question["id"])
            result[key] = (question["text"], block_title)

    # Area questionnaires
    for area_key, blocks in data["areas"].items():
        for block in blocks:
            block_title = block.get("title")

            for question in block["questions"]:
                key = ("area", area_key, question["id"])
                result[key] = (question["text"], block_title)

    return result


async def seed_extra_translations(db: AsyncSession) -> None:
    """Idempotently add missing DE/PT translations."""

    questions = (
        await db.execute(
            select(Question).where(Question.module.in_(("maturity", "area")))
        )
    ).scalars().all()

    existing_rows = (
        await db.execute(
            select(
                QuestionTranslation.question_id,
                QuestionTranslation.locale,
            ).where(
                QuestionTranslation.locale.in_(("de", "pt"))
            )
        )
    ).all()

    existing = {
        (question_id, locale)
        for question_id, locale in existing_rows
    }

    added = 0
    missing = []

    for locale in ("de", "pt"):
        translations = _load_qbank(locale)

        for question in questions:
            key = (
                question.module,
                question.area_key,
                question.code,
            )

            translated = translations.get(key)

            if translated is None:
                missing.append((locale, key))
                continue

            if (question.id, locale) in existing:
                continue

            text, block_title = translated

            db.add(
                QuestionTranslation(
                    question_id=question.id,
                    locale=locale,
                    text=text,
                    block_title=block_title,
                )
            )

            existing.add((question.id, locale))
            added += 1

    if missing:
        for locale, key in missing:
            log.warning(
                "No %s translation found for question %s",
                locale,
                key,
            )

    print(
        f"Extra translations seed: {added} DE/PT translation(s) added."
    )