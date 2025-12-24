# Umbra — Confidential AI Frontend

Umbra is Concrete Security’s marketing site and secure workspace for routing sensitive documents into a trusted execution environment (TEE). This repository contains the entire Next.js 15 application, Supabase-backed authentication, the waitlist/admin console, API routes, attestation helpers, PDF tooling, and the Playwright/Vitest test suites.

## Application surfaces

### Landing page (`app/page.tsx`)
- Hero prompt + attachment form stores the initial context in `sessionStorage` so the confidential workspace can replay it.
- People carousel, trust badges, and the security flow diagram highlight team credibility.
- Waitlist CTA and floating `FeedbackButton` submit through `/api/waitlist` and `/api/feedback`, reusing the same anti-bot protections as the auth surface.

### Confidential AI workspace (`app/confidential-ai/page.tsx`)
- Streaming chat client with reasoning panel, cache salt input, file uploads (text + PDFs via `public/pdfjs`/`workers/pdf.worker.ts`), and transcript controls.
- Provider settings are kept entirely in the browser (localStorage for base/model/label, sessionStorage for bearer tokens) and proxied through `/api/chat/completions` so secrets never touch the server code.
- RA-TLS (Remote Attestation TLS) establishes a cryptographically verified connection to the TEE via WebSocket proxy. The WASM-based `ratls-wasm` library performs TLS handshake and attestation verification entirely in the browser.
- The UI blocks prompts until RA-TLS connection is established and attestation verification succeeds, showing TEE type and TCB status.
- Optional guest throttling (`NEXT_PUBLIC_CONFIDENTIAL_ENABLE_GUEST_LIMITS`) limits anonymous visitors to a single session before requiring Supabase auth.

### Authentication & waitlist flows
- `/sign-in` renders the Supabase email/password form plus a waitlist request form that hits the same `/api/waitlist` endpoint.
- `/admin/waitlist` allows admins to filter, annotate, and activate requests. Activation generates Supabase magic links, records invite metadata, and dispatches branded emails via Resend. Roles are granted automatically only after recipients verify their email.
- `middleware.ts` and `SupabaseAuthListener` keep SSR and client state aligned so protected routes know when a user signs in or out.

### API routes & helpers
- `/api/chat/completions` proxies OpenAI-compatible streaming requests to the configured provider while enforcing HTTPS/loopback hosts.
- `/api/waitlist`, `/api/feedback`, and `/api/form-token` provide intake and signed form tokens with strict origin/content-type checks, rate limiting, and signed HMAC tokens.
- `/api/pccs/[...path]` proxies Intel PCCS (Provisioning Certification Caching Service) requests for attestation collateral downloads.
- `/api/admin/waitlist/*` exposes admin-only CRUD + activation flows using the Supabase service-role client.

## Stack & tooling
- Next.js 15 (app router) + React 19, TypeScript strict mode, and the `"@/*"` path alias.
- Tailwind 3.4 + Radix/shadcn UI + `geist`. Theme tokens live in `styles/globals.css`.
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for auth, waitlist storage, and magic links.
- PDF ingestion powered by pdf.js assets checked in under `public/pdfjs` with a dedicated worker in `workers/pdf.worker.ts`.
- Email delivery through Resend with HTML/text templates in `lib/email/templates/`.
- Tooling: pnpm 10.15.1, Vitest, Playwright, and `next lint`.

## Repository layout

| Path | Description |
| --- | --- |
| `app/` | Route tree for marketing pages, confidential workspace, auth, admin console, and all API handlers. |
| `components/` | Shared UI primitives (`feedback-button`, `markdown`, `chunk-recovery`, `supabase-auth-listener`, etc.). |
| `hooks/` | Reusable hooks (currently `use-form-token`). |
| `lib/` | Supabase helpers, chat proxy logic, RA-TLS client wrapper, email templates, security helpers, waitlist types, and the Umbra system prompt. |
| `ratls-wasm/` | Local copy of the RA-TLS WASM package (gitignored, copied from `../ratls/wasm/pkg` during build). |
| `public/` | Static assets (logos, pdf.js distribution, testimonial portraits). |
| `scripts/` | Tooling helpers for local experiments and diagnostics. |
| `supabase/` | SQL schema for `waitlist_requests`, indexes, enums, and policies. |
| `tests/` | `tests/unit` (Vitest suites) and `tests/e2e` (Playwright). |
| `workers/` | Standalone workers (pdf.js worker). |
| `Makefile` | Helper targets for install/dev/test/build workflows. |

## Getting started

### 1. Install dependencies
```bash
pnpm install
```
pnpm is pinned in `package.json`. The Makefile falls back to npm, but pnpm matches CI.

### 2. Configure environment
```bash
cp .env.example .env.local
```
Fill in the variables below. Generate a strong `FORM_TOKEN_SECRET`, e.g. `openssl rand -hex 32`. Never commit `.env.local`.

### 3. Supabase setup
1. Create a Supabase project and add `http://localhost:3000/auth/callback` plus the production domain to **Authentication → URL Configuration**.
2. Record `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Run `supabase/schema.sql` (SQL editor or `psql`) to create the `waitlist_requests` table, enum, indexes, and RLS policy.
4. Seed at least one admin user and tag it with the `admin` role:
   ```sql
   update auth.users
   set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'), '{roles}', '["admin"]'::jsonb, true)
   where email = 'you@example.com';
   ```
5. Optional: tag beta users with `roles:["member"]` so they can sign in without consuming the guest session.

### 4. Run the app locally
```bash
pnpm dev --hostname 0.0.0.0 --port 3000
```
Or use `make dev` / `make dev-open`. Visit `http://localhost:3000`.

### 5. Build for production
```bash
pnpm build && pnpm start
```
`pnpm start` respects `PORT` (or `make start PORT=4000`).

### 6. Useful scripts

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Runs `next lint` with the repo-specific ESLint overrides. |
| `pnpm test:unit` | Executes Vitest specs under `tests/unit` (coverage in `test-results/unit/coverage`). |
| `pnpm test:e2e` | Runs the Playwright suite (`tests/e2e/secure-chat.spec.ts`) against `http://127.0.0.1:3000`. |
| `make test` | Convenience target that runs unit + e2e suites with the required env (`FORM_TOKEN_SECRET`, attestation test flags). |
| `pnpm build` / `pnpm start` | Production build & runtime. |

## Environment variables

### Core auth & origin
| Name | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL shared by browser, server components, and service-role clients. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key for Supabase auth. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Needed by server routes (`/api/waitlist`, `/api/admin/*`). Keep it server-side only. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical origin used for CSRF enforcement (`lib/security/origin.ts`) and activation links. |
| `FORM_TOKEN_SECRET` | ✅ | HMAC key for signed form tokens (waitlist + feedback). Required for `/api/form-token`. |

### Confidential provider defaults
| Name | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_VLLM_BASE_URL` | Optional | Default provider base URL shown in the provider settings card. |
| `NEXT_PUBLIC_VLLM_MODEL` | Optional | Default model identifier. |
| `NEXT_PUBLIC_VLLM_PROVIDER_NAME` | Optional | Friendly provider name used in the UI badges. |
| `NEXT_PUBLIC_DEFAULT_SYSTEM_PROMPT` | Optional | Overrides `lib/system-prompt.ts` without editing the file. |
| `NEXT_PUBLIC_DEFAULT_MAX_TOKENS` | Optional | Default `max_tokens` (defaults to 4098). |
| `NEXT_PUBLIC_DEFAULT_TEMPERATURE` | Optional | Default `temperature` (defaults to 0.7). |

### RA-TLS & attestation
| Name | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_RATLS_PROXY_URL` | Required for live attestation | WebSocket proxy URL for RA-TLS connections (e.g., `wss://proxy.example.com`). The proxy bridges WebSocket to TCP for the TEE. |
| `NEXT_PUBLIC_PCCS_URL` | Optional | Custom PCCS origin for collateral downloads (defaults to Intel PCS TDX endpoint). |
| `NEXT_PUBLIC_ATTESTATION_TEST_MODE` | Optional | When `true`, skips real attestation verification (used by Playwright). |

### Email & feedback
| Name | Required | Description |
| --- | --- | --- |
| `RESEND_API_KEY` | Required to send mail | Used by `lib/email/resend.ts`. Without it, emails are skipped (logged in dev). |
| `RESEND_FROM_EMAIL` | Optional | Overrides the default `Concrete Security <onboarding@resend.dev>` sender. |
| `RESEND_TO_EMAIL_FEEDBACK` | ✅ if `/api/feedback` is enabled | Destination inbox for feedback submissions. |

### Runtime toggles
| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_CONFIDENTIAL_ENABLE_GUEST_LIMITS` | When `true`, anonymous visitors get a single confidential session before sign-in is required. |

## Supabase & authentication notes
- Supabase clients (`lib/supabase/client.ts`, `server.ts`, `route-handler.ts`, `service-role.ts`) centralize initialization and fail early when envs are missing.
- `middleware.ts` refreshes Supabase sessions for every request and applies the shared security headers defined in `next.config.mjs`.
- `SupabaseAuthListener` posts auth state changes back to `/auth/callback` so server components and middleware stay in sync.
- Admin APIs (`app/api/admin/waitlist/*`) call `requireAdminUser` from `lib/auth.ts` and reject requests that lack the `admin` role in `app_metadata`.
- Waitlist forms rely on `useFormToken` + honeypot fields. Tokens expire in 10 minutes (`lib/security/form-token.ts`).

## Confidential provider, chat, and RA-TLS
- `lib/confidential-chat.ts` normalizes provider URLs, forces HTTPS/loopback hosts, injects the Umbra system prompt, and streams SSE responses. Accepts an optional `fetchImpl` parameter for custom fetch implementations (e.g., RA-TLS fetch).
- Provider metadata lives entirely in the browser (`localStorage` key `confidential-provider-settings-v1`, `sessionStorage` key `confidential-provider-token`). Clearing storage resets them.
- `app/confidential-ai/page.tsx` supports reasoning streams (`reasoning_effort`), cache salts, per-message reasoning accordions, and a hex “cipher preview” before sending content.
- Attachments (≤100 MB) are appended to the message content before dispatch, and PDFs are converted to text with pdf.js (loaded from `/pdfjs/*`).
- Model output renders through `components/markdown.tsx`, which uses `remark-gfm` and `rehype-sanitize` plus custom copy buttons for code blocks.

### RA-TLS architecture
The RA-TLS (Remote Attestation TLS) flow provides cryptographically verified connections to TEE-hosted LLMs:

1. **`lib/ratls-client.ts`** wraps the `ratls-wasm` WASM module with lazy loading and browser-only execution. Key exports:
   - `createRatlsClient(config, onAttestation)` - Creates a fetch-compatible function that performs RA-TLS handshake
   - `getRatlsProxyUrl()` - Returns the configured proxy URL from `NEXT_PUBLIC_RATLS_PROXY_URL`
   - `deriveTargetHost(baseUrl)` - Extracts host:port from provider URL
   - `isRatlsConfigured()` - Checks if RA-TLS is enabled

2. **Connection flow:**
   - Browser connects via WebSocket to the RA-TLS proxy (`NEXT_PUBLIC_RATLS_PROXY_URL`)
   - Proxy bridges WebSocket to TCP, forwarding raw bytes to the TEE
   - WASM client performs TLS 1.3 handshake over the proxied connection
   - Client fetches TDX quote from TEE and verifies attestation using Intel DCAP
   - On success, `onAttestation` callback receives `{ trusted, teeType, tcbStatus }`

3. **`ratls-wasm/`** contains the WASM package (local copy from `../ratls/wasm/pkg`). When published to npm, update import in `lib/ratls-client.ts`.

4. **Security**: The proxy enforces an allowlist (`RATLS_PROXY_ALLOWLIST`) to prevent SSRF. All targets must be explicitly authorized.

## Email, waitlist, and feedback flows
- `/api/waitlist` and `/api/feedback` sanitize payloads, enforce same-origin requests, validate emails, rate limit by IP, and require signed form tokens.
- `/api/admin/waitlist/[id]/activate` generates Supabase magic links, enriches user metadata with `member` roles, and sends HTML/text emails via `lib/email/templates/waitlist-activation.ts`.
- Feedback submissions require `RESEND_TO_EMAIL_FEEDBACK` and fan out to both HTML + plaintext bodies for audit trail purposes.

## Security posture highlights
- CSP, Referrer Policy, HSTS (prod), Permissions Policy, and other headers are defined in `next.config.mjs` and applied to every route.
- The Confidential AI UI blocks messaging until RA-TLS connection is established and attestation verification succeeds; the connection status shows TEE type and TCB status.
- API routes call `ensureSameOrigin`, `assertJsonRequest`, and `verifyFormToken` to mitigate CSRF and automated abuse.
- `lib/security/rate-limit.ts` enforces in-memory rate limits (5 waitlist requests/minute/IP, 3 feedback requests/2 minutes/IP).
- `ChunkRecovery` listens for chunk load failures and reloads the app once, keeping the UX resilient when a CDN evicts bundles.
- Markdown rendering is sanitized, and copy-to-clipboard buttons avoid exposing raw HTML.

## Testing & QA
- `pnpm lint` – Next.js lint rules with repo-specific overrides (`eslint.config.mjs`).
- `pnpm test:unit` – Vitest suites for core utilities.
- `pnpm test:e2e` – Playwright suite that walks the landing page and confidential chat flow with mocked RA-TLS + provider responses.
- `pnpm test:ratls` – Integration tests for RA-TLS client with the WebSocket proxy (requires building `ratls-proxy`).
- `make test` – Runs unit + e2e suites with the required env flags (`FORM_TOKEN_SECRET`, Supabase anon key, etc.).

## Deployment checklist
1. Set all required env vars (Supabase, form token, provider defaults, RA-TLS proxy, Resend) in the hosting provider.
2. Ensure `NEXT_PUBLIC_APP_URL` matches the production origin so CSRF checks pass and magic links point to the correct domain.
3. Confirm the RA-TLS proxy is accessible and the TEE target is in its allowlist.
4. Populate provider defaults so first-time visitors see sane values.
5. Run `pnpm build` during CI and deploy the `.next` output (`pnpm start` in Node or Vercel’s build pipeline).
6. Reset local `.env.local` when switching between staging/prod credentials to keep Playwright and Supabase sessions deterministic.

## Operational tips
- Hero prompt + attachments use the `hero-initial-message` and `hero-uploaded-files` keys in `sessionStorage`.
- Provider defaults live in `localStorage` (`confidential-provider-settings-v1`). Delete that key to reset the workspace.
- Update the Umbra persona in `lib/system-prompt.ts` or via `NEXT_PUBLIC_DEFAULT_SYSTEM_PROMPT`.
- Waitlist statuses are defined in `lib/waitlist.ts` (`requested → contacted → invited → activated → archived`).
- Tailwind tokens are centralized in `styles/globals.css`. Prefer the CSS variables over hard-coded colors when creating new components.
- `people.json` powers the advisory board carousel—update it when profiles change.

With the environment configured and Supabase ready, run `pnpm dev`, open `http://localhost:3000`, and walk through the entire Umbra flow. Before opening a PR, run `pnpm lint`, `pnpm test:unit`, and `pnpm test:e2e` (or `make test`) to keep the quality gates green.
