"""Official Administration classification: seed_area_questions (2).py, 2026-10-27.

Only functional questions are classified. Maturity mapping is not supplied.
English database values are adapted to the existing Spanish API identifiers.
"""
AREA_VECTOR_TYPES = {
    "ventas": "revenue",
    "marketing": "revenue",
    "servicio": "experience",
    "finanzas": "efficiency",
    "rrhh": "talent",
    "operaciones": "efficiency",
    "legal": "risk",
}

VECTOR_API_KEYS = {
    "efficiency": "eficiencia",
    "revenue": "ingresos",
    "experience": "experiencia",
    "risk": "riesgo",
    "talent": "talento",
}

# Verified official kits: A1-A4, B1-B4, C1-C4, D1-D4 in every area.
AREA_QUESTION_CODES = tuple(f"{block}{number}" for block in "ABCD" for number in range(1, 5))
