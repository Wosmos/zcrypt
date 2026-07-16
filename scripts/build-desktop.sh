#!/usr/bin/env bash
# Builds the macOS desktop app locally (mirrors the device.yml CI steps).
# Output: app/desktop/src-tauri/target/release/bundle/{macos/zcrypt.app,dmg/*.dmg}
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "== [1/5] remove web-only dynamic routes for static export =="
rm -rf app/frontend/app/s
rm -rf "app/frontend/app/pad/[token]"
rm -rf "app/frontend/app/send/[token]"
rm -rf "app/frontend/app/(app)/admin/users/[id]"

echo "== [2/5] build frontend static export =="
cd app/frontend
NEXT_OUTPUT_EXPORT=1 \
NEXT_TELEMETRY_DISABLED=1 \
NEXT_PUBLIC_API_URL="https://zcrypt-production-f608.up.railway.app" \
bun run build

echo "== [3/5] restore web-only routes from git (keep tree clean) =="
cd "$REPO"
git checkout -- app/frontend/app/s "app/frontend/app/pad/[token]" "app/frontend/app/send/[token]" "app/frontend/app/(app)/admin/users/[id]"

echo "== [4/5] prepare frontend-dist =="
rm -rf app/desktop/frontend-dist
cp -r app/frontend/.next-export app/desktop/frontend-dist
cd app/desktop/frontend-dist
rm -rf docs philosophy privacy terms tui pricing pad s send transfer demo features vs
rm -f sitemap.xml robots.txt opengraph-image* twitter-image*
cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0;url=/login"></head>
<body></body>
</html>
HTMLEOF

echo "== [5/5] cargo tauri build (release bundle) =="
cd "$REPO/app/desktop/src-tauri"
cargo tauri build

echo "== DONE. Bundle output: =="
find "$REPO/app/desktop/src-tauri/target/release/bundle" -name "*.dmg" -o -name "*.app" 2>/dev/null
