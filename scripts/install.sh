#!/usr/bin/env bash
#
# zcrypt installer
# Usage: curl -fsSL https://zcrypt.cloud/install.sh | sh
#        curl -fsSL https://zcrypt.cloud/install.sh | sh -s -- --version 0.1.0
#
set -euo pipefail

REPO="Wosmos/zcrypt"
BINARY_NAME="zcrypt"
INSTALL_DIR="/usr/local/bin"

# Parse arguments
VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v) VERSION="$2"; shift 2 ;;
    --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Detect OS
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  mingw*|msys*|cygwin*) OS="windows" ;;
  *) echo "Error: Unsupported OS: $OS"; exit 1 ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Error: Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Resolve latest version if not specified
if [[ -z "$VERSION" ]]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -1 | sed -E 's/.*"v([^"]+)".*/\1/')"
  if [[ -z "$VERSION" ]]; then
    echo "Error: Could not determine latest version"
    exit 1
  fi
fi

echo "Installing zcrypt v${VERSION} (${OS}/${ARCH})"

# Construct download URL
EXT="tar.gz"
if [[ "$OS" == "windows" ]]; then
  EXT="zip"
fi
ARCHIVE="zcrypt_${VERSION}_${OS}_${ARCH}.${EXT}"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ARCHIVE}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/checksums.txt"

# Create temp directory
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Download
echo "Downloading ${URL}"
curl -fsSL -o "${TMP_DIR}/${ARCHIVE}" "$URL"
curl -fsSL -o "${TMP_DIR}/checksums.txt" "$CHECKSUM_URL"

# Verify checksum
echo "Verifying checksum..."
EXPECTED="$(grep "${ARCHIVE}" "${TMP_DIR}/checksums.txt" | awk '{print $1}')"
if command -v sha256sum &>/dev/null; then
  ACTUAL="$(sha256sum "${TMP_DIR}/${ARCHIVE}" | awk '{print $1}')"
elif command -v shasum &>/dev/null; then
  ACTUAL="$(shasum -a 256 "${TMP_DIR}/${ARCHIVE}" | awk '{print $1}')"
else
  echo "Warning: No sha256 tool found, skipping checksum verification"
  ACTUAL="$EXPECTED"
fi

if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "Error: Checksum mismatch!"
  echo "  Expected: $EXPECTED"
  echo "  Got:      $ACTUAL"
  exit 1
fi
echo "Checksum verified."

# Extract
mkdir -p "${TMP_DIR}/extract"
if [[ "$EXT" == "zip" ]]; then
  unzip -o "${TMP_DIR}/${ARCHIVE}" -d "${TMP_DIR}/extract"
else
  tar -xzf "${TMP_DIR}/${ARCHIVE}" -C "${TMP_DIR}/extract"
fi

# Install
BIN_NAME="$BINARY_NAME"
if [[ "$OS" == "windows" ]]; then
  BIN_NAME="${BINARY_NAME}.exe"
fi

if [[ -w "$INSTALL_DIR" ]]; then
  cp "${TMP_DIR}/extract/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  echo "Installed to ${INSTALL_DIR}/${BIN_NAME}"
elif command -v sudo &>/dev/null; then
  sudo cp "${TMP_DIR}/extract/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
  sudo chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  echo "Installed to ${INSTALL_DIR}/${BIN_NAME} (via sudo)"
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
  cp "${TMP_DIR}/extract/${BIN_NAME}" "${INSTALL_DIR}/${BIN_NAME}"
  chmod +x "${INSTALL_DIR}/${BIN_NAME}"
  echo "Installed to ${INSTALL_DIR}/${BIN_NAME}"
  echo ""
  echo "Make sure ${INSTALL_DIR} is in your PATH:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo ""
echo "zcrypt v${VERSION} installed successfully!"
echo "Run 'zcrypt --version' to verify."
