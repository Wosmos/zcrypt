#!/usr/bin/env bash
# Move the zcrypt backend to a fresh Railway account.
# Prereq: `railway login` on the NEW account. See deploy/server/README.md.
# Usage: scripts/railway-flip.sh [--apply] [--image IMAGE] [--env-file FILE] [--name NAME]
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE="$ROOT/deploy/railway.env"
NAME="zcrypt-backend"
IMAGE=""
APPLY=0
PORT_INTERNAL=8080
TIMEOUT=180
REQUIRED=(DATABASE_URL MASTER_KEY ZCRYPT_JWT_SECRET)

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --image) IMAGE=${2:?--image needs a value}; shift ;;
    --env-file) ENV_FILE=${2:?--env-file needs a value}; shift ;;
    --name) NAME=${2:?--name needs a value}; shift ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

for c in railway curl jq; do command -v "$c" >/dev/null || die "$c not found in PATH"; done
if [ "$APPLY" = 1 ]; then
  for c in vercel gh; do command -v "$c" >/dev/null || die "--apply needs the $c CLI"; done
fi
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Copy deploy/railway.env.example and fill it in."

if [ -z "$IMAGE" ]; then
  owner=$(git -C "$ROOT" remote get-url origin | sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#' | tr '[:upper:]' '[:lower:]')
  [ -n "$owner" ] || die "cannot derive GitHub owner; pass --image"
  IMAGE="ghcr.io/$owner/zcrypt-backend:latest"
fi

declare -a KEYS=() VALS=()
while IFS= read -r line || [ -n "$line" ]; do
  line=${line%$'\r'}
  case "$line" in ''|'#'*) continue ;; esac
  [[ "$line" == *=* ]] || continue
  k=${line%%=*}; v=${line#*=}
  if [[ "$v" == \"*\" ]] || [[ "$v" == \'*\' ]]; then v=${v:1:${#v}-2}; fi
  [[ "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "bad variable name in $ENV_FILE: $k"
  [ -n "$v" ] || continue
  KEYS+=("$k"); VALS+=("$v")
done < "$ENV_FILE"

has() { local i; for i in "${!KEYS[@]}"; do [ "${KEYS[$i]}" = "$1" ] && return 0; done; return 1; }
for r in "${REQUIRED[@]}"; do has "$r" || die "$r is empty in $ENV_FILE. Refusing to deploy without it."; done

log "railway account: $(railway whoami 2>&1 | head -1)"
log "image: $IMAGE"
log "variables to set: ${KEYS[*]} (values hidden)"

log "creating project $NAME"
railway init --name "$NAME" >/dev/null

log "creating service from image"
railway add --service "$NAME" --image "$IMAGE" >/dev/null

log "setting variables"
for i in "${!KEYS[@]}"; do
  printf '%s' "${VALS[$i]}" | railway variable set --service "$NAME" --stdin --skip-deploys "${KEYS[$i]}" >/dev/null
done
printf '%s' "$PORT_INTERNAL" | railway variable set --service "$NAME" --stdin --skip-deploys PORT >/dev/null

log "redeploying with variables"
railway redeploy --service "$NAME" --yes >/dev/null 2>&1 || log "redeploy command failed or unsupported; continuing"

log "generating service domain on port $PORT_INTERNAL"
out=$(railway domain --service "$NAME" --port "$PORT_INTERNAL" --json 2>&1) || die "domain creation failed: $out"
DOMAIN=$(printf '%s' "$out" | jq -r '.domain // .domains[0] // empty' 2>/dev/null || true)
[ -n "$DOMAIN" ] || DOMAIN=$(printf '%s' "$out" | grep -oE '[a-zA-Z0-9.-]+\.up\.railway\.app' | head -1 || true)
[ -n "$DOMAIN" ] || die "could not parse domain from: $out"
DOMAIN=${DOMAIN#https://}
HEALTH="https://$DOMAIN/api/health"
log "domain: $DOMAIN"

log "polling $HEALTH (up to ${TIMEOUT}s)"
deadline=$((SECONDS + TIMEOUT)); ok=0
while [ "$SECONDS" -lt "$deadline" ]; do
  body=$(curl -sf --max-time 8 "$HEALTH" 2>/dev/null || true)
  if [ -n "$body" ] && [ "$(printf '%s' "$body" | jq -r '.status // ""' 2>/dev/null)" = "ok" ]; then ok=1; break; fi
  sleep 5
done
[ "$ok" = 1 ] || die "health never reported ok within ${TIMEOUT}s. Check: railway logs --service $NAME (is the GHCR package public?)"
log "backend is healthy"

API_URL="https://$DOMAIN"
cat <<MSG

Follow-ups (run in order):
  cd app/frontend
  vercel env rm NEXT_PUBLIC_API_URL production --yes
  printf '%s' '$API_URL' | vercel env add NEXT_PUBLIC_API_URL production
  vercel redeploy https://zcrypt.cloud   # rebuilds the live production deployment; never 'vercel --prod' (uploads the local tree)
  gh variable set BACKEND_HEALTH_URL --body '$HEALTH'
  gh secret set RAILWAY_TOKEN        # project token: Railway dashboard > Project > Settings > Tokens
MSG

if [ "$APPLY" = 1 ]; then
  log "applying Vercel and GitHub follow-ups"
  cd "$ROOT/app/frontend"
  vercel env rm NEXT_PUBLIC_API_URL production --yes || log "no existing NEXT_PUBLIC_API_URL to remove"
  printf '%s' "$API_URL" | vercel env add NEXT_PUBLIC_API_URL production
  vercel redeploy https://zcrypt.cloud   # rebuilds the live production deployment; never 'vercel --prod' (uploads the local tree)
  gh variable set BACKEND_HEALTH_URL --body "$HEALTH"
  log "done. RAILWAY_TOKEN must still be set by hand: gh secret set RAILWAY_TOKEN"
fi
