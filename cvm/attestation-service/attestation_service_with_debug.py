"""
Attestation Service with Debug Endpoints

DO NOT USE IN PRODUCTION!

This script imports the production attestation service and adds debug endpoints
for testing purposes only. This file should only be used in development and
testing environments to verify EKM header forwarding and HMAC validation.
"""

import hashlib
import hmac
import secrets

from fastapi import Request

# Import the production app and necessary constants
from attestation_service import EKM_SHARED_SECRET, HEADER_TLS_EKM_CHANNEL_BINDING, app


@app.get("/debug/ekm")
async def debug_ekm_header(request: Request):
    """Debug endpoint to verify EKM header forwarding and HMAC validation"""
    signed_header = request.headers.get(HEADER_TLS_EKM_CHANNEL_BINDING, "")

    # Parse signed header
    if signed_header and len(signed_header) == 129 and signed_header[64] == ":":
        ekm_hex = signed_header[:64]
        ekm_raw = bytes.fromhex(ekm_hex)
        hmac_hex = signed_header[65:]

        # Validate HMAC
        valid_hmac = False
        if EKM_SHARED_SECRET:
            expected_hmac = hmac.new(
                EKM_SHARED_SECRET.encode("utf-8"), ekm_raw, hashlib.sha256
            ).hexdigest()
            valid_hmac = secrets.compare_digest(hmac_hex, expected_hmac)

        return {
            "ekm_header_present": True,
            "ekm_header_length": len(signed_header),
            "ekm_value": ekm_hex[:16] + "..." + ekm_hex[-8:],
            "ekm_full": ekm_hex,
            "hmac_value": hmac_hex[:16] + "..." + hmac_hex[-8:],
            "hmac_valid": valid_hmac,
            "format": "signed",
        }
    else:
        return {
            "ekm_header_present": bool(signed_header),
            "ekm_header_length": len(signed_header) if signed_header else 0,
            "format": "unknown or legacy",
        }
