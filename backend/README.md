# AI Assessment — Backend API

FastAPI + PostgreSQL backend for the AI Assessment platform, packaged for **Azure Container Apps**.
Async SQLAlchemy 2.0 · Pydantic v2 · JWT (magic link) · Stripe · Azure Blob · Azure Communication Services.

## Stack & layout

```
app/
  main.py            # FastAPI app, middleware, router registration, /health
  core/              # config, errors (unified envelope), security (JWT), logging, email rules, pagination
  db/                # async engine/session, declarative base
  models.py          # all ORM models (single source of truth)
  api/deps.py        # get_db, get_current_user, require_roles, require_pro (plan gating)
  api/routes/        # 15 domain routers (auth, leads, organizations, questionnaires,
                     #   assessments, areas, documents, team, delegations, estimator,
                     #   payments, results, reviews, consultant, metadata)
  schemas/           # Pydantic request/response models
  services/          # business logic per domain
  integrations/      # email (ACS), storage (Blob), payments (Stripe) — all with dev fallbacks
  seed.py            # idempotent seed: maturity questions (ES/EN) + demo distributor code
migrations/          # Alembic
Dockerfile, docker-compose.yml, .github/workflows/deploy.yml
```

All endpoints are served under `/api/v1`. Interactive docs at `/docs`, schema at `/openapi.json`, liveness at `/health`.

## Error format

Every error returns:

```json
{ "error": { "code": "LEAD_EMAIL_FREE_PROVIDER", "message": "…", "field": "company_email", "request_id": "…" } }
```

`code` is stable and localizable; `message` respects `Accept-Language` where applicable.

## Run locally (Docker)

```bash
cp .env.example .env          # adjust if needed
docker compose up --build     # API on http://localhost:8000, Postgres on 5432
```

Then seed demo data (in another shell):

```bash
docker compose exec api python -m app.seed
```

## Run locally (without Docker)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # point DATABASE_URL at your local Postgres
python -m app.seed            # creates tables (dev) + seeds
uvicorn app.main:app --reload
```

In `dev`, tables are auto-created on startup. For staging/prod use Alembic:

```bash
alembic revision --autogenerate -m "init"
alembic upgrade head
```

## Configuration (env vars)

See `.env.example`. Key ones: `DATABASE_URL` (async, `postgresql+asyncpg://…`), `JWT_SECRET`,
`FREE_MATURITY_LIMIT`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`,
`AZURE_STORAGE_CONNECTION_STRING`, `ACS_CONNECTION_STRING`.
Leave the Azure/Stripe values empty in dev to use the built-in fallbacks
(console email, local filesystem storage, mock Stripe checkout).

## Deploy to Azure Container Apps

The image listens on `$PORT` (Container Apps sets it) and exposes `/health`.

```bash
# One-time infra (example)
az group create -n rg-aiassessment -l westeurope
az postgres flexible-server create -g rg-aiassessment -n pg-aiassessment \
  --admin-user pgadmin --admin-password '<strong-pass>' --tier Burstable --sku-name Standard_B1ms
az acr create -g rg-aiassessment -n acraiassessment --sku Basic
az containerapp env create -g rg-aiassessment -n cae-aiassessment -l westeurope

# Build & push, then create the app
az acr build -r acraiassessment -t aiassessment-api:latest -f Dockerfile .
az containerapp create -g rg-aiassessment -n ca-aiassessment \
  --environment cae-aiassessment \
  --image acraiassessment.azurecr.io/aiassessment-api:latest \
  --target-port 8000 --ingress external --min-replicas 1 --max-replicas 5 \
  --secrets db-url="postgresql+asyncpg://pgadmin:<pass>@pg-aiassessment.postgres.database.azure.com:5432/aiassessment" \
            jwt-secret="<random>" \
  --env-vars APP_ENV=prod DATABASE_URL=secretref:db-url JWT_SECRET=secretref:jwt-secret
```

Store `STRIPE_*`, `AZURE_STORAGE_CONNECTION_STRING` and `ACS_CONNECTION_STRING` as Container Apps
secrets (or in Azure Key Vault referenced by the app). Point the Stripe webhook at
`https://<app-fqdn>/api/v1/webhooks/stripe`.

### CI/CD

`.github/workflows/deploy.yml` runs compile/import checks on every push and, on `main`, builds via
`az acr build` and updates the Container App. Required repo secrets: `AZURE_CREDENTIALS`, `ACR_NAME`,
`CONTAINERAPP_NAME`, `AZURE_RG`.

## Verified

`python -m compileall app` passes; the app boots and registers **43 endpoints across 15 routers**;
the unified error envelope, auth/plan guards and public endpoints were smoke-tested with FastAPI's
TestClient. Full DB-backed flows require a running PostgreSQL (see Run locally).
