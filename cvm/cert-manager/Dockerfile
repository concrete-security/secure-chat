# Combined Nginx and Certificate Manager Dockerfile

# nginx:1.29-alpine
# TODO: Update NGINX_VERSION if changing nginx image version.
# This stage is used to build the Nginx EKM module
FROM nginx@sha256:61e01287e546aac28a3f56839c136b31f590273f3b41187a36f46f6a03bbfe22 AS builder

# Define nginx version (must match runtime image)
ENV NGINX_VERSION=1.29.2

# Install build dependencies
RUN apk add --no-cache \
    gcc~=14.2 \
    musl-dev~=1.2 \
    make~=4.4 \
    openssl-dev~=3.5 \
    pcre2-dev~=10.46 \
    wget~=1.25

# Download nginx source matching the version
RUN wget --progress=dot:giga "http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" && \
    tar -xzvf nginx-${NGINX_VERSION}.tar.gz

# Copy module source
COPY ngx_http_ekm_module /nginx-${NGINX_VERSION}/ngx_http_ekm_module

WORKDIR /nginx-${NGINX_VERSION}

# Build module
RUN ./configure --with-compat \
    --add-dynamic-module=./ngx_http_ekm_module && \
    make modules


# nginx:1.29-alpine
# TODO: Update NGINX_VERSION if changing nginx image version.
FROM nginx@sha256:61e01287e546aac28a3f56839c136b31f590273f3b41187a36f46f6a03bbfe22

# Copy compiled Nginx EKM module from builder
COPY --from=builder /nginx-${NGINX_VERSION}/objs/ngx_http_ekm_module.so /usr/lib/nginx/modules/

# Load Nginx EKM module in main nginx.conf (must be at top level)
# Make EKM_SHARED_SECRET env variable available to nginx
RUN sed -i '1i load_module /usr/lib/nginx/modules/ngx_http_ekm_module.so;' /etc/nginx/nginx.conf && \
    sed -i '2i env EKM_SHARED_SECRET;' /etc/nginx/nginx.conf

# Test: verify that config is correct and that the module is loaded correctly
SHELL ["/bin/ash", "-o", "pipefail", "-c"]
RUN nginx -t && \
    nginx -T 2>&1 | grep -q "ngx_http_ekm_module" || exit 1

# ghcr.io/astral-sh/uv:0.9.5
COPY --from=ghcr.io/astral-sh/uv@sha256:f459f6f73a8c4ef5d69f4e6fbbdb8af751d6fa40ec34b39a1ab469acd6e289b7 /uv /uvx /bin/

EXPOSE 80 443

# Install supervisor
RUN apk add --no-cache supervisor~=4.2

# Create app directory
WORKDIR /app

# Install Python dependencies (uv sync needs src/)
COPY pyproject.toml /app/
COPY src/ /app/src/
COPY uv.lock /app/
RUN uv sync --locked --no-cache

# Copy app files
COPY entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh
COPY nginx_conf /app/nginx_conf
COPY proc_logger.py /app/

# Setup base nginx config
COPY nginx_conf/base.conf /etc/nginx/conf.d/default.conf

# Create supervisor configuration
RUN mkdir -p /etc/supervisor/conf.d
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create directories for certificates and ACME challenges
RUN mkdir -p /certs /acme-challenge /var/log/supervisor

# Ensure both nginx and cert manager processes are healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD (curl -f -k https://localhost/health || exit 1) && \
        (ls /etc/nginx/ssl/cert.pem /etc/nginx/ssl/key.pem || exit 1)

# Use supervisor to manage both nginx and cert manager processes
ENTRYPOINT ["/app/entrypoint.sh"]
