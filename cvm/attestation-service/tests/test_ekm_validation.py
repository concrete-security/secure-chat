"""
Unit tests for EKM HMAC validation functionality.

Tests the validate_and_extract_ekm function that validates
HMAC signatures on EKM headers to prevent forgery attacks.
"""

import hashlib
import hmac
import os
import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set required environment variable before importing
os.environ["EKM_SHARED_SECRET"] = "test_shared_secret_for_ekm_validation_min_32_chars"

from attestation_service import validate_and_extract_ekm


class TestEKMValidation:
    """Test EKM HMAC validation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.secret = "test_shared_secret_for_ekm_validation_min_32_chars"
        self.ekm_hex = "a" * 64  # Valid 64-character hex string

    def _create_signed_header(self, ekm_hex: str, secret: str) -> str:
        """Helper to create a properly signed EKM header."""
        hmac_value = hmac.new(
            secret.encode("utf-8"), bytes.fromhex(ekm_hex), hashlib.sha256
        ).hexdigest()
        return f"{ekm_hex}:{hmac_value}"

    def test_validate_valid_signature(self):
        """Test validation of correctly signed headers with various EKM values."""
        test_ekms = [
            "a" * 64,
            "0" * 64,
            "f" * 64,
            "0123456789abcdef" * 4,
            "ABCDEF" * 10 + "ABCD",  # uppercase
            "aAbBcCdDeEfF0123456789" * 2 + "aAbBcCdDeEfF01234567",  # mixed case
        ]

        for ekm in test_ekms:
            signed_header = self._create_signed_header(ekm, self.secret)
            result = validate_and_extract_ekm(signed_header, self.secret)
            assert result == ekm

    def test_validate_wrong_secret(self):
        """Test that validation fails with wrong secret."""
        signed_header = self._create_signed_header(self.ekm_hex, self.secret)

        with pytest.raises(ValueError, match="HMAC validation failed"):
            validate_and_extract_ekm(signed_header, "wrong_secret")

    def test_validate_tampered_data(self):
        """Test that validation fails if EKM or HMAC is tampered with."""
        signed_header = self._create_signed_header(self.ekm_hex, self.secret)

        # Tamper with EKM
        tampered_ekm = "b" + signed_header[1:]
        with pytest.raises(ValueError, match="HMAC validation failed"):
            validate_and_extract_ekm(tampered_ekm, self.secret)

        # Tamper with HMAC
        parts = signed_header.split(":")
        tampered_hmac = f"{parts[0]}:0{parts[1][1:]}"
        with pytest.raises(ValueError, match="HMAC validation failed"):
            validate_and_extract_ekm(tampered_hmac, self.secret)

    def test_validate_invalid_format(self):
        """Test validation fails with invalid header format."""
        test_cases = [
            ("a" * 129, "no separator"),
            ("a" * 60 + ":" + "b" * 68, "wrong separator position"),
            ("a" * 64 + ":" + "b" * 60, "too short"),
            ("a" * 64 + ":" + "b" * 68, "too long"),
        ]

        for invalid_header, _description in test_cases:
            with pytest.raises(ValueError, match="Invalid EKM header format"):
                validate_and_extract_ekm(invalid_header, self.secret)

    def test_validate_different_secrets(self):
        """Test that different secrets produce different signatures."""
        secret1 = "secret_one_with_minimum_length_32"
        secret2 = "secret_two_with_minimum_length_32"

        signed1 = self._create_signed_header(self.ekm_hex, secret1)
        signed2 = self._create_signed_header(self.ekm_hex, secret2)

        # Each validates with its own secret
        assert validate_and_extract_ekm(signed1, secret1) == self.ekm_hex
        assert validate_and_extract_ekm(signed2, secret2) == self.ekm_hex

        # But not with the other secret
        with pytest.raises(ValueError, match="HMAC validation failed"):
            validate_and_extract_ekm(signed1, secret2)

    def test_validate_special_secrets(self):
        """Test validation with special and unicode characters in secret."""
        test_secrets = [
            "",
            "test!@#$%^&*()_+-=[]{}|;:,.<>?/~`",
            "test_secret_with_émojis_🔒_and_中文",
        ]

        for secret in test_secrets:
            signed_header = self._create_signed_header(self.ekm_hex, secret)
            result = validate_and_extract_ekm(signed_header, secret)
            assert result == self.ekm_hex

    def test_validate_deterministic_and_replayable(self):
        """Test that validation is deterministic and allows replays."""
        signed_header = self._create_signed_header(self.ekm_hex, self.secret)

        # Should produce same result multiple times
        results = [validate_and_extract_ekm(signed_header, self.secret) for _ in range(3)]
        assert all(r == self.ekm_hex for r in results)

    def test_validate_timing_safety(self):
        """Test that invalid HMACs fail regardless of difference position."""
        signed_header = self._create_signed_header(self.ekm_hex, self.secret)
        parts = signed_header.split(":")
        base_hmac = parts[1]

        # Both first and last character modifications should fail
        for wrong_hmac in ["0" + base_hmac[1:], base_hmac[:-1] + "0"]:
            with pytest.raises(ValueError, match="HMAC validation failed"):
                validate_and_extract_ekm(f"{parts[0]}:{wrong_hmac}", self.secret)
