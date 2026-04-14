#!/bin/bash
# Build the Go sidecar binary for the current platform.
# The binary is placed where Tauri expects sidecars.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIDECAR_DIR="$SCRIPT_DIR/sidecar"
TAURI_DIR="$SCRIPT_DIR/src-tauri"

# Detect target triple
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) TARGET="aarch64-apple-darwin" ;;
      x86_64) TARGET="x86_64-apple-darwin" ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
      x86_64) TARGET="x86_64-unknown-linux-gnu" ;;
    esac
    ;;
esac

if [ -z "${TARGET:-}" ]; then
  echo "Unsupported platform: $OS/$ARCH"
  exit 1
fi

OUTPUT="$TAURI_DIR/zcrypt-sidecar-$TARGET"

echo "[zcrypt-desktop] Building sidecar for $TARGET..."

cd "$SIDECAR_DIR"
CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT" .

echo "[zcrypt-desktop] Sidecar built → $OUTPUT"
