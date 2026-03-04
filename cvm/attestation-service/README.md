# Attestation Service

A FastAPI-based service that provides Intel TDX attestations.

The attestation service exposes REST API endpoints that allow clients to:

- Get cryptographic quotes containing attestation evidence
- Verify the integrity and authenticity of confidential computing environments
- Provide proof that code is running within a trusted execution environment

Behind the scenes, the service uses the `dstack_sdk` to communicate with the dstack daemon via Unix socket (`/var/run/dstack.sock`), which in turn handles the interaction with TDX hardware to generate attestation quotes that can be verified by remote parties.

## API Endpoints

- `GET /health` - Service health check
- `POST /tdx_quote` - Generate TDX attestation quote with custom report data
- `GET /debug/ekm` - Debug endpoint available only via `attestation_service_with_debug.py` (for testing)

You also have API docs at `/docs` and `/redoc`.

## Security: EKM Channel Binding with HMAC

This service implements TLS channel binding using Exported Keying Material (EKM) as defined in [RFC 9266](https://datatracker.ietf.org/doc/rfc9266/).

### Architecture

The attestation service **does not** handle TLS connections directly. Instead, it relies on a reverse proxy (such as nginx) that:
1. Terminates TLS connections from clients
2. Extracts the TLS EKM from the connection
3. Forwards the EKM to the attestation service via the `X-TLS-EKM-Channel-Binding` header

To prevent header forgery attacks (e.g., if the reverse proxy is compromised or an attacker bypasses it), EKM headers are cryptographically signed with HMAC-SHA256.

### HMAC Key Derivation

The HMAC key is **derived inside the TEE** at startup using dstack's deterministic key derivation (`get_key("ekm/hmac-key/v1")`). Both nginx (cert-manager) and this service derive the same key from the same dstack path, so they agree without any external secret injection. This ensures the operator who deploys the CVM never sees the HMAC key.

In dev/test environments without a dstack socket, the service falls back to the `EKM_SHARED_SECRET` environment variable.

### Security Properties

- **Format**: EKM headers use the format `{ekm_hex}:{hmac_hex}` (129 characters total)
- **Validation**: HMAC is validated using constant-time comparison to prevent timing attacks
- **Defense in Depth**: TEE/Network isolation (proxy and service running inside the same TEE, and the attestation service is only accessible to the proxy) + HMAC validation provide multiple security layers
- **Key Properties**:
  - Derived from TEE identity via dstack -- never leaves the CVM
  - Deterministic: same compose hash + key path = same key
  - Operator never sees the key (zero-trust deployment)

### How It Works

1. Both nginx and attestation service derive the same HMAC key from dstack at startup
2. Reverse proxy extracts TLS EKM from the client connection
3. Reverse proxy computes `HMAC-SHA256(ekm_raw, hmac_key)` and forwards as `{ekm_hex}:{hmac_hex}`
4. Attestation service validates HMAC before trusting EKM
5. Invalid signatures return HTTP 403 Forbidden

This prevents attackers from forging EKM values even if they compromise the reverse proxy or bypass network isolation.

## Testing with Debug Endpoints

For testing purposes, a separate script `attestation_service_with_debug.py` is available that adds debug endpoints to the production service. **This script should never be used in production.**

### Running with Debug Endpoints

```bash
# Development mode with debug endpoints
uv sync
uv run fastapi run attestation_service_with_debug.py --port 8080 --reload
```

The debug script adds:
- `GET /debug/ekm` - Verify EKM header forwarding and HMAC validation

These endpoints are used by the integration test suite in `../test_cvm.py`.

## Requirements

This service uses [uv](https://docs.astral.sh/uv/) for Python dependency management and virtual environment management. `uv` provides fast, reliable package resolution and installation.

## Usage

See the `Makefile` for common operations:

### Environment Configuration

- **NO_TDX=true** (default): Runs without Dstack socket binding for development/testing
- **NO_TDX=false**: Enables TDX hardware integration by binding to `/var/run/dstack.sock`

### Examples

```bash
# Development mode
make dev

# Production with TDX hardware
NO_TDX=false make run

# Full test suite
make all
```
