"""
Attestation Service

Provides TDX attestation endpoints using the dstack_sdk.
"""

import asyncio
import hashlib
import hmac
import logging
import os
import secrets
import time
import tomllib
from contextlib import asynccontextmanager
from typing import Optional

from dstack_sdk import AsyncDstackClient, GetQuoteResponse
from dstack_sdk.dstack_client import TcbInfoV05x
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, field_validator

HEADER_TLS_EKM_CHANNEL_BINDING = "X-TLS-EKM-Channel-Binding"

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Global async dstack client (initialized at startup)
dstack_client: Optional[AsyncDstackClient] = None


class QuoteRequest(BaseModel):
    nonce_hex: str

    @field_validator("nonce_hex")
    @classmethod
    def validate_nonce_hex(cls, v: str) -> str:
        """Validate that nonce_hex is a 64-character hex string (32 bytes)."""
        if len(v) != 64:
            raise ValueError("nonce_hex must be exactly 64 characters (32 bytes)")
        try:
            bytes.fromhex(v)
        except ValueError:
            raise ValueError("nonce_hex must be a valid hexadecimal string")
        return v


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI app.
    Initializes and cleans up the async dstack client.
    """
    global dstack_client

    logger.info("Initializing async dstack client...")
    try:
        dstack_client = AsyncDstackClient()
    except Exception as e:
        # This will cause HTTP 500 errors when getting quotes,
        # but allows the app to start for testing the service in a non-TEE environment
        logger.error(f"Failed to initialize dstack client: {e}")

    yield

    logger.info("Shutting down async dstack client...")
    dstack_client = None


# Initialize FastAPI app
app = FastAPI(
    title="Attestation Service",
    description="TDX attestation endpoints using dstack_sdk",
    version=tomllib.load(open("pyproject.toml", "rb"))["project"]["version"],
    lifespan=lifespan,
)


def _get_ekm_hmac_secret() -> str:
    """Derive EKM HMAC key from TEE, falling back to env var for dev/test."""
    try:
        from dstack_sdk import DstackClient

        client = DstackClient()
        derived = client.get_key("ekm/hmac-key/v1").decode_key().hex()
        logger.info("EKM HMAC key derived from TEE (dstack)")
        return derived
    except Exception as e:
        logger.warning(
            f"dstack key derivation failed ({e}), falling back to EKM_SHARED_SECRET env var"
        )
        env_secret = os.getenv("EKM_SHARED_SECRET")
        if not env_secret:
            logger.error("EKM_SHARED_SECRET not set - EKM headers will not be validated!")
            raise RuntimeError("EKM_SHARED_SECRET not set")
        if len(env_secret) < 32:
            logger.error("EKM_SHARED_SECRET is too short (minimum 32 characters recommended)")
            raise RuntimeError("EKM_SHARED_SECRET is too short")
        logger.info("EKM validation enabled with shared secret")
        return env_secret


EKM_SHARED_SECRET = _get_ekm_hmac_secret()


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


@app.post("/tdx_quote", response_model=QuoteResponse)
async def post_tdx_quote(request: Request, data: QuoteRequest):
    """
    Get TDX quote with report data.
    """

    logger.info("TDX quote with report data requested")

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

    logger.info("TDX quote requested using EKM session binding")
    try:
        report_data = compute_report_data(data.nonce_hex, ekm_hex)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid hex encoding: {e}")

    # Use the shared async dstack client
    if dstack_client is None:
        logger.error("Dstack client not initialized")
        raise HTTPException(
            status_code=500,
            detail="Server not ready",
        )

    try:
        # Run both operations concurrently for better performance
        quote, info_response = await asyncio.gather(
            dstack_client.get_quote(report_data), dstack_client.info()
        )
        tcb_info = info_response.tcb_info

        logger.info("Successfully obtained TDX quote")
    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        logger.exception(f"Error obtaining TDX quote or TCB info: {error_msg}", stack_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to obtain TDX quote or TCB info",
                "quote_type": "tdx",
            },
        )

    return QuoteResponse(
        success=True,
        quote=quote,
        tcb_info=tcb_info,
        timestamp=str(int(time.time())),
        quote_type="tdx",
    )
