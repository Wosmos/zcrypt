#!/bin/bash
# Build the Next.js frontend as a static export for Tauri.
# Output goes to app/desktop/frontend-dist/
# Marketing/public pages are stripped — desktop only needs auth + app pages.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"
OUT_DIR="$SCRIPT_DIR/frontend-dist"

echo "[zcrypt-desktop] Building frontend..."

cd "$FRONTEND_DIR"

# Guard: if .next exists and isn't writable, the build will fail
if [ -d ".next" ] && ! [ -w ".next" ]; then
  echo "ERROR: .next/ exists but isn't writable (owned by root?)."
  echo "Fix with: sudo rm -rf $(pwd)/.next"
  exit 1
fi

# Clean previous export cache
rm -rf .next-export

# Build with static export enabled via env var.
# The desktop app has no Next.js rewrites, so the backend URL must be baked in.
# Resolution order: NEXT_PUBLIC_API_URL env → DESKTOP_API_URL env →
# scripts/desktop.env (LOCAL, gitignored — copy scripts/desktop.env.example).
# No default is baked into the repo: the live host rotates with Railway
# accounts, and CI reads the DESKTOP_API_URL repository variable instead.
DESKTOP_ENV="$SCRIPT_DIR/../../scripts/desktop.env"
if [ -z "${NEXT_PUBLIC_API_URL:-}" ]; then
  [ -f "$DESKTOP_ENV" ] && source "$DESKTOP_ENV"
  NEXT_PUBLIC_API_URL="${DESKTOP_API_URL:-}"
fi
if [ -z "$NEXT_PUBLIC_API_URL" ]; then
  echo "ERROR: no backend origin. Set NEXT_PUBLIC_API_URL (or DESKTOP_API_URL), or create scripts/desktop.env from scripts/desktop.env.example." >&2
  exit 1
fi
echo "baking backend origin: $NEXT_PUBLIC_API_URL"
NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
  NEXT_OUTPUT_EXPORT=1 bun run build

# Copy the static export to desktop's frontend-dist.
# next.config.ts sets output:"export" + distDir:".next-export", which keeps the
# build out of the dev .next cache AND writes the static HTML directly into
# .next-export (there is no nested out/ — the distDir is the export root).
rm -rf "$OUT_DIR"
cp -r "$FRONTEND_DIR/.next-export" "$OUT_DIR"

# ── Strip pages that don't belong in the desktop app ──
# Marketing / public pages
rm -rf "$OUT_DIR/docs" "$OUT_DIR/philosophy" "$OUT_DIR/privacy" \
       "$OUT_DIR/terms" "$OUT_DIR/tui" "$OUT_DIR/pricing"
# Public share/send/pad/transfer/demo pages
rm -rf "$OUT_DIR/pad" "$OUT_DIR/s" "$OUT_DIR/send" \
       "$OUT_DIR/transfer" "$OUT_DIR/demo"
# SEO artifacts useless in desktop
rm -f "$OUT_DIR/sitemap.xml" "$OUT_DIR/robots.txt" \
      "$OUT_DIR/opengraph-image"* "$OUT_DIR/twitter-image"*

# Replace root index.html with a redirect to /login
# (the marketing landing page makes no sense in the desktop app)
cat > "$OUT_DIR/index.html" << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0;url=/login"></head>
<body></body>
</html>
HTMLEOF

echo "[zcrypt-desktop] Frontend built → $OUT_DIR (marketing pages stripped)"
