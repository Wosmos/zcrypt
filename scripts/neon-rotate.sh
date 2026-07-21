#!/usr/bin/env bash
#
# Neon rotation escape hatch — move the whole DB to a FRESH free project.
#
# The free-tier carousel (docs/DB_SCALING_100_PROJECTS.md): one project active
# at a time; when it nears its 100 CU-hour monthly quota, rotate to a fresh
# project (fresh 100 CU-hours). Old projects go dormant, refill next month, and
# can be reused. Run this MANUALLY when the watcher (neon-usage.sh) fires at
# ~85% — never wait for 100%, because a LOCKED project cannot be pg_dump'd.
#
# It is read-only on the OLD project (pg_dump only) and never auto-repoints
# your app: it prints the new connection strings + next steps so the cutover
# is a deliberate, verified human action.
#
# Prereqs: neonctl (npm i -g neonctl) authenticated OR NEON_API_KEY set;
#          pg_dump / pg_restore / psql on PATH (Postgres.app).
#
# Required env:
#   NEON_API_KEY         Neon API key (also used to authenticate neonctl)
#   OLD_DATABASE_URL     DIRECT (non-pooler) url of the CURRENT active project
# Optional env:
#   NEW_PROJECT_NAME     name for the fresh project (default: zcrypt-<epoch>)
#   NEON_REGION          region id (default: aws-us-east-1)
#
set -euo pipefail

: "${NEON_API_KEY:?Set NEON_API_KEY.}"
: "${OLD_DATABASE_URL:?Set OLD_DATABASE_URL (the DIRECT, non-pooler url of the current active project).}"
NEW_PROJECT_NAME="${NEW_PROJECT_NAME:-zcrypt-$(date +%s)}"
NEON_REGION="${NEON_REGION:-aws-us-east-1}"
export NEON_API_KEY

for bin in neonctl pg_dump pg_restore psql jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found on PATH."; exit 1; }
done

echo "==> 0/5  Pre-flight: confirm the OLD project is still reachable (not already locked)…"
if ! psql "$OLD_DATABASE_URL" -tAc "select 1" >/dev/null 2>&1; then
  echo "ABORT: cannot connect to OLD_DATABASE_URL. If it is quota-locked, pg_dump is impossible —"
  echo "       there is no rotation path until the monthly reset. (This is exactly why we rotate at 85%.)"
  exit 1
fi

echo "==> 1/5  Creating fresh project '${NEW_PROJECT_NAME}' in ${NEON_REGION}…"
create_json="$(neonctl projects create --name "$NEW_PROJECT_NAME" --region-id "$NEON_REGION" --output json)"
NEW_PROJECT_ID="$(jq -r '.project.id' <<<"$create_json")"
# Direct (for restore) + pooled (for the app) connection strings.
NEW_DIRECT_URL="$(neonctl connection-string --project-id "$NEW_PROJECT_ID" --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || neonctl connection-string --project-id "$NEW_PROJECT_ID")"
NEW_POOLED_URL="$(neonctl connection-string --project-id "$NEW_PROJECT_ID" --pooled --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || neonctl connection-string --project-id "$NEW_PROJECT_ID" --pooled)"
[[ -n "$NEW_DIRECT_URL" && "$NEW_DIRECT_URL" != "null" ]] || { echo "ERROR: could not resolve new direct connection string."; exit 1; }
echo "    new project id: ${NEW_PROJECT_ID}"

echo "==> 2/5  Dumping OLD -> restoring into NEW (custom format, single consistent snapshot)…"
dump="$(mktemp -t zcrypt-rotate-XXXX.dump)"
trap 'rm -f "$dump"' EXIT
pg_dump --no-owner --no-privileges -Fc "$OLD_DATABASE_URL" >"$dump"
pg_restore --no-owner --no-privileges --single-transaction -d "$NEW_DIRECT_URL" "$dump"

echo "==> 3/5  Verifying row counts on the big tables (OLD vs NEW)…"
ok=1
for tbl in users files chunks folders; do
  old_n="$(psql "$OLD_DATABASE_URL" -tAc "select count(*) from ${tbl}" 2>/dev/null || echo NA)"
  new_n="$(psql "$NEW_DIRECT_URL" -tAc "select count(*) from ${tbl}" 2>/dev/null || echo NA)"
  printf "    %-8s old=%s new=%s\n" "$tbl" "$old_n" "$new_n"
  [[ "$old_n" == "$new_n" ]] || ok=0
done
if [[ "$ok" -ne 1 ]]; then
  echo "ABORT: row counts differ. Do NOT repoint. Inspect the new project, then delete it and retry."
  exit 1
fi

echo "==> 4/5  Refreshing planner statistics on NEW (a restored DB has none)…"
psql "$NEW_DIRECT_URL" -c "ANALYZE" >/dev/null

echo "==> 5/5  Done. Cutover is a DELIBERATE manual step — nothing was repointed automatically."
cat <<EOF

  Next steps (do these to finish the rotation):
    1. Freeze writes: put the backend in maintenance / scale Railway to 0.
    2. Set Railway DATABASE_URL to the NEW POOLED url below, then redeploy:

         ${NEW_POOLED_URL}

    3. Health-check /api/health + one authenticated read; then lift maintenance.
    4. Keep the OLD project for >= 7 days as a rollback anchor (repoint back if needed).
       Its quota refills next month — rename it and keep it as a future carousel slot.

  (If step 2's small write-freeze window matters, note logical-replication cutover
   is possible but pins the OLD compute awake — see docs/DB_SCALING_100_PROJECTS.md §6.)
EOF
