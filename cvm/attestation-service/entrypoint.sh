#!/bin/bash
set -e

HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8080}
# Keep it to 1 if you want replication at the container orchestration level
WORKERS=${WORKERS:-1}
# Allow specifying which service script to run (default: production)
SERVICE_SCRIPT=${SERVICE_SCRIPT:-attestation_service.py}

echo "Starting Attestation Service..."
echo "Host: ${HOST}"
echo "Port: ${PORT}"
echo "Workers: ${WORKERS}"
echo "Script: ${SERVICE_SCRIPT}"

exec uv run fastapi run ${SERVICE_SCRIPT} \
        --host ${HOST} \
        --port ${PORT} \
        --workers ${WORKERS} \
        --proxy-headers
