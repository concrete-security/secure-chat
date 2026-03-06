# AGENTS.md

Guidance for coding agents working in this repository.

## Scope
- `frontend/` handles user-facing app routes, CVM manifest integration, and browser-side attestation transport.
- `cvm/` handles CVM runtime services (attestation/auth/cert-manager).

## Atlas Policy Source of Truth (`/agents`)
- Do not use global env hash sets for `/agents` attestation policy.
- Use per-CVM Supabase fields:
  - `public.cvm_instances.atlas_policy`
  - `public.cvm_instances.atlas_proxy_url`
- `atlas_policy` must be a JSON object with `type: "dstack_tdx"`.

## Fail-Closed Requirement
- In production, missing or invalid `atlas_policy` / `atlas_proxy_url` must fail closed.
- Do not add fallback from `/agents` manifest/transport to `NEXT_PUBLIC_ATLAS_EXPECTED_*` vars.
- Legacy env policy (`NEXT_PUBLIC_ATLAS_EXPECTED_*`, `NEXT_PUBLIC_ATLAS_APP_COMPOSE`) is only for non-agents routes (`/chat`, `/confidential-ai`).

## Operator Sync Workflow
1. Derive policy JSON from a live quote:
   - `python3 frontend/scripts/get-tee-policy-values.py <hostname> --format policy-json`
2. Sync CVM record (dry-run default):
   - `python3 frontend/scripts/sync-cvm-atlas-policy.py --user-id <supabase-user-id>`
   - Add `--apply` to persist.

## Documentation Hygiene
- Keep these files aligned whenever policy behavior changes:
  - `README.md`
  - `frontend/README.md`
  - `CLAUDE.md`
  - `frontend/CLAUDE.md`
  - `frontend/CLAUDE.local.md`
