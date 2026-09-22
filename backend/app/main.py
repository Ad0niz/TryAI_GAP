import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.logging import RequestIdMiddleware, configure_logging

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    if settings.is_dev:
        # Dev convenience: auto-create tables. Use Alembic in prod.
        try:
            from app.db.session import init_models
            await init_models()
        except Exception:  # pragma: no cover
            log.warning("init_models skipped (no DB reachable at startup)")
    yield


app = FastAPI(
    title="AI Assessment API",
    version="1.0.0",
    description="Backend REST API — FastAPI + PostgreSQL (Azure Container Apps).",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "env": settings.app_env, "version": app.version}


def _include_routers() -> None:
    """Register every domain router under the API v1 prefix."""
    from app.api import routes  # noqa
    from app.api.routes import ALL_ROUTERS
    for r in ALL_ROUTERS:
        app.include_router(r, prefix=settings.api_v1_prefix)


_include_routers()
