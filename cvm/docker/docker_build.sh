#!/bin/bash
set -e

# --- Configurations ---
NO_CACHE=false
FINAL_IMAGE_NAME="vllm_proxy_img"
DOCKERFILE_NAME="docker/Dockerfile"   # default CPU
DOCKERFILE_LOCATION="."
CLIENT_IMAGE_NAME="vllm_client_img"
USE_GPU=${GPU:-${USE_GPU:-}}

# --- Parse arguments ---
for arg in "$@"; do
    case "$arg" in
        --no-cache)
            NO_CACHE=true
            ;;
        *)
            echo "❌ Unknown argument: $arg"
            echo "Usage: ./build.sh [--no-cache]"
            exit 1
            ;;
    esac
done

# --- Cleanup containers/images ---
echo "🧹 Cleaning up existing containers..."
if [[ "$NO_CACHE" == true ]]; then
    echo "⚠️  Cache is disabled! Performing a full cleanup..."
    # docker compose down --rmi all || true
    docker system prune -a -f || true
else
    echo "🔁 Cache is enabled. Performing standard cleanup..."
    # docker compose down || true
fi

# --- Build the Docker image ---
# --- Select Dockerfile (GPU vs CPU) ---

# --- Load build-time variables (.env + shell) ---
if [[ -f .env ]]; then
    set -o allexport
    source .env
    set +o allexport
fi

BUILD_ARGS=()
if [[ -n "${MODEL_ID:-}" ]]; then
    echo "Baking model into image: ${MODEL_ID}"
    BUILD_ARGS+=(--build-arg MODEL_ID="${MODEL_ID}")
fi
if [[ -n "${MODEL_REVISION:-}" ]]; then
    BUILD_ARGS+=(--build-arg MODEL_REVISION="${MODEL_REVISION}")
fi
if [[ -n "${MODEL_DIRNAME:-}" ]]; then
    BUILD_ARGS+=(--build-arg MODEL_DIRNAME="${MODEL_DIRNAME}")
fi
if [[ -n "${INSTALL_FLASH_ATTN:-}" ]]; then
    BUILD_ARGS+=(--build-arg INSTALL_FLASH_ATTN="${INSTALL_FLASH_ATTN}")
fi

# Forward vLLM/runtime tuning knobs so the Dockerfile picks them up as defaults.
VLLM_BUILD_ARGS=(
    VLLM_TARGET_DEVICE
    VLLM_USE_V1
    VLLM_ASYNC_SCHEDULING
    VLLM_NO_ENABLE_PREFIX_CACHING
    VLLM_CUDA_GRAPH_SIZES
    VLLM_TENSOR_PARALLEL_SIZE
    VLLM_GPU_MEMORY_UTILIZATION
    VLLM_MAX_MODEL_LEN
    VLLM_MAX_NUM_SEQS
    VLLM_MAX_NUM_BATCHED_TOKENS
    MODEL_STORAGE_DIR
    VERIFY_DIR
    QUOTE_PATH
)

for var in "${VLLM_BUILD_ARGS[@]}"; do
    value=${!var:-}
    if [[ -n "$value" ]]; then
        BUILD_ARGS+=(--build-arg "${var}=${value}")
    fi
done
SECRET_ARGS=()
if [[ -n "${HF_TOKEN:-}" ]]; then
    echo "🔐 Using provided HF_TOKEN for build (forwarded as BuildKit secret)."
    SECRET_ARGS+=(--secret id=hf_token,env=HF_TOKEN)
fi

if [[ -z "$USE_GPU" ]]; then
    if command -v nvidia-smi >/dev/null 2>&1; then
        echo "🧠 Detected NVIDIA GPU on build host; selecting GPU Dockerfile"
        DOCKERFILE_NAME="docker/Dockerfile.h100"
    else
        echo "ℹ️  No GPU detected; using CPU Dockerfile"
    fi
else
    if [[ "$USE_GPU" == "1" || "$USE_GPU" == "true" || "$USE_GPU" == "yes" ]]; then
        DOCKERFILE_NAME="docker/Dockerfile.h100"
        echo "✅ USE_GPU is set; forcing GPU Dockerfile"
    else
        echo "✅ USE_GPU=$USE_GPU provided; using CPU Dockerfile"
    fi
fi

echo "🔨 Building the image '$FINAL_IMAGE_NAME' with $DOCKERFILE_NAME..."
if [[ "$NO_CACHE" == true ]]; then
    docker build \
        --no-cache \
        "${BUILD_ARGS[@]}" \
        "${SECRET_ARGS[@]}" \
        -t "$FINAL_IMAGE_NAME:latest" \
        -f "$DOCKERFILE_NAME" "$DOCKERFILE_LOCATION"
else
    docker build \
        "${BUILD_ARGS[@]}" \
        "${SECRET_ARGS[@]}" \
        -t "$FINAL_IMAGE_NAME:latest" \
        -f "$DOCKERFILE_NAME" "$DOCKERFILE_LOCATION"
fi

echo "✅ Image '$FINAL_IMAGE_NAME' built successfully."
docker images | grep "$FINAL_IMAGE_NAME"

echo "🔨 Building the UI client image '$CLIENT_IMAGE_NAME'..."
if [[ "$NO_CACHE" == true ]]; then
    docker build \
        --no-cache \
        -t "$CLIENT_IMAGE_NAME:latest" \
        -f docker/Dockerfile.client "$DOCKERFILE_LOCATION"
else
    docker build \
        -t "$CLIENT_IMAGE_NAME:latest" \
        -f docker/Dockerfile.client "$DOCKERFILE_LOCATION"
fi

echo "✅ Image '$CLIENT_IMAGE_NAME' built successfully."
docker images | grep "$CLIENT_IMAGE_NAME"
