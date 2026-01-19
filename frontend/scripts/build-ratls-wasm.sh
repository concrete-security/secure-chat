#!/bin/bash
# Build ratls-wasm from the main branch of the ratls repository
# and copy the essential files to lib/ratls-wasm/
#
# Prerequisites:
#   - wasm-pack (cargo install wasm-pack)
#   - Rust toolchain with wasm32-unknown-unknown target
#   - On macOS: LLVM (brew install llvm)

set -e

REPO_URL="https://github.com/concrete-security/ratls.git"
BRANCH="keep_tls_alive"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$FRONTEND_DIR/lib/ratls-wasm"
TEMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Building ratls-wasm ==="
echo "Source: $REPO_URL ($BRANCH)"
echo "Output: $OUTPUT_DIR"
echo ""

echo "Cloning ratls repository..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TEMP_DIR/ratls"

echo "Building WASM (this may take a minute)..."
cd "$TEMP_DIR/ratls"
make build-wasm

echo "Copying essential files..."
mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR"/*

# Copy only the essential files (exclude .gitignore, README.md, package.json)
cp wasm/pkg/ratls-fetch.js "$OUTPUT_DIR/"
cp wasm/pkg/ratls-fetch.d.ts "$OUTPUT_DIR/"
cp wasm/pkg/ratls_wasm.js "$OUTPUT_DIR/"
cp wasm/pkg/ratls_wasm.d.ts "$OUTPUT_DIR/"
cp wasm/pkg/ratls_wasm_bg.wasm "$OUTPUT_DIR/"
cp wasm/pkg/ratls_wasm_bg.wasm.d.ts "$OUTPUT_DIR/"

echo ""
echo "=== Done! ==="
echo "WASM files installed to: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
