#!/usr/bin/env bash
#
# Structural check: does the Neon rotation pipeline implement the write-freeze
# that docs/DB_SCALING_100_PROJECTS.md §6.1/§6.3 documents as required before
# pg_dump (scale the Railway service down / set a maintenance flag), lifted
# only after cutover's health-gate succeeds?
#
# This is a cheap, no-database substitute for the full
# scripts/chaos/neon-cutover-drill.sh: it can't quantify the data-loss
# window, but it catches doc/implementation drift in seconds by grepping the
# actual scripts. Failed until 2026-09-24 (neither script implemented a
# freeze step); now passes against cmd/maintenance.go's application-level
# write-freeze, wired into neon-rotate.sh + neon-watch.yml. See
# neon-cutover-drill.sh for a live, quantified before/after of the fix, and
# docs/DB_SCALING_100_PROJECTS.md §6.1 for the mechanism.
set -euo pipefail
cd "$(dirname "$0")/../.."

ROTATE="scripts/neon-rotate.sh"
WATCH=".github/workflows/neon-watch.yml"
PATTERN='freeze|maintenance|scale.?(to.?0|down)|pause'

[[ -f "$ROTATE" ]] || { echo "ERROR: ${ROTATE} not found."; exit 1; }

fail=0

echo "==> Checking ${ROTATE} for a write-freeze step before pg_dump…"
# Match the actual invocation (starts at column 1), not a comment mentioning
# "pg_dump" in passing (e.g. "cannot be pg_dump'd").
dump_line="$(grep -n '^pg_dump ' "$ROTATE" | head -1 | cut -d: -f1 || true)"
if [[ -z "$dump_line" ]]; then
  echo "    ERROR: could not even find a pg_dump line in ${ROTATE}."
  fail=1
elif head -n "$((dump_line - 1))" "$ROTATE" | grep -qiE "$PATTERN"; then
  echo "    OK: found a freeze/maintenance/scale-down reference before pg_dump (line ${dump_line})."
else
  echo "    MISSING: no freeze/maintenance/scale-down step found before pg_dump (line ${dump_line})."
  fail=1
fi

echo "==> Checking ${ROTATE} for an unfreeze step after cutover…"
# Match the actual invocation line, not the header comments that also mention
# neon-cutover.sh in passing.
cutover_line="$(grep -n 'bash.*neon-cutover.sh' "$ROTATE" | tail -1 | cut -d: -f1 || true)"
if [[ -n "$cutover_line" ]] && tail -n +"$cutover_line" "$ROTATE" | grep -qiE "$PATTERN"; then
  echo "    OK: found an unfreeze reference after cutover (line ${cutover_line}+)."
else
  echo "    MISSING: no unfreeze/resume step found after the cutover call."
  fail=1
fi

echo "==> Checking ${WATCH} for the same…"
if [[ -f "$WATCH" ]] && grep -qiE "$PATTERN" "$WATCH"; then
  echo "    OK: found a freeze-related reference in ${WATCH}."
else
  echo "    MISSING: ${WATCH} has no freeze/maintenance reference either."
  fail=1
fi

echo
if [[ "$fail" -ne 0 ]]; then
  cat <<'EOF'
RESULT: FAIL -- the rotation pipeline has NO write-freeze around the dump/
restore/cutover window. docs/DB_SCALING_100_PROJECTS.md §6.1/§6.3 documents
one as required (scale the Railway service to 0 / set a maintenance flag
before pg_dump, lift it only after cutover's health-gate succeeds), but
scripts/neon-rotate.sh and .github/workflows/neon-watch.yml never implement
it. Any write to the OLD project between the pg_dump snapshot and the
DATABASE_URL flip is silently lost, and neon-cutover.sh's health-gate
(HTTP 200 + a SELECT count(*) canary) cannot detect that loss.
See scripts/chaos/neon-cutover-drill.sh for a live, quantified reproduction.
EOF
  exit 1
fi

echo "RESULT: PASS -- a freeze/unfreeze step was found in the expected places."
exit 0
