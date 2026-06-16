# Umbra

Monorepo for the Umbra secure AI platform.

## Subprojects
- `frontend/` — Next.js confidential workspace + control-plane integration.
- `cvm/` — CVM-side services (attestation, auth, cert-manager, compose).
- `monitoring/` — Prometheus/Grafana stack.

## Attestation Policy (Agents Workspace)
- `/agents` no longer uses global env hash sets for Atlas policy.
- Atlas settings are now per-CVM in Supabase:
  - `public.cvm_instances.atlas_policy` (JSONB)
  - `public.cvm_instances.atlas_proxy_url` (text)
- Production behavior is fail-closed: missing or invalid per-CVM Atlas config blocks manifest/transport initialization.

## Operator Workflow
- Derive policy from a live quote:
  - `python3 frontend/scripts/get-tee-policy-values.py <hostname> --format policy-json`
- Sync assigned CVM for one user (dry-run by default):
  - `python3 frontend/scripts/sync-cvm-atlas-policy.py --user-id <supabase-user-id>`
  - add `--apply` to persist changes.

See `frontend/README.md` for full setup and usage details.
