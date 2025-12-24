#!/usr/bin/env bash
#
# RA-TLS Integration Test Script
#
# This script builds and runs the ratls-proxy with a simple echo server,
# then executes the Playwright RA-TLS integration tests.
#
# Usage:
#   ./scripts/test-ratls.sh
#
# Environment variables:
#   SKIP_PROXY_BUILD=1  - Skip building the proxy (use existing binary)
#   PROXY_PORT=9000     - Port for the WebSocket proxy (default: 9000)
#   ECHO_PORT=9001      - Port for the echo server (default: 9001)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
RATLS_DIR="$(dirname "$FRONTEND_DIR")/ratls"
PROXY_BINARY="$RATLS_DIR/target/release/ratls-proxy"

PROXY_PORT="${PROXY_PORT:-9000}"
ECHO_PORT="${ECHO_PORT:-9001}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up..."

    # Kill echo server if running
    if [ -n "$ECHO_PID" ] && kill -0 "$ECHO_PID" 2>/dev/null; then
        kill "$ECHO_PID" 2>/dev/null || true
        wait "$ECHO_PID" 2>/dev/null || true
    fi

    # Kill proxy if running
    if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" 2>/dev/null; then
        kill "$PROXY_PID" 2>/dev/null || true
        wait "$PROXY_PID" 2>/dev/null || true
    fi

    log_info "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Step 1: Build the proxy if needed
if [ "${SKIP_PROXY_BUILD:-0}" != "1" ]; then
    log_info "Building ratls-proxy..."
    if [ ! -d "$RATLS_DIR" ]; then
        log_error "ratls directory not found at $RATLS_DIR"
        exit 1
    fi

    cd "$RATLS_DIR"
    cargo build -p ratls-proxy --release
    cd "$FRONTEND_DIR"
else
    log_info "Skipping proxy build (SKIP_PROXY_BUILD=1)"
fi

if [ ! -f "$PROXY_BINARY" ]; then
    log_error "Proxy binary not found at $PROXY_BINARY"
    log_error "Run without SKIP_PROXY_BUILD=1 to build it"
    exit 1
fi

# Step 2: Start a simple echo server using Node.js
log_info "Starting echo server on port $ECHO_PORT..."

node -e "
const net = require('net');
const server = net.createServer((socket) => {
    socket.on('data', (data) => {
        socket.write(data);
    });
    socket.on('error', () => {});
});
server.listen($ECHO_PORT, '127.0.0.1', () => {
    console.log('Echo server listening on 127.0.0.1:$ECHO_PORT');
});
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
" &
ECHO_PID=$!

# Wait for echo server to be ready
sleep 1
if ! kill -0 "$ECHO_PID" 2>/dev/null; then
    log_error "Failed to start echo server"
    exit 1
fi

# Step 3: Start the proxy
log_info "Starting ratls-proxy on port $PROXY_PORT -> 127.0.0.1:$ECHO_PORT..."

RATLS_PROXY_LISTEN="127.0.0.1:$PROXY_PORT" \
RATLS_PROXY_TARGET="127.0.0.1:$ECHO_PORT" \
RATLS_PROXY_ALLOWLIST="127.0.0.1:$ECHO_PORT" \
"$PROXY_BINARY" &
PROXY_PID=$!

# Wait for proxy to be ready
sleep 1
if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    log_error "Failed to start proxy"
    exit 1
fi

log_info "Proxy started (PID: $PROXY_PID)"

# Step 4: Copy WASM if needed
if [ ! -d "$FRONTEND_DIR/ratls-wasm" ]; then
    log_info "Copying WASM package..."
    cp -r "$RATLS_DIR/wasm/pkg" "$FRONTEND_DIR/ratls-wasm"
fi

# Step 5: Run the tests
log_info "Running RA-TLS integration tests..."

cd "$FRONTEND_DIR"

RATLS_PROXY_RUNNING=1 \
NEXT_PUBLIC_RATLS_PROXY_URL="ws://127.0.0.1:$PROXY_PORT" \
pnpm playwright test ratls-integration --reporter=list

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "All tests passed!"
else
    log_error "Tests failed with exit code $TEST_EXIT_CODE"
fi

exit $TEST_EXIT_CODE
