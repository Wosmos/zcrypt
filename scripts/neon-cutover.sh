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
#      before trusting anything else (belt-and-braces: this talks to Railway's
#      GraphQL API directly with curl rather than through the `railway` CLI —
#      see the note further down for why).
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
#   RAILWAY_PROJECT_ID    the zcrypt project's id (Railway → project → Settings)
#   RAILWAY_SERVICE       service id (the Go backend) — must be an id, not a
#                         name; the GraphQL API this script talks to (below)
#                         takes ids only
#   RAILWAY_ENVIRONMENT   environment id — same reason (not a name like "production")
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
: "${RAILWAY_PROJECT_ID:?Set RAILWAY_PROJECT_ID.}"
: "${RAILWAY_SERVICE:?Set RAILWAY_SERVICE.}"
: "${RAILWAY_ENVIRONMENT:?Set RAILWAY_ENVIRONMENT.}"
: "${NEW_DATABASE_URL:?Set NEW_DATABASE_URL.}"
: "${OLD_DATABASE_URL:?Set OLD_DATABASE_URL.}"
: "${HEALTH_URL:?Set HEALTH_URL.}"
HEALTH_TIMEOUT_SECS="${HEALTH_TIMEOUT_SECS:-180}"
CANARY_TABLE="${CANARY_TABLE:-users}"

for bin in curl psql jq; do
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

# Railway's own CLI turned out to be the least reliable part of this pipeline:
# its subcommand name has been renamed across versions (`variable` vs
# `variables`), and as of CLI v5.54 it flatly rejects a project token
# (RAILWAY_TOKEN) as "Invalid RAILWAY_TOKEN" on every command — including
# read-only ones — even though that exact token authenticates fine against
# Railway's GraphQL API directly (confirmed 2026-09-12). Rather than depend on
# whatever CLI version `npm install -g @railway/cli` happens to resolve to at
# rotation time, this script talks to the API directly with curl.
RAILWAY_API="https://backboard.railway.com/graphql/v2"

# POST a GraphQL request; print the response body; fail if curl itself failed
# (network) OR the response carries a top-level "errors" array (GraphQL still
# returns HTTP 200 on a query/permission error, so a curl-level check alone
# would miss it).
gql() {
  local query="$1" vars="$2" resp
  resp="$(curl -fsS -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg q "$query" --argjson v "$vars" '{query: $q, variables: $v}')")" || return 1
  if jq -e '.errors' >/dev/null 2>&1 <<<"$resp"; then
    echo "GraphQL error: $(jq -c '.errors' <<<"$resp")" >&2
    return 1
  fi
  echo "$resp"
}

set_and_verify_db_url() {
  local target_url="$1" label="$2"
  echo "==> Setting DATABASE_URL (${label})…"
  gql 'mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }' \
    "$(jq -nc --arg pid "$RAILWAY_PROJECT_ID" --arg eid "$RAILWAY_ENVIRONMENT" \
        --arg sid "$RAILWAY_SERVICE" --arg url "$target_url" \
        '{input: {projectId:$pid, environmentId:$eid, serviceId:$sid, name:"DATABASE_URL", value:$url}}')" \
    >/dev/null

  echo "==> Reading DATABASE_URL back to confirm it actually took…"
  local readback
  readback="$(gql 'query($pid: String!, $eid: String!, $sid: String) { variables(projectId: $pid, environmentId: $eid, serviceId: $sid) }' \
      "$(jq -nc --arg pid "$RAILWAY_PROJECT_ID" --arg eid "$RAILWAY_ENVIRONMENT" --arg sid "$RAILWAY_SERVICE" \
          '{pid:$pid, eid:$eid, sid:$sid}')" \
    | jq -r '.data.variables.DATABASE_URL // empty')"
  if [[ "$readback" != "$target_url" ]]; then
    alert "ABORT: DATABASE_URL read-back did not match after setting it to ${label}. Refusing to proceed blind."
    return 1
  fi

  echo "==> Triggering redeploy…"
  gql 'mutation($eid: String!, $sid: String!) { serviceInstanceRedeploy(environmentId: $eid, serviceId: $sid) }' \
    "$(jq -nc --arg eid "$RAILWAY_ENVIRONMENT" --arg sid "$RAILWAY_SERVICE" '{eid:$eid, sid:$sid}')" \
    >/dev/null
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
