#!/usr/bin/env bash
#
# Neon free-tier compute-quota watcher.
#
# Reads the CURRENT billing-period compute usage for a Neon project via the
# MANAGEMENT API (control-plane — this keeps working even when the project's
# compute is quota-suspended, unlike any SQL connection) and warns before the
# 100 CU-hour free quota is exhausted. Optionally pushes a phone alert via ntfy.
#
# This is the safety net whose ABSENCE caused the 2026-07-20 silent lockout:
# Neon's free tier sends no proactive alert before it suspends compute.
#
# Runs anywhere with bash + curl + jq — locally, or in GitHub Actions
# (.github/workflows/neon-watch.yml) so it lives OUTSIDE the Railway/Neon
# failure domain.
#
# Required env:
#   NEON_API_KEY     personal API key (Neon console → Account → API keys)
#   NEON_PROJECT_ID  the project to watch (e.g. ep-... project id, NOT the endpoint)
# Optional env:
#   NTFY_TOPIC       ntfy.sh topic to POST alerts to (no account needed)
#   WARN_PCT         warn threshold, default 60
#   CRIT_PCT         critical threshold, default 80  (rotate at ~85 — see neon-rotate.sh)
#   QUOTA_CU_HOURS   free quota, default 100
#
# Exit codes: 0 = under WARN, 10 = WARN..CRIT, 20 = >= CRIT (so CI shows red).
#
set -euo pipefail

: "${NEON_API_KEY:?Set NEON_API_KEY (Neon console → Account settings → API keys).}"
: "${NEON_PROJECT_ID:?Set NEON_PROJECT_ID (the project id to watch).}"
WARN_PCT="${WARN_PCT:-60}"
CRIT_PCT="${CRIT_PCT:-80}"
QUOTA_CU_HOURS="${QUOTA_CU_HOURS:-100}"

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required (brew install jq / apt-get install jq)."; exit 2; }

api="https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}"

# The free plan exposes current-period usage directly on the project object.
# (The dedicated /consumption_history endpoints are paid-plan-only — 403 on Free.)
resp="$(curl -fsS -H "Authorization: Bearer ${NEON_API_KEY}" -H "Accept: application/json" "$api")" || {
  echo "ERROR: Neon API call failed. Check NEON_API_KEY / NEON_PROJECT_ID."
  exit 2
}

compute_seconds="$(jq -r '.project.compute_time_seconds // 0' <<<"$resp")"
period_end="$(jq -r '.project.consumption_period_end // "unknown"' <<<"$resp")"
storage_bytes_hour="$(jq -r '.project.data_storage_bytes_hour // 0' <<<"$resp")"
name="$(jq -r '.project.name // env.NEON_PROJECT_ID' <<<"$resp")"

# 1 CU-hour = 3600 CU-seconds. compute_time_seconds is CU-seconds this period.
used_cu_hours="$(awk -v s="$compute_seconds" 'BEGIN{printf "%.2f", s/3600}')"
pct="$(awk -v u="$used_cu_hours" -v q="$QUOTA_CU_HOURS" 'BEGIN{printf "%.1f", (u/q)*100}')"

level="OK"; icon="white_check_mark"; prio="default"; code=0
if awk -v p="$pct" -v c="$CRIT_PCT" 'BEGIN{exit !(p>=c)}'; then
  level="CRITICAL"; icon="rotating_light"; prio="urgent"; code=20
elif awk -v p="$pct" -v w="$WARN_PCT" 'BEGIN{exit !(p>=w)}'; then
  level="WARN"; icon="warning"; prio="high"; code=10
fi

summary="[${level}] Neon '${name}': ${used_cu_hours}/${QUOTA_CU_HOURS} CU-h used (${pct}%). Resets ${period_end}."
echo "$summary"
echo "storage_bytes_hour=${storage_bytes_hour}"

# Push a phone alert only when we've crossed a threshold and a topic is configured.
if [[ -n "${NTFY_TOPIC:-}" && "$code" -ne 0 ]]; then
  action=""
  [[ "$code" -eq 20 ]] && action="ROTATE NOW: bash scripts/neon-rotate.sh (see docs/DB_SCALING_100_PROJECTS.md §7)."
  curl -fsS \
    -H "Title: zcrypt DB quota ${level} (${pct}%)" \
    -H "Priority: ${prio}" \
    -H "Tags: ${icon}" \
    -d "${summary} ${action}" \
    "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null || echo "WARN: ntfy push failed (non-fatal)."
fi

exit "$code"
