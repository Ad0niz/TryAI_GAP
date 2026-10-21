"""APP-14 regression tests. Run from backend: python -m unittest discover -s tests -v."""
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
