#!/usr/bin/env bash
# Honest Go backend coverage.
#
# `go test -cover ./...` badly understates cmd/ and index/: the integration
# suite that actually drives those handlers lives in its own package behind
# //go:build integration, so (a) it never runs by default and (b) even when it
# does, per-package coverage credits nothing outside the package under test.
# Both are fixed here — run the unit and integration suites with
# -coverpkg=./... and merge the two profiles.
#
# Needs a Postgres for the integration half. Honors TEST_DATABASE_URL if set
# (that's what CI does, pointing at its postgres:16-alpine service on :5433);
# otherwise boots a throwaway local cluster on :5434 and tears it down on exit.
#
#   bash scripts/coverage-backend.sh              # full merged coverage
#   bash scripts/coverage-backend.sh --unit-only  # skip integration (no DB needed)
set -euo pipefail

cd "$(dirname "$0")/.."
BE="app/backend"
OUT="$BE/coverage"
mkdir -p "$OUT"

UNIT_ONLY=0
[[ "${1:-}" == "--unit-only" ]] && UNIT_ONLY=1

PGDATA_TMP=""
cleanup() {
  if [[ -n "$PGDATA_TMP" ]]; then
    "$PGBIN/pg_ctl" -D "$PGDATA_TMP" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$PGDATA_TMP"
  fi
}
trap cleanup EXIT

# ── Ephemeral Postgres (only if the caller didn't supply one) ────────────────
boot_pg() {
  PGBIN="/Applications/Postgres.app/Contents/Versions/latest/bin"
  if [[ ! -x "$PGBIN/initdb" ]]; then
    # Fall back to whatever's on PATH (Linux/CI without Postgres.app).
    PGBIN="$(dirname "$(command -v initdb)")" || {
      echo "no initdb found — set TEST_DATABASE_URL or install Postgres" >&2
      return 1
    }
  fi
  PGDATA_TMP="$(mktemp -d)/pgdata"
  echo "→ booting throwaway Postgres on :5434 ($PGDATA_TMP)"
  "$PGBIN/initdb" -D "$PGDATA_TMP" -U postgres --auth=trust -E UTF8 >/dev/null
  # -k: unix socket inside the temp dir, so we never collide with a real cluster.
  "$PGBIN/pg_ctl" -D "$PGDATA_TMP" -o "-p 5434 -k $PGDATA_TMP -h 127.0.0.1" \
    -w -l "$PGDATA_TMP/server.log" start >/dev/null
  "$PGBIN/psql" -h 127.0.0.1 -p 5434 -U postgres -q <<'SQL'
CREATE ROLE zcrypt LOGIN SUPERUSER PASSWORD 'testpassword';
CREATE DATABASE zcrypt_test OWNER zcrypt;
SQL
  export TEST_DATABASE_URL="postgres://zcrypt:testpassword@127.0.0.1:5434/zcrypt_test?sslmode=disable"
}

if [[ $UNIT_ONLY -eq 0 && -z "${TEST_DATABASE_URL:-}" ]]; then
  boot_pg || UNIT_ONLY=1
fi

# ── Unit suite, crediting coverage to every package ─────────────────────────
echo "→ unit tests (-coverpkg=./...)"
(cd "$BE" && go test -coverpkg=./... -coverprofile=coverage/unit.out ./... >/dev/null)

PROFILES=("$OUT/unit.out")

# ── Integration suite (real handlers + real DB) ─────────────────────────────
if [[ $UNIT_ONLY -eq 0 ]]; then
  echo "→ integration tests (-tags=integration -coverpkg=./...)"
  (cd "$BE" && go test -tags=integration -timeout=300s \
    -coverpkg=./... -coverprofile=coverage/integ.out ./integration/... >/dev/null)
  PROFILES+=("$OUT/integ.out")
else
  echo "→ skipping integration tests (no database)"
fi

# ── Merge ───────────────────────────────────────────────────────────────────
# Text profile lines are "file.go:sLine.sCol,eLine.eCol numStmt count" — the
# location is one whitespace-free field, so grouping on $1 and taking the max
# count is a correct union of "was this block covered". Cheaper and more
# reproducible than vendoring gocovmerge for what amounts to ten lines of awk.
echo "→ merging ${#PROFILES[@]} profile(s)"
awk '
  /^mode:/ { mode = $2; next }
  {
    if (!($1 in stmt)) { order[++n] = $1 }
    stmt[$1] = $2
    if (!($1 in cnt) || $3 > cnt[$1]) cnt[$1] = $3
  }
  END {
    print "mode: " (mode ? mode : "set")
    for (i = 1; i <= n; i++) print order[i], stmt[order[i]], cnt[order[i]]
  }
' "${PROFILES[@]}" > "$OUT/merged.out"

# ── Report ──────────────────────────────────────────────────────────────────
# Statement-weighted per package, straight from the merged profile. (Averaging
# `go tool cover -func`'s per-function percentages would weight a one-line
# helper the same as a 200-line handler — not the number we're tracking.)
echo
echo "════════ per-package statement coverage (merged) ════════"
awk '
  /^mode:/ { next }
  {
    pkg = $1
    sub(/:[0-9]+\.[0-9]+,[0-9]+\.[0-9]+$/, "", pkg)   # strip the block range
    sub(/\/[^\/]*\.go$/, "", pkg)                      # strip the filename
    sub(/^github\.com\/zcrypt\/zcrypt\/?/, "", pkg)
    if (pkg == "") pkg = "(main)"
    total[pkg] += $2
    if ($3 > 0) covered[pkg] += $2
    grandTotal += $2
    if ($3 > 0) grandCovered += $2
  }
  END {
    for (p in total)
      printf "%-16s %6.1f%%  %5d/%-5d stmts\n", p, 100 * covered[p] / total[p], covered[p], total[p]
    printf "%-16s %6.1f%%  %5d/%-5d stmts\n", "___TOTAL", 100 * grandCovered / grandTotal, grandCovered, grandTotal
  }
' "$OUT/merged.out" | sort
echo
echo "profile: $OUT/merged.out   (go tool cover -html=$OUT/merged.out)"
