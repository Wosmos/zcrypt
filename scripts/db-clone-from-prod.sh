#!/usr/bin/env bash
#
# Copy zcrypt PROD data into your LOCAL Postgres (Postgres.app).
#
#   *** This only READS from prod (pg_dump). It can NEVER modify prod. ***
#
# It recreates your LOCAL db each run, so it's safe to re-run anytime
# to get fresh data.
#
# Prereqs: Postgres.app installed and running (green elephant), with its
# tools on your PATH so `psql` / `pg_dump` work in the terminal.
#
# Usage:
#   export PROD_DATABASE_URL="<prod NON-POOLING connection string>"
#   bash scripts/db-clone-from-prod.sh
#
# Get the NON-POOLING url from Neon (avoid the -pooler host — pg_dump wants a
# direct connection). Make sure it ends with ?sslmode=require
#
set -euo pipefail

LOCAL_DB="zcrypt"

: "${PROD_DATABASE_URL:?Set PROD_DATABASE_URL first (the prod NON-POOLING url). Aborting so nothing runs blind.}"

command -v pg_dump >/dev/null 2>&1 || {
  echo "ERROR: pg_dump not found. Open Postgres.app, add its bin dir to PATH, then open a new terminal."
  exit 1
}

echo "==> 1/2  Recreating local db '$LOCAL_DB'…"
dropdb --if-exists "$LOCAL_DB"
createdb "$LOCAL_DB"

echo "==> 2/2  Copying PROD -> LOCAL (read-only on prod)…"
pg_dump --no-owner --no-privileges "$PROD_DATABASE_URL" | psql --quiet --set ON_ERROR_STOP=1 "$LOCAL_DB"

echo ""
echo "==> Done. Local db '$LOCAL_DB' now mirrors prod data."
echo "    Put this in app/backend/.env:"
echo "    DATABASE_URL=\"postgresql://localhost:5432/$LOCAL_DB?sslmode=disable\""
