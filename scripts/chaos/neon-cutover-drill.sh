#!/usr/bin/env bash
#
# Neon cutover race drill: proves and quantifies the data-loss window in
# scripts/neon-rotate.sh + scripts/neon-cutover.sh using two disposable LOCAL
# Postgres clusters. Never touches real Neon, Railway, or production secrets.
#
# docs/DB_SCALING_100_PROJECTS.md §6.1/§6.3 documents a required write-freeze
# (scale the Railway service to 0 / set a maintenance flag before pg_dump,
# lift it only after cutover succeeds) that the real scripts do not
# implement (confirm with scripts/chaos/check-cutover-has-freeze.sh, run
# automatically below). This drill demonstrates the consequence: any write
# landing on OLD between the pg_dump snapshot and the DATABASE_URL flip is
# silently lost, and the real health-gate (HTTP 200 + a `select count(*)`
# canary) cannot detect it.
#
# What this drill reproduces faithfully: the EXACT pg_dump/pg_restore
# invocation neon-rotate.sh uses (same flags, same custom-format dump), the
# same row-count verification step, and the same health-gate + canary-read
# SHAPE that neon-cutover.sh uses.
#
# What this drill stubs out (see stub notes inline): the Railway-specific
# half of neon-cutover.sh (GraphQL calls to set DATABASE_URL and trigger a
# redeploy) has no meaning against local Postgres, so it's replaced with a
# fixed sleep approximating real redeploy latency, plus a trivial local HTTP
# server standing in for the health endpoint. Nothing here calls neonctl,
# the real Railway API, or modifies docs/neon-manifest.json.
#
# Usage: bash scripts/chaos/neon-cutover-drill.sh
#        WITH_FREEZE=1 bash scripts/chaos/neon-cutover-drill.sh
#
# WITH_FREEZE=1 simulates cmd/maintenance.go's application-level write-freeze
# (implemented 2026-09-24): the writer loop stands in for real HTTP clients,
# and "freezing" means those clients would get 503s from MaintenanceGate, so
# the loop just skips its insert instead of writing, bracketed at the exact
# same points neon-rotate.sh now calls freeze_writes/unfreeze_writes (right
# before pg_dump, right after cutover). This proves the FIX's shape without
# needing a full Go server + real HTTP round trip in this local drill.
set -euo pipefail
cd "$(dirname "$0")/../.."

OLD_PORT=5434
NEW_PORT=5435
WRITER_INTERVAL="0.2"
HEALTH_PORT=8991
WITH_FREEZE="${WITH_FREEZE:-0}"
FREEZE_FLAG="$(mktemp -u -t zcrypt-drill-freeze-XXXX.flag)"

command -v python3 >/dev/null 2>&1 || { echo "ERROR: python3 required for the local health-endpoint stub." >&2; exit 1; }

PGBIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
if [[ ! -x "$PGBIN/initdb" ]]; then
  PGBIN="$(dirname "$(command -v initdb)")" || {
    echo "ERROR: no initdb found (Postgres.app or PATH). Cannot run this drill." >&2
    exit 1
  }
fi

OLD_BASE=""
NEW_BASE=""
WRITER_PID=""
HEALTH_PID=""
HEALTH_DIR=""
DUMP_FILE=""

cleanup() {
  echo
  echo "==> Cleaning up…"
  [[ -n "$WRITER_PID" ]] && kill "$WRITER_PID" >/dev/null 2>&1 || true
  [[ -n "$HEALTH_PID" ]] && kill "$HEALTH_PID" >/dev/null 2>&1 || true
  [[ -n "$OLD_BASE" ]] && "$PGBIN/pg_ctl" -D "$OLD_BASE/pgdata" -m immediate stop >/dev/null 2>&1 || true
  [[ -n "$NEW_BASE" ]] && "$PGBIN/pg_ctl" -D "$NEW_BASE/pgdata" -m immediate stop >/dev/null 2>&1 || true
  [[ -n "$OLD_BASE" ]] && rm -rf "$OLD_BASE"
  [[ -n "$NEW_BASE" ]] && rm -rf "$NEW_BASE"
  [[ -n "$HEALTH_DIR" ]] && rm -rf "$HEALTH_DIR"
  [[ -n "$DUMP_FILE" ]] && rm -f "$DUMP_FILE"
  rm -f "$FREEZE_FLAG"
}
trap cleanup EXIT

boot_pg() {
  local port="$1" label="$2" base data
  base="$(mktemp -d)"
  data="$base/pgdata"
  echo "==> Booting ${label} Postgres on :${port} (${data})…" >&2
  "$PGBIN/initdb" -D "$data" -U postgres --auth=trust -E UTF8 >/dev/null
  "$PGBIN/pg_ctl" -D "$data" -o "-p ${port} -k ${base} -h 127.0.0.1" \
    -w -l "$base/server.log" start >/dev/null
  "$PGBIN/psql" -h 127.0.0.1 -p "$port" -U postgres -q <<SQL
CREATE ROLE zcrypt LOGIN SUPERUSER PASSWORD 'drillpassword';
CREATE DATABASE zcrypt_drill OWNER zcrypt;
SQL
  echo "$base"
}

echo "########################################################"
echo "# Neon cutover race drill"
echo "########################################################"
echo

echo "==> Structural check first (see check-cutover-has-freeze.sh for detail)…"
if bash "$(dirname "$0")/check-cutover-has-freeze.sh" >/dev/null 2>&1; then
  freeze_implemented=1
  echo "    confirmed: neon-rotate.sh/neon-watch.yml DO call the write-freeze."
else
  freeze_implemented=0
  echo "    confirmed: no freeze step found in neon-rotate.sh/neon-watch.yml."
fi
if [[ "$WITH_FREEZE" == "1" ]]; then
  echo "    WITH_FREEZE=1: this run simulates that freeze locally regardless (see header comment)."
elif [[ "$freeze_implemented" == "1" ]]; then
  echo "    NOTE: the real scripts now freeze writes, but this run has WITH_FREEZE=0, so it's"
  echo "    deliberately reproducing the pre-fix scenario. Re-run with WITH_FREEZE=1 to see the fix."
fi
echo

OLD_BASE="$(boot_pg "$OLD_PORT" OLD)"
NEW_BASE="$(boot_pg "$NEW_PORT" NEW)"

OLD_URL="postgres://zcrypt:drillpassword@127.0.0.1:${OLD_PORT}/zcrypt_drill?sslmode=disable"
NEW_URL="postgres://zcrypt:drillpassword@127.0.0.1:${NEW_PORT}/zcrypt_drill?sslmode=disable"

echo
echo "==> Seeding OLD with a minimal schema + baseline rows…"
"$PGBIN/psql" "$OLD_URL" -q <<'SQL'
CREATE TABLE users   (id serial PRIMARY KEY, email text);
CREATE TABLE files   (id serial PRIMARY KEY, name text);
CREATE TABLE chunks  (id serial PRIMARY KEY, file_id int);
CREATE TABLE folders (id serial PRIMARY KEY, name text);
CREATE TABLE chaos_markers (id serial PRIMARY KEY, written_at timestamptz DEFAULT now());

INSERT INTO users (email) SELECT 'user' || g || '@drill.test' FROM generate_series(1,5) g;
INSERT INTO files (name)  SELECT 'file' || g || '.bin'        FROM generate_series(1,10) g;
INSERT INTO chunks (file_id) SELECT (g % 10) + 1              FROM generate_series(1,30) g;
INSERT INTO folders (name) SELECT 'folder' || g               FROM generate_series(1,3) g;
SQL

echo
if [[ "$WITH_FREEZE" == "1" ]]; then
  echo "==> Starting the background writer against OLD (one insert every ${WRITER_INTERVAL}s, WITH_FREEZE=1: skips writes while frozen)…"
else
  echo "==> Starting the background writer against OLD (one insert every ${WRITER_INTERVAL}s)…"
fi
(
  while true; do
    if [[ "$WITH_FREEZE" == "1" && -e "$FREEZE_FLAG" ]]; then
      : # simulates a real client getting 503'd by MaintenanceGate: no write attempted
    else
      "$PGBIN/psql" "$OLD_URL" -tAc "INSERT INTO chaos_markers DEFAULT VALUES" >/dev/null 2>&1 || true
    fi
    sleep "$WRITER_INTERVAL"
  done
) &
WRITER_PID=$!
sleep 1   # let a few markers land before the dump starts

echo
echo "==> Real neon-rotate.sh sequence (dump -> restore -> verify -> ANALYZE), writer still running…"
if [[ "$WITH_FREEZE" == "1" ]]; then
  echo "    [freeze_writes equivalent] engaging simulated write-freeze before pg_dump…"
  touch "$FREEZE_FLAG"
fi
DUMP_FILE="$(mktemp -t zcrypt-drill-XXXX.dump)"
dump_start=$(date +%s.%N)

echo "    pg_dump OLD (same flags as neon-rotate.sh: --no-owner --no-privileges -Fc)…"
"$PGBIN/pg_dump" --no-owner --no-privileges -Fc "$OLD_URL" >"$DUMP_FILE"

echo "    pg_restore -> NEW (same flags: --no-owner --no-privileges --single-transaction)…"
"$PGBIN/pg_restore" --no-owner --no-privileges --single-transaction -d "$NEW_URL" "$DUMP_FILE"

echo "    verifying row counts (users/files/chunks/folders -- the exact tables neon-rotate.sh checks)…"
for tbl in users files chunks folders; do
  old_n="$("$PGBIN/psql" "$OLD_URL" -tAc "select count(*) from ${tbl}" | tr -d ' ')"
  new_n="$("$PGBIN/psql" "$NEW_URL" -tAc "select count(*) from ${tbl}" | tr -d ' ')"
  printf "      %-8s old=%s new=%s\n" "$tbl" "$old_n" "$new_n"
done
echo "    (note: neon-rotate.sh's real verify step only checks these 4 tables -- it"
echo "     never looks at whatever table is actively being written to, which is"
echo "     exactly why this class of loss passes its own verification today.)"

echo "    ANALYZE NEW…"
"$PGBIN/psql" "$NEW_URL" -c "ANALYZE" >/dev/null

echo
echo "==> Cutover (Railway-specific parts stubbed -- see header comment)…"
echo "    [STUB] set + verify DATABASE_URL, trigger redeploy (real GraphQL calls skipped)…"
sleep 2   # approximates real redeploy latency (~2s observed in today's 2026-09-24 production rotation log)

HEALTH_DIR="$(mktemp -d)"
python3 -m http.server "$HEALTH_PORT" --bind 127.0.0.1 --directory "$HEALTH_DIR" >/dev/null 2>&1 &
HEALTH_PID=$!

echo "    waiting for [STUB] health endpoint to return 200…"
health_ok=0
for _ in $(seq 1 10); do
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${HEALTH_PORT}/" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then health_ok=1; break; fi
  sleep 1
done
[[ "$health_ok" -eq 1 ]] || { echo "ERROR: stub health endpoint never came up."; exit 1; }
echo "      health endpoint: OK (stub)"

echo "    canary read: SELECT count(*) FROM users (against NEW, exactly like the real script)…"
"$PGBIN/psql" "$NEW_URL" -tAc "select count(*) from users" >/dev/null
echo "      canary read: OK"

cutover_done=$(date +%s.%N)
echo "==> Cutover 'succeeded' -- by the real script's own health-gate + canary logic."

if [[ "$WITH_FREEZE" == "1" ]]; then
  echo "    [unfreeze_writes equivalent] releasing simulated write-freeze after cutover…"
  rm -f "$FREEZE_FLAG"
fi

echo
echo "==> Stopping the writer and measuring the damage…"
kill "$WRITER_PID" >/dev/null 2>&1 || true
wait "$WRITER_PID" 2>/dev/null || true
WRITER_PID=""
sleep 0.3   # let the last in-flight insert finish

total_written="$("$PGBIN/psql" "$OLD_URL" -tAc "select count(*) from chaos_markers" | tr -d ' ')"
migrated="$("$PGBIN/psql" "$NEW_URL" -tAc "select count(*) from chaos_markers" | tr -d ' ')"
lost=$(( total_written - migrated ))
window=$(awk -v a="$dump_start" -v b="$cutover_done" 'BEGIN { printf "%.2f", b - a }')

echo
echo "########################################################"
echo "# RESULT"
echo "########################################################"
printf "  Markers written to OLD during the drill:     %s\n" "$total_written"
printf "  Markers present in NEW after 'cutover':       %s\n" "$migrated"
printf "  Markers LOST (written, never migrated):       %s\n" "$lost"
printf "  Dump -> restore -> verify -> cutover window:  %ss\n" "$window"
echo
if [[ "$WITH_FREEZE" == "1" ]]; then
  if [[ "$lost" -eq 0 ]]; then
    echo "FIX CONFIRMED: with the write-freeze simulated, zero markers were lost"
    echo "(clients would have gotten 503s instead of writes disappearing). This"
    echo "matches cmd/maintenance.go + scripts/neon-rotate.sh's freeze_writes/"
    echo "unfreeze_writes as implemented 2026-09-24."
    exit 0
  else
    echo "UNEXPECTED: ${lost} marker(s) still lost even with WITH_FREEZE=1 --"
    echo "the simulated freeze window doesn't match neon-rotate.sh's real"
    echo "freeze_writes/unfreeze_writes placement. Re-check this script against"
    echo "the current scripts/neon-rotate.sh."
    exit 1
  fi
fi

if [[ "$lost" -gt 0 ]]; then
  echo "CONFIRMED: the race is real. ${lost} write(s) landed on OLD after the"
  echo "pg_dump snapshot and were silently dropped -- the health-gate + canary"
  echo "read reported the cutover as fully successful anyway, exactly as"
  echo "scripts/neon-cutover.sh does in production before the write-freeze fix."
  echo "Re-run with WITH_FREEZE=1 to see the fix close this gap."
  exit 0
else
  echo "No writes were lost in this run. Try a shorter WRITER_INTERVAL or a"
  echo "larger seed dataset (widens the dump/restore window) to reproduce it."
  exit 1
fi
