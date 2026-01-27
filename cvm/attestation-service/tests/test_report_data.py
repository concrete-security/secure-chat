"""
Unit tests for EKM session binding via report_data functionality.

Tests the compute_report_data function.
"""

import hashlib
import os
import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ["EKM_SHARED_SECRET"] = "test_shared_secret_for_ekm_validation_min_32_chars"

from attestation_service import compute_report_data


class TestEKMComputation:
    """Test EKM report_data computation."""

    def test_compute_ekm_report_data_basic(self):
        """Test basic EKM computation with valid inputs."""
        nonce_hex = "a" * 64  # 32 bytes
        ekm_hex = "b" * 64  # 32 bytes

        result = compute_report_data(nonce_hex, ekm_hex)

        # Verify result is 64 bytes (SHA512 output)
        assert len(result) == 64
        assert isinstance(result, bytes)

    def test_compute_ekm_report_data_deterministic(self):
        """Test that same inputs produce same output."""
        nonce_hex = "0123456789abcdef" * 4  # 32 bytes
        ekm_hex = "fedcba9876543210" * 4  # 32 bytes

        result1 = compute_report_data(nonce_hex, ekm_hex)
        result2 = compute_report_data(nonce_hex, ekm_hex)

        assert result1 == result2

    def test_compute_ekm_report_data_correctness(self):
        """Test SHA512 computation correctness with known values."""
        nonce_hex = "00" * 32
        ekm_hex = "ff" * 32

        result = compute_report_data(nonce_hex, ekm_hex)

        # Manually compute expected result
        nonce = bytes.fromhex(nonce_hex)
        ekm = bytes.fromhex(ekm_hex)
        expected = hashlib.sha512(nonce + ekm).digest()

        assert result == expected

    def test_compute_ekm_report_data_different_inputs(self):
        """Test that different inputs produce different outputs."""
        nonce1 = "a" * 64
        nonce2 = "b" * 64
        ekm = "c" * 64

        result1 = compute_report_data(nonce1, ekm)
        result2 = compute_report_data(nonce2, ekm)

        assert result1 != result2

    def test_compute_ekm_report_data_invalid_nonce_hex(self):
        """Test error handling for invalid nonce hex."""
        nonce_hex = "zzzz" * 16  # Invalid hex characters
        ekm_hex = "a" * 64

        with pytest.raises(ValueError):
            compute_report_data(nonce_hex, ekm_hex)

    def test_compute_ekm_report_data_invalid_ekm_hex(self):
        """Test error handling for invalid EKM hex."""
        nonce_hex = "a" * 64
        ekm_hex = "xyz" * 21 + "x"  # Invalid hex characters

        with pytest.raises(ValueError):
            compute_report_data(nonce_hex, ekm_hex)

    def test_compute_ekm_report_data_odd_length_hex(self):
        """Test error handling for odd-length hex strings."""
        nonce_hex = "a" * 63  # Odd length
        ekm_hex = "b" * 64

        with pytest.raises(ValueError):
            compute_report_data(nonce_hex, ekm_hex)

    def test_compute_ekm_report_data_case_insensitive(self):
        """Test that hex parsing is case-insensitive."""
        nonce_upper = "ABCDEF" * 10 + "ABCD"  # 32 bytes
        nonce_lower = "abcdef" * 10 + "abcd"  # 32 bytes
        ekm_hex = "0" * 64

        result_upper = compute_report_data(nonce_upper, ekm_hex)
        result_lower = compute_report_data(nonce_lower, ekm_hex)

        assert result_upper == result_lower

    def test_compute_ekm_report_data_all_zeros(self):
        """Test with all-zero inputs."""
        nonce_hex = "0" * 64
        ekm_hex = "0" * 64

        result = compute_report_data(nonce_hex, ekm_hex)

        # Verify it produces valid output
        assert len(result) == 64
        assert result == hashlib.sha512(b"\x00" * 64).digest()

    def test_compute_ekm_report_data_all_ones(self):
        """Test with all-ones inputs."""
        nonce_hex = "f" * 64
        ekm_hex = "f" * 64

        result = compute_report_data(nonce_hex, ekm_hex)

        # Verify it produces valid output
        assert len(result) == 64
        assert result == hashlib.sha512(b"\xff" * 64).digest()

    def test_compute_ekm_report_data_mixed_case(self):
        """Test with mixed case hex strings."""
        nonce_hex = "aAbBcCdDeEfF" * 5 + "aAbB"  # 32 bytes, mixed case
        ekm_hex = "0123456789ABCDEF" * 4  # 32 bytes

        result = compute_report_data(nonce_hex, ekm_hex)

        assert len(result) == 64
