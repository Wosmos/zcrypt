#!/bin/sh
# Seeds a shared "mock" platform token for the Docker load-testing sandbox
# (docker-compose.loadtest.yml). Runs once via the `seed` service: registers
# one fixed user, connects the mock platform, and marks that token global
# (HandleToggleTokenScope's is_global flag) so every k6 VU -- each of which
# registers its own throwaway user via tests/load/k6's helpers -- rides this
# one shared adapter automatically, with zero per-VU platform-connect calls.
#
# Idempotent: safe to re-run against an already-seeded stack.
set -eu

BASE_URL="${SEED_BASE_URL:-http://backend:8080}"
EMAIL="loadtest-seed@test.zcrypt.io"
PASSWORD="LoadTestSeed!2026"
MOCK_TOKEN="loadtest-mock-token"

# Pulls the first "field":"value" match's value out of a flat JSON string.
# Good enough for this script's own simple, known response shapes -- avoids
# depending on jq being present in the minimal curl image.
json_field() {
  field="$1"
  printf '%s' "$2" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 |
    sed -E "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"/\1/"
}

echo "==> Waiting for backend at $BASE_URL..."
i=0
until curl -sf "$BASE_URL/api/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "ERROR: backend never became healthy at $BASE_URL/api/health" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Registering seed user (ignore already-exists)..."
curl -s -o /dev/null -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"username\":\"loadtest-seed\"}" || true

echo "==> Logging in..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(json_field access_token "$LOGIN_RESP")
if [ -z "$TOKEN" ]; then
  echo "ERROR: could not log in seed user. Response: $LOGIN_RESP" >&2
  exit 1
fi

echo "==> Connecting mock platform (ignore already-connected)..."
curl -s -o /dev/null -X POST "$BASE_URL/api/platforms/connect" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"mock\",\"token\":\"$MOCK_TOKEN\"}" || true

echo "==> Reading back the mock platform's token id..."
STATUS_RESP=$(curl -s "$BASE_URL/api/platforms/status" -H "Authorization: Bearer $TOKEN")
# Isolate the JSON object whose "platform" is "mock" before pulling its
# token_id, so this can't accidentally grab an unrelated platform's id.
MOCK_OBJ=$(printf '%s' "$STATUS_RESP" | grep -o '{[^{}]*"platform"[[:space:]]*:[[:space:]]*"mock"[^{}]*}' | head -1)
TOKEN_ID=$(json_field token_id "$MOCK_OBJ")
if [ -z "$TOKEN_ID" ]; then
  echo "ERROR: could not find mock platform's token_id. Response: $STATUS_RESP" >&2
  exit 1
fi

echo "==> Marking mock token global (shared across all k6 VUs)..."
curl -s -o /dev/null -X PUT "$BASE_URL/api/platforms/tokens/$TOKEN_ID/scope" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_global": true}'

echo "==> Seed complete. Every k6 VU now rides the shared mock adapter."
