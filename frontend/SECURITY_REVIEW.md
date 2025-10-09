# Frontend Security Review

Repository: `/Users/jfrery/secure-llm/frontend`  
Date: 2025-02-14

## Critical Risks

1. **Client-stored provider secrets (`app/confidential-ai/page.tsx:145-189`)**  
   - Provider base URL and bearer token are persisted in `localStorage`/`sessionStorage`. Any XSS or malicious browser extension instantly exfiltrates credentials.  
   - **Action:** Terminate client-side storage of provider configuration. Move provider negotiation to a server/edge API running inside a TEE and inject secrets only on the server side.

2. **Disabled build-time safeguards (`next.config.mjs:4-7`)**  
   - `ignoreDuringBuilds` and `ignoreBuildErrors` are `true`, allowing deployments with lint/TypeScript failures. This makes it easy to ship exploitable bugs.  
   - **Action:** Re-enable lint and type checking during builds, fix outstanding violations, and gate CI/CD on `pnpm lint` and `pnpm build`.

3. **Unstable framework version (`package.json:52`)**  
   - The project relies on `next@15.5.4` (canary). Canary builds can regress security patches and APIs without notice.  
   - **Action:** Downgrade to the latest stable LTS (currently Next 14.x) or upgrade when 15.x is GA; monitor the security advisories.

4. **Sensitive `NEXT_PUBLIC_*` defaults (`.env_example:6-11`, `lib/confidential-chat.ts:72-86`)**  
   - Any value in `NEXT_PUBLIC_*` is inlined into the client bundle, exposing provider metadata and model IDs publicly.  
   - **Action:** Leave sensitive values blank in public configs. Surface only non-sensitive defaults and retrieve real config on the server.

## High Risks

1. **Dependency drift (`package.json:12-66`)**  
   - Several packages use `"latest"`; `pdfjs` is pinned to the unsupported 2.5.4 release.  
   - **Action:** Pin vetted versions, upgrade `pdfjs` via the maintained `pdfjs-dist`, and enable automated dependency updates plus SCA scans.

2. **Unvetted PDF worker (`app/confidential-ai/page.tsx:333-352`)**  
   - Dynamically imports `/public/pdfjs/pdf.mjs`; any alteration at that path runs with full DOM rights.  
   - **Action:** Bundle `pdfjs-dist` via npm, enforce Subresource Integrity for static workers, or stream PDF parsing through the backend.

3. **Custom Markdown sanitizer (`components/markdown.tsx:257`)**  
   - Hand-rolled parser outputs `dangerouslySetInnerHTML`. While it escapes many cases, untested edge cases could enable XSS.  
   - **Action:** Replace with a vetted library (`marked` + `dompurify` or `@discordapp/twemoji-parser`) and cover with XSS regression tests.

4. **Missing security headers (`next.config.mjs`)**  
   - No CSP, HSTS, Referrer, or Permissions headers.  
   - **Action:** Implement `headers()` to ship a strict `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, `Referrer-Policy`, and `X-Frame-Options`.

## Medium Observations

- **Oversized client uploads (`app/confidential-ai/page.tsx:272-355`)**  
  Client can inline 100 MB files into a single request string, freezing the UI and exceeding provider limits. Enforce a tighter cap and move ingestion server-side with streaming.

- **Misleading encryption UI (`app/confidential-ai/page.tsx:648-654`)**  
  “Encrypting …” banner reflects only a hex preview; traffic is plaintext. Either implement real client-side encryption or adjust UX copy.

- **Unused packages (`package.json:54`)**  
  `openai` is unused; remove to shrink the attack surface and keep dependency lists auditable.

- **Verbose client logging (`lib/confidential-chat.ts` & `app/confidential-ai/page.tsx`)**  
  Console logs leak provider diagnostics/stack traces. Replace with structured logging routed through a secure server endpoint and redact secrets.

- **Local secrets exposure (`.env.local`)**  
  File exists in the workspace (though gitignored). Ensure no sensitive values leave the secure environment; rotate any tokens that might have been shared.

## Recommended Next Steps

1. **Implement a secure provider proxy**  
   - Move all provider interactions to a backend/edge function. Enforce allowlists, attach credentials server-side, throttle requests, and strip secrets from responses.

2. **Restore hardening gates**  
   - Re-enable lint/type checks, add CI pipelines for `pnpm lint`, `pnpm build`, and future `pnpm test`. Include `pnpm audit` or an SCA tool in CI.

3. **Dependency hygiene**  
   - Pin versions, upgrade Next.js and `pdfjs`, add Renovate/Dependabot, and maintain a changelog of security updates.

4. **Platform security headers**  
   - Add CSP (`default-src 'self'` plus explicit allowances), HSTS (`max-age >= 1 year`), `Permissions-Policy`, `Referrer-Policy`, and `X-Content-Type-Options`. Provide SRI hashes for critical static assets and add `security.txt`/`robots.txt`.

5. **Testing & validation**  
   - Add unit tests for Markdown sanitization, integration tests for chat flows (including attachment rejection), and e2e smoke tests covering theme toggles, mobile nav, and provider setup.

6. **Documentation & messaging**  
   - Update README and marketing copy to match actual security guarantees. Document production setup, secrets management, and incident response runbooks.

