# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Umbra is a Next.js 15 confidential AI frontend for routing sensitive documents into a Trusted Execution Environment (TEE). The application establishes cryptographically verified connections via Remote Attestation TLS (RA-TLS) before allowing any chat interactions.

## Commands

All commands run from this directory:

```bash
# Install dependencies (pnpm 10.15.1 required, Node >=22)
pnpm install

# Development
pnpm dev                    # Start dev server
make dev                    # Same as above
make dev-open               # Dev server + auto-open browser

# Testing
pnpm lint                   # ESLint checks
pnpm test:unit              # Vitest unit tests (tests/unit/)
pnpm test:e2e               # Playwright E2E tests (tests/e2e/)
make test                   # Unit + E2E with required env vars

# Production
pnpm build                  # Build for production
pnpm start                  # Start production server

# RA-TLS WASM
./scripts/build-ratls-wasm.sh   # Rebuild WASM from pinned commit
```

## Architecture

### Core Security Flow
1. **RA-TLS Connection**: Browser connects via WebSocket proxy to TEE
2. **Attestation Verification**: WASM client verifies TDX quote using Intel DCAP
3. **Chat Enabled**: Only after attestation succeeds can users send messages
4. **WASM Integrity**: SHA-384 hash verification before loading ratls_wasm_bg.wasm

### Key Directories
- `app/` - Next.js App Router routes (pages, API handlers)
- `lib/` - Core utilities: `ratls-client.ts` (RA-TLS wrapper), `confidential-chat.ts` (streaming), `supabase/` (auth clients), `security/` (form tokens, rate limiting)
- `lib/ratls-wasm/` - Local WASM package (pinned build from ratls repo)
- `components/` - Shared UI (shadcn/Radix primitives)
- `tests/unit/` - Vitest suites
- `tests/e2e/` - Playwright specs

### Critical Files
- `lib/ratls-client.ts` - RA-TLS WASM wrapper with lazy loading, `createRatlsClient()`, policy configuration, `parseAppComposeServices()` for docker-compose parsing, `getImageUrl()` for container registry links
- `lib/confidential-chat.ts` - Chat streaming, URL validation (HTTPS/loopback only), system prompt injection
- `app/confidential-ai/page.tsx` - Main chat workspace, attestation UI, file uploads
- `middleware.ts` - Supabase session refresh per request
- `next.config.mjs` - CSP headers, security policies, WebAssembly support

### Authentication
- Supabase email/password + OAuth
- Admin role in `app_metadata.roles` for `/admin/*` routes
- Member role bypasses guest session limits
- Form tokens (HMAC-SHA256, 10-min TTL) protect waitlist/feedback forms

### Environment Variables
Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `FORM_TOKEN_SECRET` - HMAC key for form tokens
- `NEXT_PUBLIC_RATLS_PROXY_URL` - WebSocket proxy for RA-TLS

RA-TLS policy (optional):
- `NEXT_PUBLIC_RATLS_EXPECTED_MRTD/RTMR0/RTMR1/RTMR2` - TEE measurements
- `NEXT_PUBLIC_RATLS_EXPECTED_OS_HASH` - Expected OS image hash
- `NEXT_PUBLIC_RATLS_APP_COMPOSE` - Base64-encoded JSON containing `docker_compose_file` (pinned container images running in the TEE)

Testing:
- `NEXT_PUBLIC_ATTESTATION_TEST_MODE=true` - Skip real attestation in Playwright

## Code Style

- TypeScript strict mode, 2-space indentation
- React files: kebab-case filenames, PascalCase exports
- Conventional Commits: `feat(frontend):`, `fix(auth):`, etc.
- Tailwind utilities preferred; theme tokens in `styles/globals.css`
- Never commit `.env.local`

## Security Notes

- Chat messaging blocked until RA-TLS attestation succeeds
- All provider URLs validated (HTTPS or 127.0.0.1 only)
- Rate limits: 5 waitlist/min/IP, 3 feedback/2min/IP
- CSP enforced via `next.config.mjs` (dev allows eval, prod restricts)
- Attestation verification must pass before encrypted chat is enabled
