#!/usr/bin/env bash
#
# Neon rotation — move the whole DB to a FRESH free project, fully automated
# end to end: create -> dump -> restore -> verify -> ANALYZE -> cutover
# (Railway DATABASE_URL flip + redeploy + health-gate, via neon-cutover.sh) ->
# record the new active project in docs/neon-manifest.json.
#
# The free-tier carousel (docs/DB_SCALING_100_PROJECTS.md): one project active
# at a time; when it nears its 100 CU-hour monthly quota, rotate to a fresh
# project (fresh 100 CU-hours). Old projects go dormant, refill next month,
# and can be reused. Triggered automatically by neon-watch.yml at 85% quota —
# never wait for 100%, because a LOCKED project cannot be pg_dump'd.
#
# Cutover safety: dump/restore/verify is READ-ONLY on the old project. Only
# neon-cutover.sh (called in step 6) touches production traffic, and it
# health-gates + auto-rolls-back on failure — see that script's own header.
# The old project is NEVER deleted by this script; it is the rollback anchor
# for >= 7 days (housekeeping — renaming/reclaiming it — stays a human task).
#
# Prereqs: neonctl (npm i -g neonctl); pg_dump/pg_restore/psql; jq; git (with
#          push access — the workflow needs `permissions: contents: write`).
#
# Required env:
#   NEON_API_KEY          Neon API key (also authenticates neonctl)
#   RAILWAY_TOKEN, RAILWAY_SERVICE, RAILWAY_ENVIRONMENT, HEALTH_URL
#                         passed straight through to neon-cutover.sh
# Optional env:
#   NEON_PROJECT_ID       fallback active-project id, used only if
#                         docs/neon-manifest.json has no active_project_id yet
#   OLD_DATABASE_URL      override: skip manifest/API resolution and dump this
#                         DIRECT url instead (manual/testing use only)
#   NEW_PROJECT_NAME      name for the fresh project (default: zcrypt-<epoch>)
#   NEON_REGION           region id (default: aws-us-east-1)
#   NTFY_TOPIC            phone alert on any abort (also used by neon-cutover.sh)
#   GIT_COMMIT_MANIFEST   default "1" — set "0" to skip the manifest commit
#                         (e.g. for a dry run against a scratch project)
#
set -euo pipefail

: "${NEON_API_KEY:?Set NEON_API_KEY.}"
NEW_PROJECT_NAME="${NEW_PROJECT_NAME:-zcrypt-$(date +%s)}"
NEON_REGION="${NEON_REGION:-aws-us-east-1}"
GIT_COMMIT_MANIFEST="${GIT_COMMIT_MANIFEST:-1}"
MANIFEST="docs/neon-manifest.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export NEON_API_KEY

for bin in neonctl pg_dump pg_restore psql jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found on PATH."; exit 1; }
done

alert() {
  local msg="$1"
  echo "$msg"
  if [[ -n "${NTFY_TOPIC:-}" ]]; then
    curl -fsS -H "Title: zcrypt DB rotation" -H "Priority: urgent" -H "Tags: rotating_light" \
      -d "$msg" "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null || true
  fi
}

echo "==> 0a/6  Resolving the currently active project…"
OLD_PROJECT_ID="$(jq -r '.active_project_id // empty' "$MANIFEST" 2>/dev/null || true)"
if [[ -z "$OLD_PROJECT_ID" ]]; then
  : "${NEON_PROJECT_ID:?No active_project_id in ${MANIFEST} yet (bootstrap) — set NEON_PROJECT_ID.}"
  OLD_PROJECT_ID="$NEON_PROJECT_ID"
  echo "    bootstrap: using NEON_PROJECT_ID (${OLD_PROJECT_ID})"
else
  echo "    active project (from manifest): ${OLD_PROJECT_ID}"
fi

if [[ -n "${OLD_DATABASE_URL:-}" ]]; then
  echo "    OLD_DATABASE_URL override supplied — skipping API resolution (manual/test mode)."
  OLD_POOLED_URL=""
else
  OLD_DATABASE_URL="$(neonctl connection-string --project-id "$OLD_PROJECT_ID" --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || true)"
  [[ -n "$OLD_DATABASE_URL" && "$OLD_DATABASE_URL" != "null" ]] || OLD_DATABASE_URL="$(neonctl connection-string --project-id "$OLD_PROJECT_ID")"
  OLD_POOLED_URL="$(neonctl connection-string --project-id "$OLD_PROJECT_ID" --pooled --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || true)"
  [[ -n "$OLD_POOLED_URL" && "$OLD_POOLED_URL" != "null" ]] || OLD_POOLED_URL="$(neonctl connection-string --project-id "$OLD_PROJECT_ID" --pooled)"
fi
[[ -n "$OLD_DATABASE_URL" ]] || { echo "ERROR: could not resolve OLD_DATABASE_URL."; exit 1; }

echo "==> 0b/6  Pre-flight: confirm the OLD project is still reachable (not already locked)…"
if ! psql "$OLD_DATABASE_URL" -tAc "select 1" >/dev/null 2>&1; then
  alert "ABORT: cannot connect to the active Neon project (${OLD_PROJECT_ID}). If it is quota-locked, pg_dump is impossible — there is no rotation path until the monthly reset. (This is exactly why we rotate at 85%, not 100%.)"
  exit 1
fi

echo "==> 1/6  Creating fresh project '${NEW_PROJECT_NAME}' in ${NEON_REGION}…"
create_json="$(neonctl projects create --name "$NEW_PROJECT_NAME" --region-id "$NEON_REGION" --output json)"
NEW_PROJECT_ID="$(jq -r '.project.id' <<<"$create_json")"
NEW_DIRECT_URL="$(neonctl connection-string --project-id "$NEW_PROJECT_ID" --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || neonctl connection-string --project-id "$NEW_PROJECT_ID")"
NEW_POOLED_URL="$(neonctl connection-string --project-id "$NEW_PROJECT_ID" --pooled --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || neonctl connection-string --project-id "$NEW_PROJECT_ID" --pooled)"
[[ -n "$NEW_DIRECT_URL" && "$NEW_DIRECT_URL" != "null" ]] || { echo "ERROR: could not resolve new direct connection string."; exit 1; }
echo "    new project id: ${NEW_PROJECT_ID}"

echo "==> 2/6  Dumping OLD -> restoring into NEW (custom format, single consistent snapshot)…"
dump="$(mktemp -t zcrypt-rotate-XXXX.dump)"
trap 'rm -f "$dump"' EXIT
pg_dump --no-owner --no-privileges -Fc "$OLD_DATABASE_URL" >"$dump"
pg_restore --no-owner --no-privileges --single-transaction -d "$NEW_DIRECT_URL" "$dump"

echo "==> 3/6  Verifying row counts on the big tables (OLD vs NEW)…"
ok=1
for tbl in users files chunks folders; do
  old_n="$(psql "$OLD_DATABASE_URL" -tAc "select count(*) from ${tbl}" 2>/dev/null || echo NA)"
  new_n="$(psql "$NEW_DIRECT_URL" -tAc "select count(*) from ${tbl}" 2>/dev/null || echo NA)"
  printf "    %-8s old=%s new=%s\n" "$tbl" "$old_n" "$new_n"
  [[ "$old_n" == "$new_n" ]] || ok=0
done
if [[ "$ok" -ne 1 ]]; then
  alert "ABORT: rotation row-count verification failed (old vs new mismatch). New project ${NEW_PROJECT_ID} was NOT cut over — old project is untouched. Inspect the new project manually, then delete it and retry."
  exit 1
fi

echo "==> 4/6  Refreshing planner statistics on NEW (a restored DB has none)…"
psql "$NEW_DIRECT_URL" -c "ANALYZE" >/dev/null

write_manifest() {
  local active="$1" standby="$2" note="$3"
  jq --arg active "$active" \
     --arg standby "$standby" \
     --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     --arg old "$OLD_PROJECT_ID" \
     --arg new "$NEW_PROJECT_ID" \
     --arg note "$note" \
     '.active_project_id = $active
      | .standby_project_id = (if $standby == "" then null else $standby end)
      | .last_rotation_at = $ts
      | .history += [{"at": $ts, "old_project_id": $old, "new_project_id": $new, "note": $note}]' \
     "$MANIFEST" >"${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "$MANIFEST"

  if [[ "$GIT_COMMIT_MANIFEST" == "1" ]]; then
    git config user.name "zcrypt-neon-bot"
    git config user.email "actions@users.noreply.github.com"
    git add "$MANIFEST"
    git commit -m "chore(neon): rotation — ${note}" -q
    git push -q
  fi
}

echo "==> 5/6  Cutting over via scripts/neon-cutover.sh…"
set +e
NEW_DATABASE_URL="$NEW_POOLED_URL" OLD_DATABASE_URL="$OLD_POOLED_URL" \
  bash "${SCRIPT_DIR}/neon-cutover.sh"
cutover_rc=$?
set -e

echo "==> 6/6  Recording the outcome in ${MANIFEST}…"
case "$cutover_rc" in
  0)
    write_manifest "$NEW_PROJECT_ID" "$OLD_PROJECT_ID" "cutover succeeded — active=${NEW_PROJECT_ID}, old project parked as standby (dormant, quota refills next month)"
    echo "==> Rotation complete. Active project is now ${NEW_PROJECT_ID}."
    # Success is quiet by design (no urgent alert) — but silent auto-rotation
    # of production is exactly the kind of thing you want to know happened.
    if [[ -n "${NTFY_TOPIC:-}" ]]; then
      curl -fsS -H "Title: zcrypt DB auto-rotated" -H "Priority: default" -H "Tags: white_check_mark" \
        -d "Quota rotation completed automatically. Old project ${OLD_PROJECT_ID} -> new active project ${NEW_PROJECT_ID}. Old project kept >= 7 days as a rollback anchor." \
        "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null || true
    fi
    ;;
  1)
    write_manifest "$OLD_PROJECT_ID" "$NEW_PROJECT_ID" "cutover FAILED health gate and rolled back — active remains ${OLD_PROJECT_ID}; ${NEW_PROJECT_ID} kept as a pre-verified standby for a quick manual retry"
    alert "Rotation dump/restore succeeded but cutover rolled back — still on the OLD project (${OLD_PROJECT_ID}), which is still quota-limited. A verified standby (${NEW_PROJECT_ID}) is ready — investigate the cutover failure (see Action logs), then retry cutover manually."
    exit 1
    ;;
  *)
    # cutover_rc == 2: rollback itself failed too. State is uncertain — don't
    # guess which project Railway is actually pointing at; record the incident
    # without touching active_project_id.
    write_manifest "$OLD_PROJECT_ID" "$NEW_PROJECT_ID" "CUTOVER DOUBLE FAILURE — rollback also failed its health gate; active_project_id left unchanged in the manifest but Railway's real state is UNVERIFIED — manual intervention required"
    exit 2
    ;;
esac
