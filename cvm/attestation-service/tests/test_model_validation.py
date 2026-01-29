"""Tests for QuoteRequest model validation."""

import pytest
from pydantic import ValidationError

from attestation_service import QuoteRequest


def test_valid_nonce_hex():
    """Test that a valid 64-char hex string is accepted."""
    valid_nonce = "a" * 64
    request = QuoteRequest(nonce_hex=valid_nonce)
    assert request.nonce_hex == valid_nonce


def test_nonce_hex_too_short():
    """Test that a nonce shorter than 64 chars is rejected."""
    with pytest.raises(ValidationError) as exc_info:
        QuoteRequest(nonce_hex="abc123")

    assert "nonce_hex must be exactly 64 characters" in str(exc_info.value)


def test_nonce_hex_too_long():
    """Test that a nonce longer than 64 chars is rejected."""
    with pytest.raises(ValidationError) as exc_info:
        QuoteRequest(nonce_hex="a" * 65)

    assert "nonce_hex must be exactly 64 characters" in str(exc_info.value)


def test_nonce_hex_invalid_characters():
    """Test that non-hex characters are rejected."""
    with pytest.raises(ValidationError) as exc_info:
        QuoteRequest(nonce_hex="g" * 64)

    assert "must be a valid hexadecimal string" in str(exc_info.value)
