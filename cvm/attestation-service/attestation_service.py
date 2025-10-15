"""
Attestation Service

Provides TDX attestation endpoints using the dstack_sdk.
"""

import time
import logging
from typing import Optional, Union

from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
from dstack_sdk import DstackClient, GetQuoteResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class ReportDataRequest(BaseModel):
    report_data: Union[str, bytes]


class HealthResponse(BaseModel):
    status: str
    service: str


class QuoteResponse(BaseModel):
    success: bool
    quote: Optional[GetQuoteResponse] = None
    timestamp: str
    quote_type: str
    error: Optional[str] = None


# Initialize FastAPI app
app = FastAPI(
    title="Attestation Service",
    description="TDX attestation endpoints using dstack_sdk",
    version="0.1.0",
)


def get_client_ip(request: Request) -> str:
    """Extract client IP from request headers"""
    # Check for forwarded headers first
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip

    # Fallback to direct client IP
    return request.client.host if request.client else "unknown"


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(status="healthy", service="attestation-service")


@app.post("/tdx_quote", response_model=QuoteResponse)
async def post_tdx_quote(request: Request, data: ReportDataRequest):
    """Get TDX quote with report data"""
    client_ip = get_client_ip(request)

    try:
        logger.info(f"TDX quote with report data requested from IP: {client_ip}")

        # Instantiate dstack client before use
        dstack_client = DstackClient()
        quote = dstack_client.get_quote(data.report_data)

        logger.info(f"Successfully obtained TDX quote for IP: {client_ip}")

        return QuoteResponse(
            success=True, quote=quote, timestamp=str(int(time.time())), quote_type="tdx"
        )

    except Exception as e:
        logger.error(f"Failed to get TDX quote for IP {client_ip}: {e}")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(e), "quote_type": "tdx"},
        )
