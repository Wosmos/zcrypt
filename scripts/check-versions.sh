#!/usr/bin/env bash
# Fails when the app version drifts between the files that each carry it.
# tauri.conf.json is the release version (installers and the updater read it);
# the desktop crate and the frontend package must match it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

conf="$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' "$root/app/desktop/src-tauri/tauri.conf.json" | head -1)"
crate="$(sed -nE 's/^version[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$root/app/desktop/src-tauri/Cargo.toml" | head -1)"
web="$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*/\1/p' "$root/app/frontend/package.json" | head -1)"

echo "tauri.conf.json:              ${conf:-missing}"
echo "desktop src-tauri/Cargo.toml: ${crate:-missing}"
echo "frontend package.json:        ${web:-missing}"

if [ -z "$conf" ] || [ "$conf" != "$crate" ] || [ "$conf" != "$web" ]; then
  echo "version drift: set all three to the same release version" >&2
  exit 1
fi
echo "versions in sync: $conf"
