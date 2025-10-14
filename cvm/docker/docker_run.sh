#!/bin/bash
set -e

MODE=${1:-"prod"}
WITH_VLLM_PROXY=${2:-"false"}
ENV_FILE=".env_${MODE}"

SERVICE_LIST=("proxy_api_service")
CONTAINER_LIST=("proxy_api_container")

if [[ "$WITH_VLLM_PROXY" == "true" ]]; then
    CONTAINER_LIST+=("vllm_container")
    SERVICE_LIST+=("vllm_service")
fi

echo "Running in mode: $MODE"
echo "With vLLM proxy: $WITH_VLLM_PROXY"
echo "Detected platform: $OSTYPE"
echo "Env file: $ENV_FILE"
echo "Containers to handle: ${CONTAINER_LIST[*]}"
echo "Services to handle: ${SERVICE_LIST[*]}"

# Load .env
if [[ -f "$ENV_FILE" ]]; then
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
fi

# --- Stop / Remove existing containers ---
echo "🛑 Shutting down running containers..."
for container in "${CONTAINER_LIST[@]}"; do
    echo "Checking container: $container"
    if docker ps -a --format '{{.Names}}' | grep -q "$container"; then
        echo "🛑 Stopping container: $container"
        docker stop "$container" >/dev/null 2>&1 || true
        echo "🗑️  Removing container: $container"
        docker rm "$container" >/dev/null 2>&1 || true
    else
        echo "[ERROR] Container $container not found, skipping."
    fi
done

echo "🏗️  Building images ${SERVICE_LIST[*]}..."
docker compose --env-file "$ENV_FILE" build "${SERVICE_LIST[@]}"


# --- Restart containers via docker compose ---
echo "🚀 Starting containers..."
docker compose --env-file "$ENV_FILE" up -d --force-recreate "${SERVICE_LIST[@]}"

# --- Show logs ---
echo "📜 Showing live logs..."
docker compose logs -f
