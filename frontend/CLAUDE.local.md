# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Umbra is a Next.js 15 confidential AI frontend for routing sensitive documents into a Trusted Execution Environment (TEE). The application establishes cryptographically verified connections via attested TLS (aTLS) before allowing any chat interactions.

## Commands

All commands run from this directory:

```bash
# Install dependencies (pnpm 10.15.1 required, Node >=22)
pnpm install

# Development
pnpm dev                    # Start dev server (HTTP, localhost)
pnpm dev:https              # Start dev server (HTTPS, localhost.concrete-security.com)
make dev                    # Same as pnpm dev
make dev-open               # Dev server + auto-open browser

# Testing
pnpm lint                   # ESLint checks
pnpm test:unit              # Vitest unit tests (tests/unit/)
pnpm test:e2e               # Playwright E2E tests (tests/e2e/)
make test                   # Unit + E2E with required env vars

# Production
pnpm build                  # Build for production
pnpm start                  # Start production server
```

## Architecture

### Core Security Flow
1. **aTLS Connection**: Browser connects via WebSocket proxy to TEE
2. **Attestation Verification**: WASM client verifies TDX quote using Intel DCAP
3. **Chat Enabled**: Only after attestation succeeds can users send messages

### Key Directories
- `app/` - Next.js App Router routes (pages, API handlers)
- `lib/` - Core utilities: `atlas-client.ts` (aTLS wrapper), `confidential-chat.ts` (streaming), `supabase/` (auth clients), `security/` (form tokens, rate limiting)
- `components/` - Shared UI (shadcn/Radix primitives)
- `tests/unit/` - Vitest suites
- `tests/e2e/` - Playwright specs

### aTLS WASM Package
The `@concrete-security/atlas-wasm` npm package handles attestation verification. Package integrity is verified by pnpm during installation.

### Critical Files
- `lib/atlas-client.ts` - aTLS WASM wrapper with lazy loading, `createAtlasClient()`, policy configuration, `parseAppComposeServices()` for docker-compose parsing, `getImageUrl()` for container registry links
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
- `NEXT_PUBLIC_ATLAS_PROXY_URL` - WebSocket proxy for aTLS

aTLS policy (legacy env mode for `/chat` and `/confidential-ai`):
- `NEXT_PUBLIC_ATLAS_EXPECTED_MRTD/RTMR0/RTMR1/RTMR2` - TEE measurements
- `NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH` - Expected OS image hash
- `NEXT_PUBLIC_ATLAS_APP_COMPOSE` - Base64-encoded JSON containing `docker_compose_file` (pinned container images running in the TEE)

Agents workspace (`/agents`) uses per-CVM manifest values from Supabase instead:
- `public.cvm_instances.atlas_policy` (JSONB)
- `public.cvm_instances.atlas_proxy_url` (text)
- Missing/invalid values fail closed in production.

Testing:
- `NEXT_PUBLIC_ATTESTATION_TEST_MODE=true` - Skip real attestation in Playwright

Per-CVM policy sync helper:
- `python3 scripts/sync-cvm-atlas-policy.py --user-id <supabase-user-id> [--apply]`
- Script defaults:
  - resolves CVM from `user_cvm_assignments`
  - derives hostname from `cvm_instances.base_url`
  - uses `.env.local` for Supabase/proxy env defaults

## Local HTTPS Development

Passkeys (WebAuthn) and CVM owner verification require a secure context (HTTPS). The domain `localhost.concrete-security.com` is also needed for CVM server-side origin whitelisting.

**Prerequisites** (one-time setup):
1. `/etc/hosts` must contain: `127.0.0.1 localhost.concrete-security.com`
2. Install mkcert and trust the local CA: `brew install mkcert && mkcert -install`
3. Generate certs: `mkdir -p certs && cd certs && mkcert localhost.concrete-security.com localhost 127.0.0.1`
4. Set `NEXT_PUBLIC_APP_URL="https://localhost.concrete-security.com:3000"` in `.env.local`

Then run `pnpm dev:https` and open `https://localhost.concrete-security.com:3000`.

## Code Style

- TypeScript strict mode, 2-space indentation
- React files: kebab-case filenames, PascalCase exports
- Conventional Commits: `feat(frontend):`, `fix(auth):`, etc.
- Tailwind utilities preferred; theme tokens in `styles/globals.css`
- Never commit `.env.local`

## Security Notes

- Chat messaging blocked until aTLS attestation succeeds
- All provider URLs validated (HTTPS or 127.0.0.1 only)
- Rate limits: 5 waitlist/min/IP, 3 feedback/2min/IP
- CSP enforced via `next.config.mjs` (dev allows eval, prod restricts)
- Attestation verification must pass before encrypted chat is enabled
