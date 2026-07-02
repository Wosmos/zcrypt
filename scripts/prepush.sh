#!/usr/bin/env bash
#
# prepush — local quality gate. Run it by hand before pushing:
#
#     cd app/frontend && bun run prepush     # or: bash scripts/prepush.sh
#
# It is NOT wired into a git hook — nothing runs it automatically on `git push`.
# It is deliberately heavy (full builds, tests, deep static analysis), so you
# choose when to pay that cost.
#
# Two tiers:
#   GATES     block the push — type errors, lint errors, failing tests, broken
#             builds, unformatted Go. Fix these before pushing.
#   INSPECT   advisory quality signals — dead code, duplication, security,
#             bad-practice lint. Reported, never blocking (the codebase carries
#             pre-existing findings). Each prints a summary + the command to see
#             the full report.
#
# Every step runs to completion even if an earlier one fails, so one run tells
# you everything that is wrong.

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
FE="$ROOT/app/frontend"
BE="$ROOT/app/backend"
LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

# ── commit-scoped versioning ───────────────────────────────────────────────────
# The report version bumps ONCE PER COMMIT, not per run. Running prepush ten
# times on the same HEAD keeps the same version (run count increments); a new
# commit bumps the version. The report + state files live in docs/ and are
# gitignored (local artifacts, regenerated each run).
STATE_DIR="$ROOT/docs"
STATE="$STATE_DIR/state.env"
HISTORY="$STATE_DIR/history.tsv"
REPORT="$STATE_DIR/report.md"
REPORT_REL="docs/report.md"
mkdir -p "$STATE_DIR"

COMMIT_FULL="$(git rev-parse HEAD 2>/dev/null || echo none)"
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
COMMIT_MSG="$(git log -1 --pretty=%s 2>/dev/null || echo '(no commits yet)')"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
RUN_TS="$(date '+%Y-%m-%d %H:%M:%S %z')"

PREV_VERSION=0; PREV_SHA=""; RUN_NO=0
# shellcheck disable=SC1090
[ -f "$STATE" ] && . "$STATE"
if [ "$COMMIT_FULL" = "$PREV_SHA" ]; then
  VERSION="$PREV_VERSION"; RUN_NO=$((RUN_NO + 1))
else
  VERSION=$((PREV_VERSION + 1)); RUN_NO=1
fi

# ── colours (disabled when not a TTY) ──────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YEL=$'\033[33m'; CYN=$'\033[36m'; RST=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GRN=""; YEL=""; CYN=""; RST=""
fi

PASS=(); WARN=(); FAIL=()

hr()      { printf '%s────────────────────────────────────────────────────────────%s\n' "$DIM" "$RST"; }
step()    { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RST"; }
ok()      { printf '  %s✓ %s%s\n' "$GRN" "$1" "$RST"; }
warnln()  { printf '  %s! %s%s\n' "$YEL" "$1" "$RST"; }
failln()  { printf '  %s✗ %s%s\n' "$RED" "$1" "$RST"; }
note()    { printf '  %s%s%s\n' "$DIM" "$1" "$RST"; }

# gate NAME DIR CMD...  — blocking. Streams nothing; captures, shows curated
# result on pass, full log on fail.
gate() {
  local name="$1" dir="$2"; shift 2
  local log="$LOGDIR/${name// /_}.log"
  step "$name ${DIM}(gate)${RST}"
  if (cd "$dir" && "$@") >"$log" 2>&1; then
    PASS+=("$name")
    return 0
  else
    FAIL+=("$name")
    failln "FAILED — output below:"
    sed 's/^/    /' "$log"
    return 1
  fi
}

strip_ansi() { sed $'s/\033\\[[0-9;]*m//g'; }

summarise() { # pretty-print curated lines from a step's log
  while IFS= read -r line; do note "$line"; done
}

# status_of NAME  → PASS | WARN | FAIL | -   (looks the name up in the arrays)
status_of() {
  local n="$1" x
  for x in "${FAIL[@]:-}"; do [ "$x" = "$n" ] && { echo FAIL; return; }; done
  for x in "${WARN[@]:-}"; do [ "$x" = "$n" ] && { echo WARN; return; }; done
  for x in "${PASS[@]:-}"; do [ "$x" = "$n" ] && { echo PASS; return; }; done
  echo "-"
}
md_status() {
  case "$1" in
    PASS) echo "✅ PASS";; WARN) echo "⚠️ WARN";;
    FAIL) echo "❌ FAIL";; *) echo "— skipped";;
  esac
}
GATE_NAMES=("frontend typecheck" "frontend lint" "frontend tests + coverage" "frontend build" \
            "backend gofmt" "backend vet" "backend tests + coverage" "backend build")
INSPECT_NAMES=("frontend dead code" "frontend duplication" "backend deep lint")

echo ""
printf '%s╔════════════════════════════════════════════════════════════╗%s\n' "$BOLD" "$RST"
printf '%s║  prepush — quality gate                                    ║%s\n' "$BOLD" "$RST"
printf '%s╚════════════════════════════════════════════════════════════╝%s\n' "$BOLD" "$RST"
printf '%sreport v%s · run #%s · commit %s (%s)%s\n' "$CYN" "$VERSION" "$RUN_NO" "$COMMIT_SHA" "$BRANCH" "$RST"

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — frontend
# ══════════════════════════════════════════════════════════════════════════════

if gate "frontend typecheck" "$FE" bun run typecheck; then
  ok "no type errors"
fi

if gate "frontend lint" "$FE" bun run lint; then
  wc=$(grep -cE 'warning' "$LOGDIR/frontend_lint.log" 2>/dev/null || echo 0)
  if [ "$wc" -gt 0 ]; then ok "no errors ${DIM}(${wc} warnings — see: bun run lint)${RST}"; else ok "clean"; fi
fi

if gate "frontend tests + coverage" "$FE" bun run test:coverage; then
  strip_ansi <"$LOGDIR/frontend_tests_+_coverage.log" \
    | grep -E 'Tests +[0-9]+ (passed|failed)' | head -1 | sed 's/^ *//' | summarise
  # show the 4-line coverage summary block
  strip_ansi <"$LOGDIR/frontend_tests_+_coverage.log" \
    | grep -E 'Statements|Branches|Functions|Lines' | summarise
fi

if gate "frontend build" "$FE" bun run build; then
  grep -E 'Compiled successfully|Finished' "$LOGDIR/frontend_build.log" | head -1 | summarise
fi

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — backend
# ══════════════════════════════════════════════════════════════════════════════

step "backend gofmt ${DIM}(gate)${RST}"
unformatted="$(cd "$BE" && gofmt -l . 2>/dev/null)"
if [ -z "$unformatted" ]; then
  PASS+=("backend gofmt"); ok "all files formatted"
  echo "all files formatted" > "$LOGDIR/backend_gofmt.log"
else
  FAIL+=("backend gofmt"); failln "unformatted files (fix: cd app/backend && gofmt -w .):"
  echo "$unformatted" | sed 's/^/    /'
  { echo "unformatted files (fix: gofmt -w .):"; echo "$unformatted"; } > "$LOGDIR/backend_gofmt.log"
fi

if gate "backend vet" "$BE" go vet ./...; then
  ok "no issues"
fi

if gate "backend tests + coverage" "$BE" go test -cover ./...; then
  # only packages that actually have tests (skip the 0.0% "no test files" noise)
  grep -E '^ok .*coverage: [0-9]' "$LOGDIR/backend_tests_+_coverage.log" \
    | sed -E 's/\t+/ /g' | summarise
fi

if gate "backend build" "$BE" go build -o /dev/null .; then
  ok "builds clean"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  INSPECT — advisory quality signals (never block)
# ══════════════════════════════════════════════════════════════════════════════

# knip — dead code: unused files, exports, dependencies
step "frontend dead code ${DIM}(inspect · knip)${RST}"
klog="$LOGDIR/knip.log"
(cd "$FE" && bun run knip) >"$klog" 2>&1
ksummary="$(grep -E '^(Unused|Unlisted|Unresolved|Duplicate|Configuration).*\([0-9]+\)' "$klog")"
if [ -z "$ksummary" ]; then
  PASS+=("frontend dead code"); ok "no dead code found"
else
  WARN+=("frontend dead code"); warnln "dead code found:"
  echo "$ksummary" | sed 's/^/      /'
  note "→ full report: cd app/frontend && bun run knip"
fi

# jscpd — copy-paste / DRY violations
step "frontend duplication ${DIM}(inspect · jscpd)${RST}"
jlog="$LOGDIR/jscpd.log"
(cd "$FE" && bun run dupes) >"$jlog" 2>&1
jclones="$(grep -oE 'Found [0-9]+ clones' "$jlog" | head -1)"
jtotal="$(grep -E '^\s*Total:' "$jlog" | head -1 | tr -s ' ')"
if [ -z "$jclones" ] || echo "$jclones" | grep -q 'Found 0 '; then
  PASS+=("frontend duplication"); ok "no significant duplication"
else
  WARN+=("frontend duplication"); warnln "$jclones"
  [ -n "$jtotal" ] && note "$jtotal"
  note "→ full report: cd app/frontend && bun run dupes"
fi

# golangci-lint — deep Go analysis: dead code (unused), dup (dupl),
# security (gosec), bad practice (revive/staticcheck/errcheck)
step "backend deep lint ${DIM}(inspect · golangci-lint)${RST}"
glog="$LOGDIR/golangci.log"
if command -v golangci-lint >/dev/null 2>&1; then
  (cd "$BE" && golangci-lint run ./...) >"$glog" 2>&1
  gsummary="$(awk '/^[0-9]+ issues:/{f=1} f' "$glog")"
  if [ -z "$gsummary" ]; then
    PASS+=("backend deep lint"); ok "no findings"
  else
    WARN+=("backend deep lint"); warnln "findings:"
    echo "$gsummary" | sed 's/^/      /'
    note "→ full report: cd app/backend && golangci-lint run ./..."
  fi
else
  warnln "golangci-lint not installed — skipping (brew install golangci-lint)"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  VERDICT
# ══════════════════════════════════════════════════════════════════════════════

if [ "${#FAIL[@]}" -gt 0 ]; then
  VERDICT="FAILED"; VERDICT_MD="❌ **FAILED** — ${#FAIL[@]} gate(s) broke"
elif [ "${#WARN[@]}" -gt 0 ]; then
  VERDICT="PASSED (advisories)"; VERDICT_MD="✅ **PASSED** — ${#PASS[@]} gates clean, ${#WARN[@]} advisory warning(s)"
else
  VERDICT="PASSED"; VERDICT_MD="✅ **PASSED** — all ${#PASS[@]} gates clean"
fi

# ── persist versioning state + append run to history ───────────────────────────
{ echo "PREV_VERSION=$VERSION"; echo "PREV_SHA=$COMMIT_FULL"; echo "RUN_NO=$RUN_NO"; } > "$STATE"
printf '%s\t%s\t%s\t%s\t%s\n' "$VERSION" "$RUN_NO" "$COMMIT_SHA" "$VERDICT" "$RUN_TS" >> "$HISTORY"

# ── detailed report (everything the terminal only summarised) ───────────────────
fence() { # fence LOGFILE — dump a log file into a ```text code block, ANSI-stripped
  echo '```text'
  if [ -f "$1" ]; then strip_ansi < "$1" | sed 's/`/'"'"'/g'; else echo "(no output)"; fi
  echo '```'
}

write_report() {
  {
    echo "# Prepush Report"
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| **Version** | \`v${VERSION}\` · run #${RUN_NO} on this commit |"
    echo "| **Commit** | \`${COMMIT_SHA}\` — ${COMMIT_MSG} |"
    echo "| **Branch** | \`${BRANCH}\` |"
    echo "| **Run at** | ${RUN_TS} |"
    echo "| **Verdict** | ${VERDICT_MD} |"
    echo
    echo "> **Version is commit-scoped.** It bumps once per commit — re-running on the"
    echo "> same commit keeps the version and only increments the run count."
    echo
    echo "## Gates (blocking)"
    echo
    echo "| Check | Result |"
    echo "|---|---|"
    for n in "${GATE_NAMES[@]}"; do printf '| %s | %s |\n' "$n" "$(md_status "$(status_of "$n")")"; done
    echo
    echo "## Inspections (advisory)"
    echo
    echo "| Check | Result |"
    echo "|---|---|"
    for n in "${INSPECT_NAMES[@]}"; do printf '| %s | %s |\n' "$n" "$(md_status "$(status_of "$n")")"; done
    echo
    echo "## Coverage"
    echo
    echo "### Frontend — lib · hooks · store (UI is Playwright-tested, excluded here)"
    echo
    strip_ansi < "$LOGDIR/frontend_tests_+_coverage.log" \
      | awk '/Coverage report from/{f=1} f{print} /^=+$/{if(f)exit}' \
      | { echo '```text'; sed 's/`/'"'"'/g'; echo '```'; }
    echo
    echo "### Backend — per package"
    echo
    strip_ansi < "$LOGDIR/backend_tests_+_coverage.log" | sed -E 's/\t+/  /g' \
      | { echo '```text'; sed 's/`/'"'"'/g'; echo '```'; }
    echo
    echo "## Dead code — knip"
    echo
    fence "$klog"
    echo
    echo "## Duplication — jscpd"
    echo
    fence "$jlog"
    echo
    echo "## Backend deep lint — golangci-lint"
    echo
    fence "$glog"

    # failing-gate logs, if any
    if [ "${#FAIL[@]}" -gt 0 ]; then
      echo
      echo "## Failing gate logs"
      for n in "${FAIL[@]}"; do
        echo
        echo "### ${n}"
        echo
        fence "$LOGDIR/${n// /_}.log"
      done
    fi

    # version history — one row per version (latest run of each), newest last
    echo
    echo "## Version history"
    echo
    echo "| Version | Runs | Commit | Verdict | Last run |"
    echo "|---|---|---|---|---|"
    awk -F'\t' '{row[$1]=$0} END{for (v in row) print row[v]}' "$HISTORY" \
      | sort -t"$(printf '\t')" -k1,1n | tail -15 \
      | awk -F'\t' '{printf "| v%s | %s | `%s` | %s | %s |\n", $1, $2, $3, $4, $5}'
    echo
    echo "---"
    echo "_Generated by \`scripts/prepush.sh\`. This file is gitignored — it is a local artifact, regenerated each run._"
  } > "$REPORT"
}
write_report

# ══════════════════════════════════════════════════════════════════════════════
#  TERMINAL SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

echo ""
hr
printf '%s  prepush summary%s  %sv%s · run #%s%s\n' "$BOLD" "$RST" "$DIM" "$VERSION" "$RUN_NO" "$RST"
hr
for s in "${PASS[@]:-}"; do [ -n "$s" ] && printf '  %s%-5s%s %s\n' "$GRN" "PASS" "$RST" "$s"; done
for s in "${WARN[@]:-}"; do [ -n "$s" ] && printf '  %s%-5s%s %s %s(advisory)%s\n' "$YEL" "WARN" "$RST" "$s" "$DIM" "$RST"; done
for s in "${FAIL[@]:-}"; do [ -n "$s" ] && printf '  %s%-5s%s %s\n' "$RED" "FAIL" "$RST" "$s"; done
echo ""
printf '  %s📄 full detail: %s%s\n' "$DIM" "$REPORT_REL" "$RST"
echo ""

if [ "${#FAIL[@]}" -gt 0 ]; then
  printf '%s✗ prepush FAILED%s — %d gate(s) broke: %s\n' "$RED" "$RST" "${#FAIL[@]}" "${FAIL[*]}"
  printf '  fix the gate(s) above, then re-run: %sbun run prepush%s\n\n' "$BOLD" "$RST"
  exit 1
fi

if [ "${#WARN[@]}" -gt 0 ]; then
  printf '%s✓ prepush PASSED%s — %d gate(s) clean, %d advisory warning(s) worth a look\n\n' \
    "$GRN" "$RST" "${#PASS[@]}" "${#WARN[@]}"
else
  printf '%s✓ prepush PASSED%s — %d gate(s) clean, nothing flagged\n\n' "$GRN" "$RST" "${#PASS[@]}"
fi
exit 0
