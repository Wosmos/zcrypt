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

# Flags (combinable):
#   --gates-only  skips the advisory INSPECT scans (knip/jscpd/golangci). They
#                 never block, so the pre-push hook runs in this fast mode; a
#                 manual `bun run prepush` runs the full suite + detailed report.
#   --enforce     turns on the diff-scoped HARDENING checks — new-code-only
#                 lint/duplication/go-lint that BLOCK the push (see HARDEN below).
#                 The pre-push hook passes this; a manual run omits it.
#
# Old-backlog handling (the whole-repo dead-code / duplication / deep-lint scans):
#   (default)   advisory — reported as warnings, never blocks.
#   --ratchet   BLOCK only if the backlog grew vs the saved baseline; an
#               improvement is locked in automatically. Lets you chip away
#               without a wall. The pre-push hook uses this.
#   --strict    BLOCK on ANY old issue (zero-tolerance, whole repo). Use for
#               deliberate clean-up runs — with ~323 findings today it will
#               block until they're all gone.
#   --baseline  record the current counts as the ratchet baseline, then pass.
#
# Change-scoping: prepush only runs the gates for modules that actually changed
# (vs origin/main + working tree), mirroring the paths-filter in ci.yml. Override
# with PREPUSH_ALL=1 (force full) or PREPUSH_BASE=<ref> (change the diff base).
GATES_ONLY=0
ENFORCE=0
STRICT=0
RATCHET=0
SAVE_BASELINE=0
for arg in "$@"; do
  case "$arg" in
    --gates-only) GATES_ONLY=1 ;;
    --enforce)    ENFORCE=1 ;;
    --strict)     STRICT=1 ;;
    --ratchet)    RATCHET=1 ;;
    --baseline)   SAVE_BASELINE=1 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
FE="$ROOT/app/frontend"
BE="$ROOT/app/backend"
TUI="$ROOT/app/tui"
DESKTOP="$ROOT/app/desktop"
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

# inspect-scan log paths — pre-declared so the report writer is safe under
# `set -u` even in --gates-only mode, where the INSPECT section is skipped and
# these files are never created (fence() renders "(no output)" for missing).
klog="$LOGDIR/knip.log"
jlog="$LOGDIR/jscpd.log"
glog="$LOGDIR/golangci.log"
tglog="$LOGDIR/golangci-tui.log"

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
            "backend gofmt" "backend vet" "backend tests + coverage" "backend build" \
            "tui gofmt" "tui vet" "tui tests" "tui build" \
            "desktop sidecar build" "desktop cargo check")
INSPECT_NAMES=("frontend lint warnings" "frontend dead code" "frontend duplication" "backend deep lint" "tui deep lint")
HARDEN_NAMES=("frontend new-code lint" "frontend new-code duplication" \
              "backend new-code lint" "tui new-code lint")

# ── old-backlog baseline (for --ratchet / --baseline) ───────────────────────────
# A set of B_<check>=<count> lines in docs/ (gitignored, local). Read here; the
# merged set is (re)written at the end only under --baseline or --ratchet.
BASELINE_FILE="$STATE_DIR/prepush-baseline.env"
NEW_BASELINE=()
# shellcheck disable=SC1090
[ -f "$BASELINE_FILE" ] && . "$BASELINE_FILE"

# handle_backlog NAME COUNT — record the count and decide PASS/WARN/FAIL for one
# whole-repo scan, per the active mode. Default advisory; --strict blocks on any;
# --ratchet blocks only on growth (and auto-locks improvements); --baseline just
# records.
handle_backlog() {
  local name="$1" count="$2"
  local key="B_${name// /_}"
  local base="${!key:-}"
  local record="$count"
  if [ "$SAVE_BASELINE" = 1 ]; then
    PASS+=("$name"); ok "baseline recorded: $count"
  elif [ "$STRICT" = 1 ]; then
    if [ "$count" -gt 0 ]; then FAIL+=("$name"); failln "$count issue(s) — strict mode blocks the push"
    else PASS+=("$name"); ok "clean"; fi
  elif [ "$RATCHET" = 1 ]; then
    [ -z "$base" ] && base="$count"            # first run: seed baseline = current
    if [ "$count" -gt "$base" ]; then
      FAIL+=("$name"); failln "backlog grew: ${base} → ${count} — ratchet blocks (drop the new ones)"
      record="$base"                            # keep the target; don't raise it
    elif [ "$count" -lt "$base" ]; then
      WARN+=("$name"); warnln "improved: ${base} → ${count} — locked in"
    else
      PASS+=("$name"); ok "held at ${count} (baseline)"
    fi
  else
    if [ "$count" -gt 0 ]; then WARN+=("$name"); warnln "${count} issue(s) — advisory"
    else PASS+=("$name"); ok "clean"; fi
  fi
  NEW_BASELINE+=("$key=$record")
}

# persist_baseline — merge this run's counts over the previously-loaded ones (so
# modules not scanned this run keep their baseline) and write the file back.
persist_baseline() {
  local kv k v
  for kv in "${NEW_BASELINE[@]:-}"; do [ -n "$kv" ] && eval "$kv"; done
  : > "$BASELINE_FILE"
  for k in B_frontend_lint_warnings B_frontend_dead_code B_frontend_duplication B_backend_deep_lint B_tui_deep_lint; do
    v="${!k:-}"; [ -n "$v" ] && printf '%s=%s\n' "$k" "$v" >> "$BASELINE_FILE"
  done
}

# Inspections run on a full manual run OR whenever a backlog mode needs the counts
# (so the hook's --ratchet still scans even though it passes --gates-only).
RUN_INSPECT=0
if [ "$GATES_ONLY" != 1 ] || [ "$STRICT" = 1 ] || [ "$RATCHET" = 1 ] || [ "$SAVE_BASELINE" = 1 ]; then
  RUN_INSPECT=1
fi

# ── change detection — run only the modules that changed (mirrors ci.yml) ───────
# Diff base defaults to origin/main; falls back to HEAD if that ref is missing.
# Changed set = committed-since-base ∪ staged ∪ unstaged, so a manual run picks up
# work-in-progress too. PREPUSH_ALL=1 forces the full suite.
BASE="${PREPUSH_BASE:-origin/main}"
git rev-parse --verify "$BASE" >/dev/null 2>&1 || BASE="HEAD"
if [ -n "${PREPUSH_CHANGED_OVERRIDE:-}" ]; then
  # Explicit newline-separated file list (e.g. CI feeding its paths-filter, or a
  # scoping dry-run). Skips git entirely.
  CHANGED="$(printf '%s\n' "$PREPUSH_CHANGED_OVERRIDE" | sort -u | sed '/^$/d')"
else
  CHANGED="$({ git diff --name-only "$BASE...HEAD" 2>/dev/null
               git diff --name-only HEAD 2>/dev/null
               git diff --name-only --cached 2>/dev/null; } | sort -u | sed '/^$/d')"
fi

RUN_FE=0; RUN_BE=0; RUN_TUI=0; RUN_DESKTOP=0; SCOPE_NOTE=""
enable_all() { RUN_FE=1; RUN_BE=1; RUN_TUI=1; RUN_DESKTOP=1; }

if [ "${PREPUSH_ALL:-0}" = 1 ]; then
  enable_all; SCOPE_NOTE="PREPUSH_ALL set — full suite"
elif [ -z "$CHANGED" ]; then
  enable_all; SCOPE_NOTE="no diff vs ${BASE} — full suite"
else
  while IFS= read -r f; do
    case "$f" in
      app/frontend/*|tests/e2e/*) RUN_FE=1 ;;
      app/backend/*|tests/load/*) RUN_BE=1 ;;
      app/tui/*)                  RUN_TUI=1 ;;
      app/desktop/*)              RUN_DESKTOP=1 ;;
      # docs / editor / meta — never trigger a build
      *.md|docs/*|.claude/*|.vscode/*|.gitignore|LICENSE*) : ;;
      # anything else shared (scripts/, .github/, root configs, Dockerfile) — play safe
      *) enable_all; SCOPE_NOTE="shared file changed (${f}) — full suite" ;;
    esac
  done <<< "$CHANGED"
  [ -z "$SCOPE_NOTE" ] && SCOPE_NOTE="scoped to changed modules (vs ${BASE})"
fi

MODS=""
[ "$RUN_FE" = 1 ]      && MODS="${MODS}frontend "
[ "$RUN_BE" = 1 ]      && MODS="${MODS}backend "
[ "$RUN_TUI" = 1 ]     && MODS="${MODS}tui "
[ "$RUN_DESKTOP" = 1 ] && MODS="${MODS}desktop "
[ -z "$MODS" ] && MODS="(nothing to check) "

echo ""
printf '%s╔════════════════════════════════════════════════════════════╗%s\n' "$BOLD" "$RST"
printf '%s║  prepush — quality gate                                    ║%s\n' "$BOLD" "$RST"
printf '%s╚════════════════════════════════════════════════════════════╝%s\n' "$BOLD" "$RST"
printf '%sreport v%s · run #%s · commit %s (%s)%s%s%s%s%s%s\n' "$CYN" "$VERSION" "$RUN_NO" "$COMMIT_SHA" "$BRANCH" \
  "$([ "$GATES_ONLY" = 1 ] && printf ' · gates-only')" \
  "$([ "$ENFORCE" = 1 ] && printf ' · enforce')" \
  "$([ "$RATCHET" = 1 ] && printf ' · ratchet')" \
  "$([ "$STRICT" = 1 ] && printf ' · strict')" \
  "$([ "$SAVE_BASELINE" = 1 ] && printf ' · baseline')" "$RST"
printf '%s↳ %s%s\n' "$DIM" "$SCOPE_NOTE" "$RST"
printf '%s↳ modules: %s%s\n' "$DIM" "$MODS" "$RST"

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — frontend
# ══════════════════════════════════════════════════════════════════════════════

if [ "$RUN_FE" = 1 ]; then

if gate "frontend typecheck" "$FE" bun run typecheck; then
  ok "no type errors"
fi

# The gate blocks on eslint ERRORS. Warnings don't fail it here — they are
# ratcheted in the INSPECT section (can only shrink), and NEW warnings in files
# you touch are blocked by --enforce (eslint --max-warnings=0 on changed files).
if gate "frontend lint" "$FE" bun run lint; then
  lwc=$(grep -cE ' warning ' "$LOGDIR/frontend_lint.log" 2>/dev/null || echo 0)
  if [ "$lwc" -gt 0 ]; then ok "no errors ${DIM}(${lwc} warnings — ratcheted below)${RST}"; else ok "clean"; fi
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

else
  step "frontend gates ${DIM}(skipped — no frontend changes)${RST}"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — backend
# ══════════════════════════════════════════════════════════════════════════════

if [ "$RUN_BE" = 1 ]; then

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

else
  step "backend gates ${DIM}(skipped — no backend changes)${RST}"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — tui
# ══════════════════════════════════════════════════════════════════════════════

if [ "$RUN_TUI" = 1 ]; then

step "tui gofmt ${DIM}(gate)${RST}"
tuifmt="$(cd "$TUI" && gofmt -l . 2>/dev/null)"
if [ -z "$tuifmt" ]; then
  PASS+=("tui gofmt"); ok "all files formatted"
  echo "all files formatted" > "$LOGDIR/tui_gofmt.log"
else
  FAIL+=("tui gofmt"); failln "unformatted files (fix: cd app/tui && gofmt -w .):"
  echo "$tuifmt" | sed 's/^/    /'
  { echo "unformatted files (fix: gofmt -w .):"; echo "$tuifmt"; } > "$LOGDIR/tui_gofmt.log"
fi

if gate "tui vet" "$TUI" go vet ./...; then
  ok "no issues"
fi

if gate "tui tests" "$TUI" go test ./...; then
  grep -E '^ok ' "$LOGDIR/tui_tests.log" | sed -E 's/\t+/ /g' | summarise
fi

if gate "tui build" "$TUI" go build ./...; then
  ok "builds clean"
fi

else
  step "tui gates ${DIM}(skipped — no tui changes)${RST}"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  GATES — desktop (light compile check; full Tauri bundle stays in desktop.yml)
# ══════════════════════════════════════════════════════════════════════════════

if [ "$RUN_DESKTOP" = 1 ]; then

if gate "desktop sidecar build" "$DESKTOP/sidecar" go build ./...; then
  ok "sidecar builds"
fi

if command -v cargo >/dev/null 2>&1; then
  # tauri::generate_context! validates that `frontendDist` exists at compile
  # time. A real static export is heavy (a full `bun run build`) and pointless
  # just to type-check Rust — drop in a minimal placeholder if the export isn't
  # already present so cargo can actually run. (frontend-dist is gitignored.)
  DESKTOP_DIST="$DESKTOP/frontend-dist"
  DESKTOP_DIST_STUB=0
  if [ ! -d "$DESKTOP_DIST" ]; then
    mkdir -p "$DESKTOP_DIST"
    printf '<!doctype html><title>zcrypt</title>\n' > "$DESKTOP_DIST/index.html"
    DESKTOP_DIST_STUB=1
  fi
  if gate "desktop cargo check" "$DESKTOP/src-tauri" cargo check --quiet; then
    ok "rust type-checks"
  fi
  # Remove only the placeholder we created; never touch a real export.
  [ "$DESKTOP_DIST_STUB" = 1 ] && rm -rf "$DESKTOP_DIST"
else
  warnln "cargo not installed — skipping desktop cargo check (install rust to enable)"
fi

else
  step "desktop gates ${DIM}(skipped — no desktop changes)${RST}"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  INSPECT — advisory quality signals (never block)
# ══════════════════════════════════════════════════════════════════════════════

MODE_LABEL="advisory"
[ "$RATCHET" = 1 ]      && MODE_LABEL="ratchet — blocks on growth"
[ "$STRICT" = 1 ]       && MODE_LABEL="strict — blocks on any"
[ "$SAVE_BASELINE" = 1 ] && MODE_LABEL="recording baseline"

# count_knip LOG → total dead-code findings (sum of the "(N)" summary counts)
count_knip() { grep -oE '\([0-9]+\)' "$1" 2>/dev/null | tr -d '()' | awk '{s+=$1} END{print s+0}'; }
# count_golangci LOG → issue count ("N issues" line, else fallback to finding lines)
count_golangci() {
  local n; n="$(grep -oE '^[0-9]+ issues?' "$1" 2>/dev/null | grep -oE '[0-9]+' | tail -1)"
  [ -z "$n" ] && n="$(grep -cE '\.go:[0-9]+:[0-9]+:' "$1" 2>/dev/null || echo 0)"
  echo "${n:-0}"
}

if [ "$RUN_INSPECT" != 1 ]; then
  step "inspections ${DIM}(skipped — --gates-only)${RST}"
  note "run 'bun run prepush' for the backlog · --strict/--ratchet to enforce old code"
else

if [ "$RUN_FE" = 1 ]; then
  # eslint warnings — reuse the lint gate's output (no second eslint run). Errors
  # already blocked at the gate; here the WARNING count is ratcheted.
  step "frontend lint warnings ${DIM}(inspect · eslint · ${MODE_LABEL})${RST}"
  lwcount="$(grep -cE ' warning ' "$LOGDIR/frontend_lint.log" 2>/dev/null || echo 0)"
  [ "$lwcount" -gt 0 ] && note "→ cd app/frontend && bun run lint"
  handle_backlog "frontend lint warnings" "$lwcount"

  # knip — dead code: unused files, exports, dependencies
  step "frontend dead code ${DIM}(inspect · knip · ${MODE_LABEL})${RST}"
  klog="$LOGDIR/knip.log"
  (cd "$FE" && bun run knip) >"$klog" 2>&1
  ksummary="$(grep -E '^(Unused|Unlisted|Unresolved|Duplicate|Configuration).*\([0-9]+\)' "$klog")"
  [ -n "$ksummary" ] && { echo "$ksummary" | sed 's/^/      /'; note "→ cd app/frontend && bun run knip"; }
  handle_backlog "frontend dead code" "$(count_knip "$klog")"

  # jscpd — copy-paste / DRY violations
  step "frontend duplication ${DIM}(inspect · jscpd · ${MODE_LABEL})${RST}"
  jlog="$LOGDIR/jscpd.log"
  (cd "$FE" && bun run dupes) >"$jlog" 2>&1
  jcount="$(grep -oE 'Found [0-9]+ clones' "$jlog" | grep -oE '[0-9]+' | head -1)"; jcount="${jcount:-0}"
  jtotal="$(grep -E '^\s*Total:' "$jlog" | head -1 | tr -s ' ')"
  [ "$jcount" -gt 0 ] && { [ -n "$jtotal" ] && note "$jtotal"; note "→ cd app/frontend && bun run dupes"; }
  handle_backlog "frontend duplication" "$jcount"
fi  # end RUN_FE inspections

# golangci-lint — deep Go analysis: dead code, dup, security (gosec),
# bad practice (revive/staticcheck/errcheck). Run for backend and TUI.
if command -v golangci-lint >/dev/null 2>&1; then
  if [ "$RUN_BE" = 1 ]; then
    step "backend deep lint ${DIM}(inspect · golangci-lint · ${MODE_LABEL})${RST}"
    glog="$LOGDIR/golangci.log"
    (cd "$BE" && golangci-lint run ./...) >"$glog" 2>&1
    gc="$(count_golangci "$glog")"
    [ "$gc" -gt 0 ] && note "→ cd app/backend && golangci-lint run ./..."
    handle_backlog "backend deep lint" "$gc"
  fi
  if [ "$RUN_TUI" = 1 ]; then
    step "tui deep lint ${DIM}(inspect · golangci-lint · ${MODE_LABEL})${RST}"
    tglog="$LOGDIR/golangci-tui.log"
    (cd "$TUI" && golangci-lint run ./...) >"$tglog" 2>&1
    tgc="$(count_golangci "$tglog")"
    [ "$tgc" -gt 0 ] && note "→ cd app/tui && golangci-lint run ./..."
    handle_backlog "tui deep lint" "$tgc"
  fi
elif [ "$RUN_BE" = 1 ] || [ "$RUN_TUI" = 1 ]; then
  step "go deep lint ${DIM}(inspect)${RST}"
  warnln "golangci-lint not installed — skipping (brew install golangci-lint)"
fi

fi  # end: RUN_INSPECT guard

# Persist the (merged) baseline so --ratchet has a moving target and --baseline
# records it. Advisory/strict runs leave the baseline untouched.
if [ "$SAVE_BASELINE" = 1 ] || [ "$RATCHET" = 1 ]; then
  persist_baseline
fi

# ══════════════════════════════════════════════════════════════════════════════
#  HARDEN — diff-scoped, BLOCKING (only with --enforce; used by the pre-push hook)
# ══════════════════════════════════════════════════════════════════════════════
# These fail the push only on issues your CHANGE introduces — the pre-existing
# backlog never blocks you. Scope: files changed vs $BASE. Runs even in
# --gates-only mode (the hook wants it fast AND enforcing), independent of the
# advisory INSPECT scans above.
if [ "$ENFORCE" = 1 ]; then
  # changed frontend source files, relative to app/frontend/
  fe_files="$(echo "$CHANGED" | grep -E '^app/frontend/.*\.(ts|tsx|js|jsx)$' | sed 's#^app/frontend/##' || true)"

  # 1) frontend new-code lint — zero-tolerance on files you touched
  if [ "$RUN_FE" = 1 ] && [ -n "$fe_files" ]; then
    step "frontend new-code lint ${DIM}(harden · eslint --max-warnings=0)${RST}"
    hlog="$LOGDIR/frontend_new-code_lint.log"
    # shellcheck disable=SC2086
    if (cd "$FE" && bunx eslint --max-warnings=0 $fe_files) >"$hlog" 2>&1; then
      PASS+=("frontend new-code lint"); ok "changed files clean (no errors or warnings)"
    else
      FAIL+=("frontend new-code lint"); failln "lint issues in changed files — output below:"
      sed 's/^/    /' "$hlog"
    fi

    # 2) frontend new-code duplication — copy-paste within your changeset
    step "frontend new-code duplication ${DIM}(harden · jscpd on changed files)${RST}"
    hlog="$LOGDIR/frontend_new-code_duplication.log"
    # shellcheck disable=SC2086
    (cd "$FE" && bunx jscpd --silent $fe_files) >"$hlog" 2>&1
    hclones="$(grep -oE 'Found [0-9]+ clones' "$hlog" | head -1)"
    if [ -z "$hclones" ] || echo "$hclones" | grep -q 'Found 0 '; then
      PASS+=("frontend new-code duplication"); ok "no copy-paste in changed files"
    else
      FAIL+=("frontend new-code duplication"); failln "$hclones in changed files:"
      grep -E 'Clone found|-\s' "$hlog" | head -12 | sed 's/^/    /'
    fi
  fi

  # 3) backend new-code lint — golangci new-from-rev = only issues on changed lines
  if [ "$RUN_BE" = 1 ] && command -v golangci-lint >/dev/null 2>&1; then
    step "backend new-code lint ${DIM}(harden · golangci --new-from-rev)${RST}"
    hlog="$LOGDIR/backend_new-code_lint.log"
    if (cd "$BE" && golangci-lint run --new-from-rev="$BASE" ./...) >"$hlog" 2>&1; then
      PASS+=("backend new-code lint"); ok "no new findings on changed lines"
    else
      FAIL+=("backend new-code lint"); failln "new findings on changed lines — output below:"
      sed 's/^/    /' "$hlog"
    fi
  fi

  # 4) tui new-code lint — same, for the TUI module
  if [ "$RUN_TUI" = 1 ] && command -v golangci-lint >/dev/null 2>&1; then
    step "tui new-code lint ${DIM}(harden · golangci --new-from-rev)${RST}"
    hlog="$LOGDIR/tui_new-code_lint.log"
    if (cd "$TUI" && golangci-lint run --new-from-rev="$BASE" ./...) >"$hlog" 2>&1; then
      PASS+=("tui new-code lint"); ok "no new findings on changed lines"
    else
      FAIL+=("tui new-code lint"); failln "new findings on changed lines — output below:"
      sed 's/^/    /' "$hlog"
    fi
  fi
fi  # end: ENFORCE

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
    echo "## Hardening — new-code, blocking (only with --enforce)"
    echo
    echo "| Check | Result |"
    echo "|---|---|"
    for n in "${HARDEN_NAMES[@]}"; do printf '| %s | %s |\n' "$n" "$(md_status "$(status_of "$n")")"; done
    echo
    printf '| _Modules run this session_ | %s |\n' "$MODS"
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
    echo
    echo "## TUI deep lint — golangci-lint"
    echo
    fence "$tglog"

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
