"""Idempotent seed: maturity question bank (ES/EN) + area questionnaires
from the Excel kits + a demo distributor code.

Run:  python -m app.seed
(DE/PT fall back to EN via the questionnaire resolver.)
"""
import asyncio

from sqlalchemy import select

from app.db.session import AsyncSessionLocal, init_models
from app.models import DistributorCode, Question, QuestionTranslation
from app.seed_area_questions import seed_area_questions

# block_id -> (dimension_key, es_title, en_title)
BLOCKS = {
    "A": ("datos", "Bloque A — Datos", "Block A — Data"),
    "B": ("tech", "Bloque B — Tecnología", "Block B — Technology"),
    "C": ("talento", "Bloque C — Talento", "Block C — Talent"),
    "D": ("procesos", "Bloque D — Procesos", "Block D — Process"),
    "E": ("cultura", "Bloque E — Cultura", "Block E — Culture"),
}

# code -> (es, en)
MATURITY = {
    "A1": ("¿Mantienen un inventario actualizado de las fuentes de datos críticas, con responsables asignados?",
           "Do you keep an up-to-date inventory of business-critical data sources, with named owners?"),
    "A2": ("¿Miden y monitorean la calidad de los datos de forma continua, no solo en proyectos puntuales?",
           "Do you measure and monitor data quality continuously, not just on specific projects?"),
    "A3": ("¿Existen políticas formales de privacidad, retención y residencia de datos, aplicadas y auditadas?",
           "Are there formal data privacy, retention and residency policies that are enforced and audited?"),
    "A4": ("¿Hay un catálogo de datos donde un analista nuevo encuentra lo que necesita en minutos, no en semanas?",
           "Is there a data catalog where a new analyst finds what they need in minutes, not weeks?"),
    "B1": ("¿Tienen una plataforma estandarizada de analítica y modelado, o cada equipo arma la suya?",
           "Do you have a standardized analytics and modeling platform, or does each team set up its own?"),
    "B2": ("¿Cuentan con capacidades de integración (APIs, eventos) para conectar nuevos servicios sin un proyecto especial?",
           "Do you have integration capabilities (APIs, events) to connect new services without a special project?"),
    "B3": ("¿Practican MLOps o LLMOps en algún caso en producción (despliegue, monitoreo, reentrenamiento)?",
           "Do you practice MLOps or LLMOps in any production case (deployment, monitoring, retraining)?"),
    "B4": ("¿Las soluciones de IA actuales permiten reemplazar el modelo o proveedor sin rehacer todo?",
           "Are current AI solutions designed so the model or vendor can be replaced without redoing everything?"),
    "C1": ("¿Tienen perfiles internos de data science / ML / ingeniería de IA, o dependen solo de proveedores externos?",
           "Do you have in-house data science/ML/AI engineering profiles, or rely only on external vendors?"),
    "C2": ("¿Existe un plan formal de formación en IA por tipo de rol, y se está ejecutando?",
           "Is there a formal AI training plan by role type, and is it being executed?"),
    "C3": ("¿Los líderes de negocio entienden lo suficiente de IA para decidir sin delegar todo a TI?",
           "Do business leaders understand enough about AI to decide without delegating everything to IT?"),
    "C4": ("¿Logran retener el talento técnico clave (no se va en el primer año por una mejor oferta)?",
           "Can you retain key technical talent (they don't leave within the first year for a better offer)?"),
    "D1": ("¿Las iniciativas de IA pasan por un portafolio formal con priorización y revisión periódica?",
           "Do AI initiatives go through a formal portfolio with prioritization and periodic review?"),
    "D2": ("¿Hay quality gates documentados entre discovery, piloto, escala y operación?",
           "Are there documented quality gates between discovery, pilot, scaling and operation phases?"),
    "D3": ("¿Existe un comité de IA que revisa periódicamente portafolio, riesgos y modelos en producción?",
           "Is there an AI committee that periodically reviews portfolio, risks and models in production?"),
    "D4": ("¿Toda solución en producción tiene responsable identificable, runbooks y plan de retiro?",
           "Does every production solution have an identifiable owner, runbooks and a retirement plan?"),
    "E1": ("¿Las decisiones importantes incorporan datos como insumo natural, no como esfuerzo extraordinario?",
           "Do important decisions incorporate data as a natural input, not as an extraordinary effort?"),
    "E2": ("¿La organización tolera experimentos que pueden fallar sin penalizar a los responsables?",
           "Does the organization tolerate experiments that may fail without penalizing those responsible?"),
    "E3": ("¿Hay confianza institucional para conducir con honestidad la conversación sobre el impacto de la IA en el empleo?",
           "Is there institutional trust to honestly manage the conversation about AI's impact on jobs?"),
    "E4": ("¿Los líderes ejecutivos modelan personalmente el uso de herramientas de IA, no solo lo predican?",
           "Do executive leaders personally model the use of AI tools, not just preach it?"),
}


async def seed() -> None:
    await init_models()
    async with AsyncSessionLocal() as db:
        existing = (await db.execute(select(Question).where(Question.module == "maturity"))).scalars().all()
        if existing:
            print(f"Maturity questions already present ({len(existing)}). Skipping questions.")
        else:
            pos = 0
            for code, (es, en) in MATURITY.items():
                block = code[0]
                dim, es_title, en_title = BLOCKS[block]
                q = Question(module="maturity", area_key=None, block_id=block,
                             code=code, position=pos, dimension=dim)
                db.add(q)
                await db.flush()
                db.add(QuestionTranslation(question_id=q.id, locale="es", text=es, block_title=es_title))
                db.add(QuestionTranslation(question_id=q.id, locale="en", text=en, block_title=en_title))
                pos += 1
            print(f"Seeded {len(MATURITY)} maturity questions (es/en).")

        code = (await db.execute(select(DistributorCode).where(DistributorCode.code == "ALLX-PARTNER-2026"))).scalar_one_or_none()
        if not code:
            db.add(DistributorCode(code="ALLX-PARTNER-2026", discount_pct=10, active=True))
            print("Seeded demo distributor code ALLX-PARTNER-2026 (10%).")

        # Area questionnaires from the Excel kits (idempotent; tolerant of
        # missing kit files so production deploys without them still work).
        await seed_area_questions(db)

        await db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
