#!/usr/bin/env bash
# Build deploy/server/.env (the production server env) from app/backend/.env on
# this laptop, which already holds the live secrets.
#
#   deploy/server/make-env.sh <cloudflare-tunnel-token> [backend-public-url]
#
# MASTER_KEY and ZCRYPT_JWT_SECRET must stay exactly the same as before: stored
# platform tokens are encrypted with the master key and every session is signed
# with the JWT secret. Local-only settings (DEV_MODE, mock adapters, test
# databases, commented lines) are dropped, and the site origins are set to
# production (override with FRONTEND_URL / ALLOWED_ORIGINS in the environment).
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
src="$root/app/backend/.env"
out="$root/deploy/server/.env"
token="${1:?usage: make-env.sh <cloudflare-tunnel-token> [backend-public-url]}"
backend_url="${2:-}"

[ -f "$src" ] || { echo "missing $src"; exit 1; }

keep='^(DATABASE_URL|MASTER_KEY|MASTER_KEY_OLD|OLD_MASTER_KEY|ZCRYPT_JWT_SECRET|OLD_ZCRYPT_JWT_SECRET|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|RESEND_API_KEY|RESEND_FROM|MAINTENANCE_SECRET|METRICS_TOKEN|ZCRYPT_CHUNK_CACHE_MB)='

{
  grep -E "$keep" "$src" || true
  echo "FRONTEND_URL=${FRONTEND_URL:-https://zcrypt.cloud}"
  echo "ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-https://zcrypt.cloud,https://www.zcrypt.cloud}"
  if [ -n "$backend_url" ]; then echo "BACKEND_URL=$backend_url"; fi
  echo "TUNNEL_TOKEN=$token"
} > "$out"
chmod 600 "$out"

for v in DATABASE_URL MASTER_KEY ZCRYPT_JWT_SECRET FRONTEND_URL; do
  grep -qE "^${v}=." "$out" || echo "warning: $v is missing from $src"
done
echo "wrote $out ($(grep -c . "$out") variables). Copy it to the server: scp $out <server>:zcrypt/deploy/server/.env"
