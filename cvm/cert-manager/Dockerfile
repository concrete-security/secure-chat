# ghcr.io/astral-sh/uv:debian-slim
FROM ghcr.io/astral-sh/uv@sha256:2301babdaa11591889ea3933304912ba0814503fd89242819fdd8e7610d80c88

WORKDIR /app

# Install Python dependencies
COPY pyproject.toml /app/
COPY uv.lock /app/
RUN uv sync --locked --no-cache

COPY entrypoint.sh /app/
COPY cert_manager.py /app/
RUN chmod +x /app/entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD ls /certs/cert.pem /certs/key.pem || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
