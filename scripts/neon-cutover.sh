#!/usr/bin/env bash
#
# Production cutover — the ONE step that flips live traffic. Called by
# neon-rotate.sh after dump/restore/verify has already produced a healthy new
# project (docs/DB_SCALING_100_PROJECTS.md §7). Never call this directly with
# an unverified database.
#
# What it does, in order, aborting (and rolling back) at the first failure:
#   1. Set Railway's DATABASE_URL to the NEW pooled connection string.
#   2. Read the variable back — confirm Railway actually stored the new value
#      before trusting anything else (belt-and-braces: CLI subcommand names
#      have shifted across Railway CLI versions, so this script probes for
#      whichever of `variables`/`variable` the installed CLI actually has,
#      rather than assuming one).
#   3. Trigger + wait for a redeploy.
#   4. Health-gate: poll HEALTH_URL for 200, then run one direct read against
#      the NEW database to confirm the app's actual data path works, not just
#      that the process started.
#   5. On ANY failure in 2-4: immediately repoint DATABASE_URL back to
#      OLD_DATABASE_URL, redeploy again, verify the OLD health gate passes,
#      alert, and exit non-zero. The old project is the rollback anchor and
#      must still be running (neon-rotate.sh keeps it alive — see its own
#      comments) — this script never deletes anything.
#
# Required env:
#   RAILWAY_TOKEN         Railway project token (railway.app → project → Tokens)
#   RAILWAY_SERVICE       service name or id (the Go backend)
#   RAILWAY_ENVIRONMENT   environment name or id, e.g. "production"
#   NEW_DATABASE_URL      new project's POOLED connection string
#   OLD_DATABASE_URL      current project's POOLED connection string (rollback target)
#   HEALTH_URL            e.g. https://api.zcrypt.cloud/api/health
# Optional env:
#   NTFY_TOPIC            phone alert on rollback / final failure
#   HEALTH_TIMEOUT_SECS   default 180 (redeploys are typically <60s on Railway)
#   CANARY_TABLE          default "users" — table probed with `select count(*)`
#
set -euo pipefail

: "${RAILWAY_TOKEN:?Set RAILWAY_TOKEN.}"
: "${RAILWAY_SERVICE:?Set RAILWAY_SERVICE.}"
: "${RAILWAY_ENVIRONMENT:?Set RAILWAY_ENVIRONMENT.}"
: "${NEW_DATABASE_URL:?Set NEW_DATABASE_URL.}"
: "${OLD_DATABASE_URL:?Set OLD_DATABASE_URL.}"
: "${HEALTH_URL:?Set HEALTH_URL.}"
HEALTH_TIMEOUT_SECS="${HEALTH_TIMEOUT_SECS:-180}"
CANARY_TABLE="${CANARY_TABLE:-users}"
export RAILWAY_TOKEN

for bin in railway curl psql jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found on PATH."; exit 1; }
done

alert() {
  local msg="$1"
  echo "$msg"
  if [[ -n "${NTFY_TOPIC:-}" ]]; then
    curl -fsS -H "Title: zcrypt DB cutover" -H "Priority: urgent" -H "Tags: rotating_light" \
      -d "$msg" "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null || true
  fi
}

# Railway CLI subcommand has been renamed across versions (`variable` vs
# `variables`). Probe once, use whichever the installed CLI actually exposes,
# so a version drift fails loudly at this line instead of silently later.
VAR_CMD=""
if railway variables --help >/dev/null 2>&1; then
  VAR_CMD="variables"
elif railway variable --help >/dev/null 2>&1; then
  VAR_CMD="variable"
else
  alert "ABORT: neither 'railway variables' nor 'railway variable' exists on this CLI. Cutover did not run — old project is untouched."
  exit 1
fi

set_and_verify_db_url() {
  local target_url="$1" label="$2"
  echo "==> Setting DATABASE_URL (${label})…"
  railway "$VAR_CMD" --set "DATABASE_URL=${target_url}" \
    --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --yes

  echo "==> Reading DATABASE_URL back to confirm it actually took…"
  local readback
  readback="$(railway "$VAR_CMD" --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --json 2>/dev/null \
    | jq -r '.DATABASE_URL // empty')"
  if [[ "$readback" != "$target_url" ]]; then
    alert "ABORT: DATABASE_URL read-back did not match after setting it to ${label}. Railway CLI may have changed its variable-set syntax — refusing to proceed blind."
    return 1
  fi

  echo "==> Triggering redeploy…"
  railway redeploy --service "$RAILWAY_SERVICE" --environment "$RAILWAY_ENVIRONMENT" --yes
}

wait_for_health() {
  local db_url_for_canary="$1"
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECS ))
  echo "==> Waiting up to ${HEALTH_TIMEOUT_SECS}s for ${HEALTH_URL} to return 200…"
  while (( $(date +%s) < deadline )); do
    if curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null | grep -q '^200$'; then
      echo "    health endpoint: OK"
      echo "==> Canary read: SELECT count(*) FROM ${CANARY_TABLE}…"
      if psql "$db_url_for_canary" -tAc "select count(*) from ${CANARY_TABLE}" >/dev/null 2>&1; then
        echo "    canary read: OK"
        return 0
      fi
      echo "    canary read failed, retrying…"
    fi
    sleep 5
  done
  return 1
}

echo "==> 1/2  Cutting over to the NEW project…"
if set_and_verify_db_url "$NEW_DATABASE_URL" "new project" && wait_for_health "$NEW_DATABASE_URL"; then
  echo "==> Cutover succeeded. Traffic is now on the new project."
  exit 0
fi

echo ""
echo "==> 2/2  Health gate failed on the new project — ROLLING BACK to the old project…"
alert "WARNING: automatic Neon rotation cutover FAILED its health gate — rolling back to the old project now."

if set_and_verify_db_url "$OLD_DATABASE_URL" "old project (rollback)" && wait_for_health "$OLD_DATABASE_URL"; then
  alert "Rollback succeeded: traffic is back on the OLD project (still on its original quota-limited compute — rotate manually once the underlying issue is understood). See scripts/neon-cutover.sh output in the Actions log for what failed."
  exit 1
fi

alert "CRITICAL: rollback to the old project ALSO failed its health gate. Manual intervention required NOW — check Railway directly. DATABASE_URL may currently point at neither a confirmed-good old nor new project."
exit 2
