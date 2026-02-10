# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Umbra is Concrete Security's Confidential AI platform—a production system that routes sensitive documents into trusted execution environments (TEEs) for processing. It combines a Next.js frontend, Python backend services running in Confidential Virtual Machines (CVMs) on Phala Cloud, and a monitoring stack.

## Repository Structure

```
umbra/
├── frontend/          # Next.js 15 app (React 19, TypeScript, Tailwind, shadcn/ui)
├── cvm/               # Confidential VM services (Python/FastAPI)
│   ├── attestation-service/   # TDX attestation (FastAPI + dstack_sdk)
│   ├── auth-service/          # Token-based auth (HTTP server)
│   ├── cert-manager/          # Nginx + Let's Encrypt + EKM
│   └── docker-compose.yml     # Service orchestration
├── monitoring/        # Prometheus + Grafana for vLLM metrics
├── docs/              # Architecture diagrams
└── scripts/           # TDX utility scripts
```

## Build & Development Commands

### Frontend (Next.js)

```bash
cd frontend
pnpm install              # Install dependencies (pnpm 10.15.1 pinned)
pnpm dev                  # Dev server on :3000
pnpm build                # Production build
pnpm lint                 # ESLint
pnpm test:unit            # Vitest unit tests
pnpm test:e2e             # Playwright E2E tests
make test                 # Full test suite with required env vars
```

Single test file: `pnpm test:unit -- path/to/file.test.ts`
Debug E2E: `pnpm test:e2e -- --headed`

### CVM Services (Python)

```bash
cd cvm
make dev-up               # Start all services (docker-compose with dev overrides)
make dev-down             # Stop services
make test-all             # Full integration test suite
DEV=false make test-all   # Test in production mode
```

Individual service tests:
```bash
cd cvm/attestation-service
make dev                  # FastAPI dev with reload
make pytest               # Unit tests
uv run pytest tests/ -v   # Run specific test file
```

### Monitoring Stack

```bash
cd monitoring
make docker-up            # Start Prometheus + Grafana
make docker-stop          # Stop and clean configs
```

## Architecture Overview

**Data flow:**
1. User submits prompt/docs via frontend
2. Frontend connects through the proxy to the TEE server using aTLS (https://github.com/concrete-security/atlas)
3. Request routed through nginx (TLS termination + EKM channel binding)
4. Attestation service generates TDX quotes via dstack_sdk
5. Frontend verifies TDX attestation locally (DCAP QVL in-browser via `@phala/dcap-qvl-web`)
6. vLLM processes request inside TEE
7. Response streams back; Prometheus scrapes metrics

**Key security mechanisms:**
- Intel TDX attestation with DCAP verification (client-side, no server trust required)
- EKM channel binding (RFC 9266) with HMAC-SHA256 for TLS security
- Supabase RLS for database access control
- HMAC-signed form tokens for anti-bot protection

## Code Style

### Frontend
- TypeScript strict mode with `@/*` path alias
- 2-space indentation, double quotes (Next.js/Prettier defaults)
- Kebab-case filenames, PascalCase components
- Tailwind utility classes; CSS variables in `styles/globals.css`

### Python (CVM services)
- Python 3.11+, managed with `uv`
- Ruff for linting/formatting (line-length=100, 4-space indent, double quotes)
- Google docstring convention

## Commit Convention

Use Conventional Commits: `feat(frontend): ...`, `fix(auth): ...`, `chore(cvm): ...`

## Key Environment Variables

### Frontend
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase auth
- `FORM_TOKEN_SECRET` — HMAC key for form tokens
- `NEXT_PUBLIC_ATTESTATION_BASE_URL` — Attestation service URL
- `NEXT_PUBLIC_VLLM_BASE_URL`, `NEXT_PUBLIC_VLLM_MODEL` — Default provider settings

### CVM
- `EKM_SHARED_SECRET` — HMAC key for EKM header validation (must match nginx and attestation service)
- `AUTH_SERVICE_TOKEN` — Bearer token for auth service
- `NO_TDX=true` — Development mode without TDX hardware

## Testing Notes

- Frontend tests require `FORM_TOKEN_SECRET` env var
- E2E tests use `NEXT_PUBLIC_ATTESTATION_TEST_MODE=true` to skip real DCAP verification
- CVM tests run against docker-compose stack; use `--dev` flag for development mode endpoints

## Deployment

- **Frontend:** Vercel (auto-deploys from main)
- **CVM:** Phala Cloud (Docker images pushed to GHCR)
- **CI:** GitHub Actions for tests, builds, and deploys
