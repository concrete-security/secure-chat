"""
Attestation Service

Provides TDX attestation endpoints using the dstack_sdk.
"""

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Optional, Union

from dstack_sdk import DstackClient, GetQuoteResponse
from dstack_sdk.dstack_client import TcbInfoV05x
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel

HEADER_TLS_EKM_CHANNEL_BINDING = "X-TLS-EKM-Channel-Binding"

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# TODO: This is to support both legacy and EKM modes
# We will drop legacy mode in the future, keeping only nonce_hex
class ReportDataRequest(BaseModel):
    report_data: Optional[Union[str, bytes]] = None
    report_data_hex: Optional[str] = None
    nonce_hex: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str


class QuoteResponse(BaseModel):
    success: bool
    quote: Optional[GetQuoteResponse] = None
    tcb_info: Optional[TcbInfoV05x] = None
    timestamp: str
    quote_type: str
    error: Optional[str] = None


# Initialize FastAPI app
app = FastAPI(
    title="Attestation Service",
    description="TDX attestation endpoints using dstack_sdk",
    version="0.1.0",
)

# Debug mode flag from environment variable
DEBUG_MODE = os.getenv("DEBUG_MODE", "false").lower()

# Validate EKM_SHARED_SECRET at startup
EKM_SHARED_SECRET = os.getenv("EKM_SHARED_SECRET")
if EKM_SHARED_SECRET:
    if len(EKM_SHARED_SECRET) < 32:
        logger.error("EKM_SHARED_SECRET is too short (minimum 32 characters recommended)")
        raise RuntimeError("EKM_SHARED_SECRET is too short")
    logger.info("EKM validation enabled with shared secret")
else:
    logger.error("EKM_SHARED_SECRET not set - EKM headers will not be validated!")
    raise RuntimeError("EKM_SHARED_SECRET not set")


def validate_and_extract_ekm(signed_header: str, secret: str) -> str:
    """
    Validate HMAC signature and extract EKM value.

    Args:
        signed_header: Format "{ekm_hex}:{hmac_hex}" (129 chars)
        secret: Shared secret for HMAC validation

    Returns:
        ekm_hex: The validated EKM value (64 hex chars)

    Raises:
        ValueError: If validation fails
    """
    if len(signed_header) != 129 or signed_header[64] != ":":
        raise ValueError("Invalid EKM header format (expected: {ekm}:{hmac})")

    ekm_hex = signed_header[:64]
    ekm_raw = bytes.fromhex(ekm_hex)
    received_hmac = signed_header[65:]

    # Compute expected HMAC
    expected_hmac = hmac.new(secret.encode("utf-8"), ekm_raw, hashlib.sha256).hexdigest()

    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(received_hmac, expected_hmac):
        raise ValueError("HMAC validation failed")

    return ekm_hex


def compute_report_data(nonce_hex: str, ekm_hex: str) -> bytes:
    """
    Compute report_data from nonce and EKM using SHA512.

    This implements TLS channel binding for attestation.
    The nonce provides freshness and the EKM binds to the specific TLS session.
    Clients will verify that the same nonce and EKM were used.

    Args:
        nonce_hex: 64-character hex string (32 bytes)
        ekm_hex: 64-character hex string (32 bytes)

    Returns:
        64-byte SHA512 hash suitable for TDX report_data
    """
    if len(nonce_hex) != 64:
        raise ValueError("nonce_hex must be exactly 64 hex characters (32 bytes)")
    if len(ekm_hex) != 64:
        raise ValueError("ekm_hex must be exactly 64 hex characters (32 bytes)")
    nonce = bytes.fromhex(nonce_hex)
    ekm = bytes.fromhex(ekm_hex)
    return hashlib.sha512(nonce + ekm).digest()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", service="attestation-service")


@app.get("/debug/ekm")
async def debug_ekm_header(request: Request):
    """Debug endpoint to verify EKM header forwarding (requires DEBUG_MODE=true)"""
    if DEBUG_MODE != "true":
        return {
            "error": "Debug mode not enabled",
            "message": "Set DEBUG_MODE=true environment variable to enable this endpoint",
        }

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


@app.post("/tdx_quote", response_model=QuoteResponse)
async def post_tdx_quote(request: Request, data: ReportDataRequest):
    """
    Get TDX quote with report data.

    Supports two modes:
    1. Legacy mode: no TLS session binding
       - Provide report_data (raw bytes) or report_data_hex (hex-encoded)
    2. EKM mode: TLS session binding via EKM
       - Provide nonce_hex (64-character hex string)
       - EKM is extracted from TLS session via Nginx header
    """

    try:
        logger.info("TDX quote with report data requested")

        # Determine which mode to use based on provided fields
        if data.nonce_hex is not None:
            # This header is forwarded by Nginx (or other proxies that terminates TLS) with HMAC
            # signature.
            # Format: "{ekm_hex}:{hmac_hex}" where HMAC = HMAC-SHA256(ekm_hex, EKM_SHARED_SECRET)
            # The signature is validated before trusting the EKM value to prevent header forgery.
            # In order for this to work, the entity sending the header (e.g., Nginx) and this
            # service must run in the same trusted execution environment (TLS terminated inside
            # the TEE).
            ekm_header = request.headers.get(HEADER_TLS_EKM_CHANNEL_BINDING)

            if not ekm_header:
                logger.error("Missing EKM header for TLS session binding")
                raise HTTPException(
                    status_code=400,
                    detail="Missing EKM header",
                )

            # Get shared secret and validate HMAC
            if not EKM_SHARED_SECRET:
                logger.error("EKM_SHARED_SECRET not configured")
                raise HTTPException(
                    status_code=500,
                    detail="Server configuration error",
                )

            try:
                ekm_hex = validate_and_extract_ekm(ekm_header, EKM_SHARED_SECRET)
            except ValueError as e:
                logger.error(f"EKM validation failed: {e}")
                raise HTTPException(
                    status_code=403,
                    detail="Invalid EKM header signature",
                )

            if len(data.nonce_hex) != 64:
                raise HTTPException(
                    status_code=400,
                    detail="nonce_hex must be exactly 64 hex characters (32 bytes)",
                )

            logger.info("TDX quote requested using EKM session binding")
            try:
                report_data = compute_report_data(data.nonce_hex, ekm_hex)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid hex encoding: {e}")

        elif data.report_data_hex is not None and data.report_data is None:
            # Legacy mode: hex-encoded report_data
            logger.info("TDX quote requested using legacy report_data_hex")
            try:
                report_data = bytes.fromhex(data.report_data_hex)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid hex encoding: {e}")

        elif data.report_data is not None and data.report_data_hex is None:
            # Legacy mode: raw report_data
            logger.info("TDX quote requested using legacy report_data")
            report_data = data.report_data

        else:
            raise RequestValidationError(
                "Exactly one of nonce_hex, report_data_hex, or report_data must be provided"
            )
        # Instantiate dstack client before use
        dstack_client = DstackClient()
        quote = dstack_client.get_quote(report_data)
        tcb_info = dstack_client.info().tcb_info

        logger.info("Successfully obtained TDX quote")

        return QuoteResponse(
            success=True,
            quote=quote,
            tcb_info=tcb_info,
            timestamp=str(int(time.time())),
            quote_type="tdx",
        )

    except Exception as e:
        logger.error(f"Failed to get TDX quote: {e}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(e), "quote_type": "tdx"},
        )
