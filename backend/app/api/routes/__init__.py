"""Aggregates all domain routers registered by app.main under the API v1 prefix."""
from app.api.routes.auth import router as auth_router
from app.api.routes.leads import router as leads_router
from app.api.routes.organizations import router as organizations_router
from app.api.routes.metadata import router as metadata_router
from app.api.routes.questionnaires import router as questionnaires_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.areas import router as areas_router
from app.api.routes.documents import router as documents_router
from app.api.routes.team import router as team_router
from app.api.routes.delegations import router as delegations_router
from app.api.routes.estimator import router as estimator_router
from app.api.routes.payments import router as payments_router
from app.api.routes.results import router as results_router
from app.api.routes.reviews import router as reviews_router
from app.api.routes.consultant import router as consultant_router

ALL_ROUTERS = [
    auth_router,
    leads_router,
    organizations_router,
    metadata_router,
    questionnaires_router,
    assessments_router,
    areas_router,
    documents_router,
    team_router,
    delegations_router,
    estimator_router,
    payments_router,
    results_router,
    reviews_router,
    consultant_router,
]
