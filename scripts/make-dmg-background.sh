#!/bin/bash
# Renders scripts/dmg-background.html into the macOS installer background
# (1x + 2x in one TIFF, so Finder picks the sharp one on Retina screens).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for s in 1 2; do
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=$s \
    --window-size=660,400 --screenshot="$tmp/bg-$s.png" "file://$root/scripts/dmg-background.html" >/dev/null 2>&1
done
tiffutil -cathidpicheck "$tmp/bg-1.png" "$tmp/bg-2.png" -out "$root/app/desktop/src-tauri/dmg/background.tiff" >/dev/null
echo "wrote app/desktop/src-tauri/dmg/background.tiff"
