"""Aplicar APP-14 parcial y seguro al checkout de TryAI Gap.

Ejecutar desde la raiz del repositorio en la rama desarrollo-Andrew:
    python aplicar_app14.py

No edita la BD ni crea commits. Se niega a sobrescribir contenidos
que no coincidan con la version inspeccionada.
"""
from pathlib import Path
import subprocess

ROOT = Path.cwd()


def replacement(path, old, new):
    p = ROOT / path
    txt = p.read_text(encoding='utf-8')
    if txt.count(old) != 1:
        raise RuntimeError(f'No encuentro exactamente una coincidencia para el cambio en {path}: {old[:80]!r}')
    return txt.replace(old, new, 1)


def main():
    if not (ROOT / 'backend/app/services/result_service.py').exists():
        raise RuntimeError('Ejecuta este script desde la RAIZ del repositorio')
    branch = subprocess.check_output(['git', 'branch', '--show-current'], text=True).strip()
    if branch != 'desarrollo-Andrew':
        raise RuntimeError(f'Rama actual: {branch!r}. Cambia a desarrollo-Andrew antes de aplicar')
    if subprocess.check_output(['git', 'status', '--porcelain'], text=True).strip():
        # The user can save this script in repo root. Ignore this file if untracked there.
        status = subprocess.check_output(['git', 'status', '--porcelain'], text=True).splitlines()
        relevant = [line for line in status if 'aplicar_app14.py' not in line]
        if relevant:
            raise RuntimeError('Hay cambios previos sin guardar. Limpia el working tree primero')

    service = 'backend/app/services/result_service.py'
    src = (ROOT / service).read_text(encoding='utf-8')
    if src.count('from app.models import Answer, Assessment, Question, ReportJob') != 1:
        raise RuntimeError('El servicio result_service.py cambió de versión')
    src = src.replace('from app.models import Answer, Assessment, Question, ReportJob',
                      'from app.models import Answer, Assessment, Question, ReportJob\n'
                      'from app.services.questionnaire_service import AREA_KEYS, area_name', 1)
    start = src.index('# Representative sample data (localized) for parts that are out of scope.')
    end = src.index('# ------------------------------------------------------------------- i18n utils', start)
    src = (src[:start] + '''# These labels correspond to actual questionnaire blocks, not value vectors.
# A block-to-business-value-vector mapping has NOT been agreed or stored.
AREA_BLOCKS = ("A", "B", "C", "D")
BLOCK_LABELS = {
    "es": "Bloque", "en": "Block", "de": "Block", "pt": "Bloco",
}


''' + src[end:])
    anchor = '# --------------------------------------------------------------- tenancy helper'
    if src.count(anchor) != 1:
        raise RuntimeError('No se encontró el punto de inserción del cálculo por área')
    function = '''async def compute_area_scores(
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


'''
    src = src.replace(anchor, function + anchor, 1)
    old_builder = '''    area_names = _AREA_NAMES[locale]
    areas = [
        {"name": name, "row": list(_SAMPLE_ROWS[i % len(_SAMPLE_ROWS)])}
        for i, name in enumerate(area_names)
    ]

    return {
        "maturity": {"average": average, "level": level, "dimensions": dimensions},
        "heatmap": {"vectors": vectors_for(locale), "areas": areas},
        "priorities": [dict(p) for p in _PRIORITIES[locale]],
    }
'''
    new_builder = '''    area_scores = await compute_area_scores(db, assessment_id)
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
'''
    if src.count(old_builder) != 1:
        raise RuntimeError('El bloque de resultados no coincide: no se modifica nada')
    src = src.replace(old_builder, new_builder, 1)

    schema_path = 'backend/app/schemas/result.py'
    schema = replacement(schema_path, '    row: List[int]', '    row: List[Optional[float]]')
    types_path = 'web/src/api/types.ts'
    types = replacement(types_path, '  row: number[];', '  row: (number | null)[];')

    page_path = 'web/src/pages/Results.tsx'
    page = (ROOT / page_path).read_text(encoding='utf-8')
    old_heat = '''function heatClass(v: number): string {
  if (v >= 4) return 'bg-primary text-primary-foreground';
  if (v === 3) return 'bg-primary/60 text-primary-foreground';
  if (v === 2) return 'bg-primary/25';
  return 'bg-muted';
}'''
    new_heat = '''function heatClass(v: number | null): string {
  if (v === null) return 'bg-muted text-muted-foreground';
  if (v >= 4) return 'bg-primary text-primary-foreground';
  if (v >= 3) return 'bg-primary/60 text-primary-foreground';
  if (v >= 2) return 'bg-primary/25';
  return 'bg-muted';
}'''
    if page.count(old_heat) != 1:
        raise RuntimeError('Cambió heatClass')
    page = page.replace(old_heat, new_heat, 1)
    page = page.replace(
        "<CardDescription>{t('resultsUI.heatTitle')}</CardDescription>",
        "<CardDescription>{i18n.language.startsWith('es') ? 'Promedios reales de los bloques A–D por área (aún no son vectores de valor).' : i18n.language.startsWith('pt') ? 'Médias reais dos blocos A–D por área (ainda não são vetores de valor).' : i18n.language.startsWith('de') ? 'Tatsächliche Durchschnittswerte der Blöcke A–D pro Bereich (noch keine Wertvektoren).' : 'Actual A–D questionnaire block scores by area (not value vectors yet).'}</CardDescription>", 1,
    )
    if page.count('                        {v}') != 1:
        raise RuntimeError('Cambió el renderizado del heatmap')
    page = page.replace('                        {v}', '                        {v === null ? "—" : v.toFixed(1)}', 1)
    # Make it explicit that priorization awaits an actual pain measurement.
    old_priority = '''              {results.priorities.map((p) => ('''
    new_priority = '''              {results.priorities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {i18n.language.startsWith('es')
                      ? 'Priorización pendiente: el cuestionario aún no recoge Pain.'
                      : i18n.language.startsWith('pt')
                        ? 'Priorização pendente: o questionário ainda não coleta Pain.'
                        : i18n.language.startsWith('de')
                          ? 'Priorisierung ausstehend: Der Fragebogen erfasst Pain noch nicht.'
                          : 'Prioritization pending: the questionnaire does not yet collect Pain.'}
                  </TableCell>
                </TableRow>
              )}
              {results.priorities.map((p) => ('''
    if page.count(old_priority) != 1:
        raise RuntimeError('Cambió tabla de prioridades')
    page = page.replace(old_priority, new_priority, 1)

    pdf_path = 'web/src/pdf/ReportDocument.tsx'
    pdf = replacement(pdf_path, '                {v}\n', '                {v === null ? "—" : v.toFixed(1)}\n')
    pdf = pdf.replace(
        '<Text style={styles.h2}>{labels.prioTitle}</Text>',
        '<Text style={styles.h2}>{labels.prioTitle}</Text>\n        {priorities.length === 0 && (\n          <Text style={styles.sub}>No initiatives ranked: Pain is not yet collected.</Text>\n        )}', 1,
    )
    # Invalidate cached results after successful persistence, not merely local edits.
    hook_path = 'web/src/hooks/useQuestionnaireAnswers.ts'
    hook = (ROOT / hook_path).read_text(encoding='utf-8')
    hook = hook.replace("import { useQuery } from '@tanstack/react-query';", "import { useQuery, useQueryClient } from '@tanstack/react-query';", 1)
    hook = hook.replace('''  const query = useQuery({''', '''  const queryClient = useQueryClient();
  const query = useQuery({''', 1)
    hook = hook.replace('''      await saveAnswersBatch(assessmentId, items);
      setSaveStatus('saved');''', '''      const result = await saveAnswersBatch(assessmentId, items);
      if (result.failed.length > 0) {
        for (const failed of result.failed) dirtyRef.current.add(failed.question_id);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
      if (result.saved > 0) {
        await queryClient.invalidateQueries({ queryKey: ['results', assessmentId] });
        await queryClient.invalidateQueries({ queryKey: ['areas', assessmentId] });
      }''', 1)
    if 'const result = await saveAnswersBatch' not in hook:
        raise RuntimeError('Cambió guardado por lote')
    hook = hook.replace('''  }, [assessmentId]);''', '''  }, [assessmentId, queryClient]);''', 1)

    tests_path = ROOT / 'backend/tests/test_result_area_scores.py'
    if tests_path.exists():
        raise RuntimeError('Ya existe test_result_area_scores.py: no se sobrescribe')
    tests = '''"""APP-14 regression tests. Run from backend: python -m unittest discover -s tests -v."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from app.core.errors import APIError
from app.services.result_service import build_result, compute_area_scores


class RowResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class AreaResultTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_averages_exclude_unanswered_by_query_and_keep_missing_as_none(self):
        assessment_id = uuid4()
        db = SimpleNamespace(execute=AsyncMock(return_value=RowResult([
            ("ventas", "A", 5), ("ventas", "A", 1),
            ("ventas", "B", 4), ("operaciones", "D", 2),
            ("unknown", "A", 5), ("ventas", "Z", 5),
        ])))
        scores = await compute_area_scores(db, assessment_id)
        self.assertEqual(scores["ventas"]["overall"], 3.3)
        self.assertEqual(scores["ventas"]["blocks"],
                         {"A": 3.0, "B": 4.0, "C": None, "D": None})
        self.assertEqual(scores["operaciones"]["blocks"]["D"], 2.0)
        self.assertNotIn("unknown", scores)
        self.assertEqual(len(scores), 2)

    async def test_empty_answers_show_no_fake_areas(self):
        db = SimpleNamespace(execute=AsyncMock(return_value=RowResult([])))
        self.assertEqual(await compute_area_scores(db, uuid4()), {})

    async def test_results_use_own_assessment_and_have_no_sample_priorities(self):
        org_id = uuid4()
        assessment_id = uuid4()
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(organization_id=org_id)))
        current = SimpleNamespace(organization_id=org_id, user=SimpleNamespace(locale="es"))
        area_scores = {"ventas": {"overall": 4.0, "blocks": {"A": 3.0, "B": 5.0, "C": None, "D": None}}}
        with patch('app.services.result_service.compute_dimension_scores', new=AsyncMock(return_value=({"datos": 3.0, "tech": 0.0, "talento": 0.0, "procesos": 0.0, "cultura": 0.0}, 1))), patch('app.services.result_service.compute_area_scores', new=AsyncMock(return_value=area_scores)):
            result = await build_result(db, current, assessment_id)
        self.assertEqual(result["maturity"]["average"], 3.0)
        self.assertEqual(result["heatmap"]["vectors"], ["Bloque A", "Bloque B", "Bloque C", "Bloque D"])
        self.assertEqual(result["heatmap"]["areas"], [{"name": "Ventas B2B", "row": [3.0, 5.0, None, None]}])
        self.assertEqual(result["priorities"], [])

    async def test_cross_tenant_results_forbidden(self):
        db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(organization_id=uuid4())))
        current = SimpleNamespace(organization_id=uuid4(), user=SimpleNamespace(locale="es"))
        with self.assertRaises(APIError):
            await build_result(db, current, uuid4())


if __name__ == "__main__":
    unittest.main()
'''

    # Atomic-ish: validate all matches above before writing any output.
    changes = {
        service: src, schema_path: schema, types_path: types,
        page_path: page, pdf_path: pdf, hook_path: hook,
    }
    for path, content in changes.items():
        (ROOT / path).write_text(content, encoding='utf-8')
        print('Modificado:', path)
    tests_path.write_text(tests, encoding='utf-8')
    print('Creado:', tests_path.relative_to(ROOT))
    print('APP-14 parcial aplicado. Revisa git diff antes de commit.')


if __name__ == '__main__':
    main()
