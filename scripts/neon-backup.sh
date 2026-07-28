#!/usr/bin/env bash
#
# Nightly offsite backup — closes V-9 in docs/DB_SCALING_100_PROJECTS.md:
# "nightly encrypted offsite dump means Neon holds zero exclusive copies."
#
# Independent of quota level and independent of neon-rotate.sh — this runs
# every night regardless, so a lockout (or a botched rotation) never strands
# the ONLY copy of production data inside Neon.
#
# Dumps the CURRENTLY ACTIVE project (docs/neon-manifest.json, falling back to
# the NEON_PROJECT_ID secret before the first rotation has ever run), encrypts
# with `age` to a public key (the matching PRIVATE key lives OFFLINE with a
# human — CI can encrypt but must never be able to decrypt), and uploads the
# ciphertext as an asset on a private GitHub Release. Prunes releases older
# than RETENTION_DAYS.
#
# Required env:
#   NEON_API_KEY              Neon API key (Neon console → Account → API keys)
#   NEON_BACKUP_AGE_RECIPIENT age public key, e.g. "age1qyq..." (generate with
#                             `age-keygen`; keep the PRIVATE key offline — it is
#                             NEVER stored in this repo or in CI)
#   GH_TOKEN                  token with `contents: write` on this repo (the
#                             workflow's default GITHUB_TOKEN covers this)
# Optional env:
#   NEON_PROJECT_ID    fallback active-project id, used only if
#                      docs/neon-manifest.json has no active_project_id yet
#   RETENTION_DAYS     how long to keep nightly backups, default 30
#
set -euo pipefail

: "${NEON_API_KEY:?Set NEON_API_KEY.}"
: "${NEON_BACKUP_AGE_RECIPIENT:?Set NEON_BACKUP_AGE_RECIPIENT (an age public key — see age-keygen). The matching private key must NOT live in CI.}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MANIFEST="docs/neon-manifest.json"

for bin in neonctl pg_dump age gh jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found on PATH."; exit 1; }
done
export NEON_API_KEY

active_id="$(jq -r '.active_project_id // empty' "$MANIFEST" 2>/dev/null || true)"
if [[ -z "$active_id" ]]; then
  : "${NEON_PROJECT_ID:?No active_project_id in ${MANIFEST} yet (bootstrap) — set NEON_PROJECT_ID.}"
  active_id="$NEON_PROJECT_ID"
  echo "==> Bootstrap: no manifest entry yet, using NEON_PROJECT_ID (${active_id})."
else
  echo "==> Active project (from manifest): ${active_id}"
fi

echo "==> 1/4  Resolving direct connection string…"
direct_url="$(neonctl connection-string --project-id "$active_id" --output json 2>/dev/null | jq -r '.uri' 2>/dev/null || true)"
[[ -n "$direct_url" && "$direct_url" != "null" ]] || direct_url="$(neonctl connection-string --project-id "$active_id")"
[[ -n "$direct_url" ]] || { echo "ERROR: could not resolve connection string for ${active_id}."; exit 1; }

stamp="$(date -u +%Y%m%d-%H%M%SZ)"
dump="$(mktemp -t "neon-backup-${stamp}-XXXX.dump")"
enc="${dump}.age"
trap 'rm -f "$dump" "$enc"' EXIT

echo "==> 2/4  Dumping (custom format, read-only on the active project)…"
pg_dump --no-owner --no-privileges -Fc "$direct_url" >"$dump"
dump_bytes="$(wc -c <"$dump" | tr -d ' ')"
echo "    dump size: ${dump_bytes} bytes"

echo "==> 3/4  Encrypting to the offline recipient key…"
age -r "$NEON_BACKUP_AGE_RECIPIENT" -o "$enc" "$dump"

echo "==> 4/4  Uploading as a GitHub Release asset…"
tag="neon-backup-${stamp}"
gh release create "$tag" "$enc" \
  --repo "${GH_REPO:-Wosmos/zcrypt}" \
  --title "Neon nightly backup ${stamp}" \
  --notes "Encrypted pg_dump of project ${active_id}. Decrypt with: age -d -i <your-private-key.txt> ${tag##neon-backup-}.dump.age > restore.dump" \
  >/dev/null

echo "    released: ${tag}"

echo "==> Pruning backups older than ${RETENTION_DAYS} days…"
cutoff_epoch=$(( $(date -u +%s) - RETENTION_DAYS * 86400 ))
gh release list --repo "${GH_REPO:-Wosmos/zcrypt}" --limit 200 --json tagName,createdAt \
  | jq -r --argjson cutoff "$cutoff_epoch" '
      .[] | select(.tagName | startswith("neon-backup-"))
      | select((.createdAt | fromdateiso8601) < $cutoff)
      | .tagName' \
  | while read -r old_tag; do
      echo "    deleting ${old_tag}"
      gh release delete "$old_tag" --repo "${GH_REPO:-Wosmos/zcrypt}" --yes --cleanup-tag || true
    done

echo "==> Done. Backup: ${tag} (${dump_bytes} bytes, encrypted)."
