#!/usr/bin/env python3
"""
Certificate Manager Service

Handles TLS certificate creation, renewal, and key management for the secure-chat CVM.
Supports multiple replicas by synchronizing them via an S3 bucket.
"""

import os
import sys
import time
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PrivateFormat,
    NoEncryption,
)
import schedule
from dstack_sdk import DstackClient

# Let's Encrypt / ACME imports
# from acme import client, messages, challenges, errors as acme_errors
# from acme.client import ClientV2
# import josepy as jose

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class CertificateManager:

    CERT_FILENAME = "cert.pem"
    KEY_FILENAME = "key.pem"
    CERT_EXPIRY_THRESHOLD_DAYS = 30  # Days before expiry to renew

    def __init__(self, domain: str, dev_mode: bool, cert_email: str, letsencrypt_staging: bool):
        self.domain = domain
        self.dev_mode = dev_mode
        self.cert_email = cert_email
        self.letsencrypt_staging = letsencrypt_staging

        self.cert_path = Path("/certs")

        # Ensure directories exist
        self.cert_path.mkdir(exist_ok=True)

        logger.info(f"Domain: {self.domain}, Dev mode: {self.dev_mode}")

    def get_deterministic_key_material(self, key_path: str) -> bytes:
        """Get deterministic key material using Phala dstack SDK.

        Same compose hash + path will always yield the same key.

        Args:
            key_path (str): Used as an identifier of the key.
        Returns:
            bytes: Deterministic key material (32 bytes).
        Raises:
            Exception: If unable to retrieve key material.
        """
        try:
            if self.dev_mode:
                logger.warning(
                    "Dev mode active: using fixed key material. Don't do this for production!"
                )
                return b"\x01" * 32

            # Initialize dstack client
            dstack_client = DstackClient()
            logger.info("dstack SDK initialized successfully")
            # Use dstack SDK to get deterministic 32-byte key material
            result = dstack_client.get_key(f"{key_path}")
            key_material = result.decode_key()  # 32 bytes from dstack
            logger.info(
                f"Retrieved deterministic key material from dstack for path: {key_path}"
            )
            return key_material

        except Exception as e:
            logger.error(f"Failed to get deterministic key material from dstack: {e}")
            raise

    def derive_ec_privatekey_from_key_material(
        self, key_material: bytes
    ) -> ec.EllipticCurvePrivateKey:
        """Derive EC private key from deterministic key material.

        Args:
            key_material (bytes): 32 bytes of key material.
        Returns:
            ec.EllipticCurvePrivateKey: Derived EC private key.
        """

        # TODO: check if this can lead to any problems
        return ec.derive_private_key(
            int.from_bytes(key_material, "big"), ec.SECP256R1()
        )

    def generate_deterministic_key(self, key_path: str) -> ec.EllipticCurvePrivateKey:
        """Generate deterministic EC key using Phala dstack SDK.

        Args:
            key_path (str): Used as an identifier of the key.
        Returns:
            ec.EllipticCurvePrivateKey: Deterministically generated EC private key.
        """
        # Get deterministic key material
        key_material = self.get_deterministic_key_material(key_path)

        # Derive EC key from the material
        return self.derive_ec_privatekey_from_key_material(key_material)

    def create_lets_encrypt_cert(
        self, private_key: ec.EllipticCurvePrivateKey
    ) -> x509.Certificate:
        """Create Let's Encrypt certificate using ACME protocol"""
        raise NotImplementedError

    def create_self_signed_cert(
        self, private_key: ec.EllipticCurvePrivateKey
    ) -> x509.Certificate:
        """Create self-signed certificate for development."""

        logger.info("Creating self-signed certificate for development")

        # Create certificate
        subject = issuer = x509.Name(
            [
                x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Concrete Security"),
                x509.NameAttribute(NameOID.COMMON_NAME, self.domain),
            ]
        )

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(private_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.now(timezone.utc))
            .not_valid_after(datetime.now(timezone.utc) + timedelta(days=365))
            .add_extension(
                x509.SubjectAlternativeName(
                    [
                        x509.DNSName(self.domain),
                        x509.DNSName(f"*.{self.domain}"),
                        x509.DNSName("localhost"),
                    ]
                ),
                critical=False,
            )
            .sign(private_key, hashes.SHA256())
        )
        logger.info("Self-signed certificate created successfully")

        return cert

    def save_certificate_and_key(
        self, cert: x509.Certificate, private_key: ec.EllipticCurvePrivateKey
    ):
        """Save certificate and private key to files.

        Args:
            cert (x509.Certificate): Certificate to save.
            private_key (ec.EllipticCurvePrivateKey): Private key to save.
        """
        cert_pem = cert.public_bytes(Encoding.PEM)

        # Save certificate
        cert_file = self.cert_path / self.CERT_FILENAME
        with open(cert_file, "wb") as f:
            f.write(cert_pem)

        logger.info(f"Certificate saved to {cert_file}")

        # Save private key
        key_pem = private_key.private_bytes(
            encoding=Encoding.PEM,
            format=PrivateFormat.PKCS8,
            encryption_algorithm=NoEncryption(),
        )

        key_file = self.cert_path / self.KEY_FILENAME
        with open(key_file, "wb") as f:
            f.write(key_pem)

        # Set secure permissions
        os.chmod(key_file, 0o600)
        logger.info(f"Private key saved to {key_file}")

    def is_cert_valid(self) -> bool:
        """Check if current certificate is valid.

        Checks if the cert and key files exist and if the cert is not expiring soon.
        """
        cert_file = self.cert_path / self.CERT_FILENAME
        key_file = self.cert_path / self.KEY_FILENAME

        if not cert_file.exists() or not key_file.exists():
            logger.info("Certificate or key files not found")
            return False

        try:
            with open(cert_file, "rb") as f:
                cert = x509.load_pem_x509_certificate(f.read())

            # Check if certificate expires within the defined threshold
            expiry_threshold = datetime.now(timezone.utc) + timedelta(
                days=self.CERT_EXPIRY_THRESHOLD_DAYS
            )
            if cert.not_valid_after_utc < expiry_threshold:
                logger.info(
                    f"Certificate expires on {cert.not_valid_after_utc}, renewal needed"
                )
                return False

            logger.info(f"Certificate valid until {cert.not_valid_after_utc}")
            return True

        # TODO: better error mgmt. Not all errors should lead to renewal
        except Exception as e:
            logger.error(f"Error checking certificate validity: {e}")
            return False

    def create_or_renew_certificate(self):
        """Create or renew TLS certificate"""

        logger.info("Starting certificate creation/renewal process")

        if self.dev_mode:  # Development mode: create self-signed certificate
            private_key = self.generate_deterministic_key(
                f"cert/debug/{self.domain}/v1"
            )
            cert = self.create_self_signed_cert(private_key)
            self.save_certificate_and_key(cert, private_key)
        # TODO: sync using S3 bucket for multiple replicas (in production)
        # We should have a lock file, then only one will push its generated cert, Others
        # will download it.
        # For now, we assume single instance.
        # See https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-s3-conditional-writes/
        else:  # Production mode: use Let's Encrypt
            # TODO: maybe add seed into the S3 bucket for more randomness and key rotation on every
            # cert renewal
            private_key = self.generate_deterministic_key(
                f"cert/letsencrypt/{self.domain}/v1"
            )
            cert = self.create_lets_encrypt_cert(private_key)
            self.save_certificate_and_key(cert, private_key)

        logger.info("Certificate management completed successfully")

    def manage_cert_creation_and_renewal(self):
        """Manage certificate creation and renewal process.

        Checks if the certificate is valid, and creates or renews it if necessary.
        """
        if not self.is_cert_valid():
            self.create_or_renew_certificate()

    def run(self):
        """Main run loop"""

        # Initial certificate creation/check
        try:
            self.manage_cert_creation_and_renewal()
        except Exception as e:
            logger.error(f"Initial certificate management failed: {e}")

        # Schedule periodic cert management (everyday at midnight)
        try:
            schedule.every().day.at("00:00").do(self.manage_cert_creation_and_renewal)
        except Exception as e:
            logger.error(f"Failed to schedule certificate management routine: {e}")

        # Main loop
        logger.info("Certificate manager running, checking for renewal every day")
        while True:
            try:
                schedule.run_pending()
            except Exception as e:
                logger.error(f"Failed while running scheduled tasks: {e}")

            time.sleep(3600 * 6)  # Check every 6 hours


if __name__ == "__main__":
    domain = os.getenv("DOMAIN", "localhost")
    dev_mode = os.getenv("DEV_MODE", "true").lower() == "true"
    cert_email = os.getenv("EMAIL", "admin@example.com")
    letsencrypt_staging = (
        os.getenv("LETSENCRYPT_STAGING", "false").lower() == "true"
    )
    manager = CertificateManager(
        domain=domain,
        dev_mode=dev_mode,
        cert_email=cert_email,
        letsencrypt_staging=letsencrypt_staging
    )
    try:
        manager.run()
    except KeyboardInterrupt:
        logger.info("Certificate manager stopped")
    except Exception as e:
        logger.error(f"Certificate manager error: {e}")
        sys.exit(1)
