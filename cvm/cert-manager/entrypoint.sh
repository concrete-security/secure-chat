#!/bin/bash
set -e

echo "Starting Certificate Manager..."
echo "Domain: ${DOMAIN}"
echo "Dev Mode: ${DEV_MODE}"

# Run the certificate manager
exec uv run /app/cert_manager.py
