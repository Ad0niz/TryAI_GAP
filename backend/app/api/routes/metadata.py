"""Public metadata: localized dropdown catalogs for the onboarding forms."""
from fastapi import APIRouter, Header

router = APIRouter(prefix="/metadata", tags=["metadata"])

_SUPPORTED = {"es", "en", "de", "pt"}

_SIZES = {
    "es": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    "en": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    "de": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    "pt": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
}

_INDUSTRIES = {
    "es": [
        "Tecnología", "Servicios financieros", "Salud", "Manufactura", "Comercio minorista",
        "Educación", "Sector público", "Energía", "Transporte y logística", "Otro",
    ],
    "en": [
        "Technology", "Financial services", "Healthcare", "Manufacturing", "Retail",
        "Education", "Public sector", "Energy", "Transport & logistics", "Other",
    ],
    "de": [
        "Technologie", "Finanzdienstleistungen", "Gesundheitswesen", "Fertigung", "Einzelhandel",
        "Bildung", "Öffentlicher Sektor", "Energie", "Transport & Logistik", "Sonstiges",
    ],
    "pt": [
        "Tecnologia", "Serviços financeiros", "Saúde", "Manufatura", "Varejo",
        "Educação", "Setor público", "Energia", "Transporte e logística", "Outro",
    ],
}

_COUNTRIES = {
    "es": [
        "España", "Reino Unido", "Alemania", "Portugal", "Francia",
        "Estados Unidos", "México", "Brasil", "Argentina", "Colombia",
    ],
    "en": [
        "Spain", "United Kingdom", "Germany", "Portugal", "France",
        "United States", "Mexico", "Brazil", "Argentina", "Colombia",
    ],
    "de": [
        "Spanien", "Vereinigtes Königreich", "Deutschland", "Portugal", "Frankreich",
        "Vereinigte Staaten", "Mexiko", "Brasilien", "Argentinien", "Kolumbien",
    ],
    "pt": [
        "Espanha", "Reino Unido", "Alemanha", "Portugal", "França",
        "Estados Unidos", "México", "Brasil", "Argentina", "Colômbia",
    ],
}

_CURRENCIES = ["GBP", "EUR", "USD"]
_FRAMEWORKS = ["UK GDPR", "EU AI Act", "ISO 42001", "NIST AI RMF"]


def _resolve_locale(accept_language: str | None) -> str:
    lang = (accept_language or "es")[:2].lower()
    return lang if lang in _SUPPORTED else "es"


@router.get("")
async def get_metadata(accept_language: str | None = Header(None)):
    locale = _resolve_locale(accept_language)
    return {
        "sizes": _SIZES[locale],
        "industries": _INDUSTRIES[locale],
        "countries": _COUNTRIES[locale],
        "currencies": _CURRENCIES,
        "frameworks": _FRAMEWORKS,
    }
