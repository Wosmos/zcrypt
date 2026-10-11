#!/usr/bin/env bash
# One-shot, re-runnable setup for the zcrypt backend on Ubuntu (arm64 or x86_64).
#
#   1. Put the server env at deploy/server/.env (make it on your laptop with
#      deploy/server/make-env.sh, then scp it over).
#   2. bash deploy/server/setup.sh
#
# Installs Docker if missing, builds the backend image from this checkout and
# starts it with the Cloudflare Tunnel. Run it again after `git pull` to deploy.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

[ -f .env ] || { echo "missing $here/.env (create it with make-env.sh on your laptop and scp it here)"; exit 1; }
for v in DATABASE_URL MASTER_KEY ZCRYPT_JWT_SECRET FRONTEND_URL TUNNEL_TOKEN; do
  grep -qE "^${v}=." .env || { echo "$v is not set in .env"; exit 1; }
done
chmod 600 .env

if ! command -v docker >/dev/null 2>&1; then
  echo "== Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

dc() { if docker info >/dev/null 2>&1; then docker compose "$@"; else sudo docker compose "$@"; fi; }

echo "== Building and starting"
dc up -d --build

echo "== Waiting for the backend"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "backend is healthy"
    dc ps
    exit 0
  fi
  sleep 2
done
echo "backend did not become healthy; recent logs:"
dc logs --tail 60 backend
exit 1
