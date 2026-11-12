#!/usr/bin/env bash
set -euo pipefail
dist="${1:?usage: check-native-bundle.sh <frontend-dist>}"
fail=0
if find "$dist" -path '*admin*' -print -quit | grep -q .; then
  echo "::error::admin files found in the app bundle:"
  find "$dist" -path '*admin*' | head -20
  fail=1
fi
if grep -rlF "/api/admin" "$dist" >/dev/null 2>&1; then
  echo "::error::admin API calls found in the app bundle:"
  grep -rlF "/api/admin" "$dist" | head -20
  fail=1
fi
[ "$fail" -eq 0 ] && echo "app bundle has no admin pages or admin API calls"
exit "$fail"
