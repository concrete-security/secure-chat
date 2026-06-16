# CLAUDE.md - CVM instructions

## What this is
- Confidential VM stack definition and integration tests for Umbra runtime services.
- Orchestrates nginx proxy, auth, attestation, and certificate-management services via Docker Compose.
- Includes end-to-end CVM test runner (`test_cvm.py`) used by CI.

## Quickstart
- Install test dependencies: `uv venv && uv pip install -r requirements_test.txt`
- Start stack (dev): `make dev-up`
- Run integration tests: `make wait-services && make test-all`
- Stop stack: `make dev-down`
- Full local cycle: `make dev-full`

## Repo map
- `docker-compose.yml` + overrides: service topology and runtime wiring
- `test_cvm.py`: integration test runner and endpoint assertions
- `attestation-service/`: FastAPI quote service (`attestation_service.py`, tests in `test_service.py`)
- `auth-service/`: lightweight auth gate (`src/auth_service/main.py`)
- `cert-manager/`: certificate and nginx config management (`src/cert_manager/`)

## Coding standards
- Python services managed with `uv`; Docker Compose for integration runs.
- Formatting/lint per service: `uv run ruff check . && uv run ruff format --check .`
- Keep compose and service changes synchronized (ports, env vars, health expectations).
- Avoid unrelated refactors across multiple services in one change.

## Workflow
- Prefer testable changes: run service checks first, then CVM integration checks when cross-service behavior is affected.
- Keep compose, env, and test updates aligned.
- Service-level commands:
  - **attestation-service**: `uv sync --dev && make test`
  - **auth-service**: `uv sync --dev`, then Docker build + smoke test `/health`
  - **cert-manager**: `uv sync --dev && uv run pytest -v`
- If behavior changes affect routing, TLS, auth, or attestation, run parent CVM tests.

## Safety
- Never commit real `AUTH_SERVICE_TOKEN` or `EKM_SHARED_SECRET` values.
- Do not run production deployments from local automation unless explicitly requested.
- Treat TLS, attestation, auth token, and certificate logic as sensitive.
- Preserve constant-time HMAC/token comparisons.
- Do not expose debug endpoints in production configurations.
- Do not make unchecked changes to supervisor restart/certbot flows.
