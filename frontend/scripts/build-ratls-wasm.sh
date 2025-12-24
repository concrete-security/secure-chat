#!/bin/bash
# Build ratls-wasm from a pinned commit of the ratls repository
# and copy the essential files to lib/ratls-wasm/
#
# SECURITY: This script pins to a specific commit hash to ensure
# reproducible builds and prevent supply chain attacks.
#
# Prerequisites:
#   - wasm-pack (cargo install wasm-pack)
#   - Rust toolchain with wasm32-unknown-unknown target
#   - On macOS: LLVM (brew install llvm)
#
# To update the WASM module:
#   1. Review the changes in the ratls repository
#   2. Update COMMIT_HASH below to the new commit
#   3. Run this script to rebuild
#   4. Update EXPECTED_WASM_HASH in lib/ratls-client.ts with the new hash
#      (Use: shasum -a 384 lib/ratls-wasm/ratls_wasm_bg.wasm | awk '{print $1}')

set -e

REPO_URL="https://github.com/concrete-security/ratls.git"
# SECURITY: Pin to specific commit hash for reproducible builds
# Last reviewed: 2026-01-19
# Branch at time of pinning: new-core
COMMIT_HASH="3403fc95a2bc4e52973a32bd9b9d5fc07819e499"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$FRONTEND_DIR/lib/ratls-wasm"
TEMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Building ratls-wasm ==="
echo "Source: $REPO_URL"
echo "Commit: $COMMIT_HASH"
echo "Output: $OUTPUT_DIR"
echo ""

echo "Cloning ratls repository..."
git clone "$REPO_URL" "$TEMP_DIR/ratls"

echo "Checking out pinned commit..."
cd "$TEMP_DIR/ratls"
git checkout "$COMMIT_HASH"

# Verify we're on the expected commit
ACTUAL_COMMIT=$(git rev-parse HEAD)
if [ "$ACTUAL_COMMIT" != "$COMMIT_HASH" ]; then
    echo "ERROR: Commit hash mismatch!"
    echo "  Expected: $COMMIT_HASH"
    echo "  Actual:   $ACTUAL_COMMIT"
    exit 1
fi
echo "Verified commit: $ACTUAL_COMMIT"

echo "Building WASM (this may take a minute)..."
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

echo ""
echo "=== IMPORTANT: Update WASM Integrity Hash ==="
WASM_HASH=$(shasum -a 384 "$OUTPUT_DIR/ratls_wasm_bg.wasm" | awk '{print $1}')
echo "New WASM SHA-384 hash: $WASM_HASH"
echo ""
echo "Update EXPECTED_WASM_HASH in lib/ratls-client.ts:"
echo "  const EXPECTED_WASM_HASH = \"$WASM_HASH\""
