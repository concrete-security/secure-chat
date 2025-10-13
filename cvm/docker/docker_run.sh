#!/bin/bash
set -e

CONTAINER_LIST=("vllm_container")
MODE=${1:-"prod"}
ENV_FILE=".env_${MODE}"

echo "Detected plateform: $OSTYPE"
echo "Env file: $ENV_FILE"

# Load .env
if [[ -f "$ENV_FILE" ]]; then
    set -o allexport
    source "$ENV_FILE"
    set +o allexport
fi

# --- Stop / Remove existing containers ---
echo "🛑 Shutting down running containers..."
for container in "${CONTAINER_LIST[@]}"; do
    if docker ps -a --format '{{.Names}}' | grep -q "$container"; then
        echo "🛑 Stopping container: $container"
        docker stop "$container" >/dev/null 2>&1 || true
        echo "🗑️  Removing container: $container"
        docker rm "$container" >/dev/null 2>&1 || true
    else
        echo "[ERROR] Container $container not found, skipping."
    fi
done

# --- Restart containers via docker compose ---
echo "🚀 Starting containers..."
docker compose --env-file "$ENV_FILE" up -d --force-recreate

# --- Show logs ---
echo "📜 Showing live logs..."
docker compose logs -f
