#!/usr/bin/env bash
# Plain-text release notes for a tag, built from the conventional commits since
# the previous version tag:
#
#   scripts/release-notes.sh v0.1.8
#
# When app/frontend/lib/changelog.json lists the version, the curated entry from
# app/frontend/messages/site/changelog/en.json is printed instead (New /
# Improved / Fixed / Security). Versions without a curated entry fall back to
# the commit-based notes below.
#
# GitHub's generated notes only list merged pull requests, and releases here are
# cut from direct pushes, so they came out empty. This lists feat commits under
# "New" and fix/perf commits under "Fixed". The output is plain text because
# the desktop app's update dialog shows it as-is.
set -euo pipefail

tag="${1:?usage: release-notes.sh <tag>}"
max="${RELEASE_NOTES_MAX:-12}"

curated() {
  local root version key
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  version="${tag#v}"
  key="v${version//./_}"
  command -v jq >/dev/null 2>&1 || return 1
  jq -r --arg v "$version" --arg k "$key" --slurpfile en "$root/app/frontend/messages/site/changelog/en.json" '
    ($en[0].changelog[$k].items // {}) as $items
    | (map(select(.version == $v)) | first // empty)
    | .groups[]
    | ({new: "New", improved: "Improved", fixed: "Fixed", security: "Security"}[.kind]) as $title
    | $title, (.items[] | "- " + ($items[.] // .)), ""
  ' "$root/app/frontend/lib/changelog.json" 2>/dev/null
}

if notes="$(curated)" && [ -n "$notes" ]; then
  printf '%s\n' "$notes"
  exit 0
fi

prev="$(git describe --tags --abbrev=0 --match 'v[0-9]*' "${tag}^" 2>/dev/null || true)"
range="${prev:+${prev}..}${tag}"

subjects="$(git log --no-merges --format=%s "$range")"

section() {
  local title="$1" pattern="$2" lines count
  lines="$(printf '%s\n' "$subjects" \
    | grep -E "^(${pattern})(\([^)]*\))?!?: " \
    | sed -E 's/^[a-z]+(\([^)]*\))?!?: //' \
    | awk '!seen[$0]++ { print "- " toupper(substr($0, 1, 1)) substr($0, 2) }' || true)"
  [ -n "$lines" ] || return 0
  count="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  printf '%s\n' "$title"
  printf '%s\n' "$lines" | head -n "$max"
  if [ "$count" -gt "$max" ]; then
    printf -- '- and %s more\n' "$((count - max))"
  fi
  printf '\n'
}

notes="$(section "New" "feat"; section "Fixed" "fix|perf")"
if [ -z "$notes" ]; then
  notes="Small fixes and improvements."
fi
printf '%s\n' "$notes"
