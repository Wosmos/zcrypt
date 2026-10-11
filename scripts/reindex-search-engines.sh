#!/usr/bin/env bash
# Ask search engines to recrawl zcrypt.cloud after a deploy.
#
# Google has no public "reindex this page now" API for ordinary sites (its
# Indexing API is restricted to JobPosting/BroadcastEvent pages, and the old
# sitemap ping endpoint was shut down in 2023), so Google is fed through the
# sitemap submitted in Search Console. IndexNow does support instant reindex
# requests, so the full sitemap goes to each IndexNow engine separately: they
# verify the key on their own and refuse independently, and one shared
# endpoint hides which of them said no.
#
# Exits non-zero when no engine accepted the submission, so the workflow goes
# red instead of reporting success for requests that all failed.
set -euo pipefail

SITE="https://zcrypt.cloud"
SITE_HOST="${SITE#https://}"
SITEMAP_URL="$SITE/sitemap.xml"
INDEXNOW_KEY="21e77bf9a5bb60bbac0bf2b10a664299"
KEY_LOCATION="$SITE/$INDEXNOW_KEY.txt"

ENGINES=(
  "Bing|https://www.bing.com/indexnow"
  "Yandex|https://yandex.com/indexnow"
  "Seznam|https://search.seznam.cz/indexnow"
  "Naver|https://searchadvisor.naver.com/indexnow"
)

echo "== Checking the IndexNow key file =="
served_key="$(curl -fsS --max-time 20 "$KEY_LOCATION" || true)"
if [[ "$served_key" != "$INDEXNOW_KEY" ]]; then
  echo "::error::$KEY_LOCATION does not serve the IndexNow key; every engine will refuse the submission"
  exit 1
fi
echo "key file OK"

echo "== Fetching sitemap URLs =="
urls_json=$(curl -fsS --max-time 30 "$SITEMAP_URL" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g' | jq -R . | jq -s .)
url_count="$(echo "$urls_json" | jq 'length')"
echo "found ${url_count} URLs in sitemap"
[[ "$url_count" -gt 0 ]] || { echo "::error::sitemap has no URLs"; exit 1; }

payload="$(jq -n --arg host "$SITE_HOST" --arg key "$INDEXNOW_KEY" --arg keyLocation "$KEY_LOCATION" --argjson urlList "$urls_json" \
  '{host: $host, key: $key, keyLocation: $keyLocation, urlList: $urlList}')"

accepted=0
lines=()
for entry in "${ENGINES[@]}"; do
  name="${entry%%|*}"
  endpoint="${entry#*|}"
  body_file="$(mktemp)"
  status="$(curl -sS --max-time 30 -o "$body_file" -w '%{http_code}' -X POST "$endpoint" \
    -H 'Content-Type: application/json; charset=utf-8' -d "$payload" 2>/dev/null || true)"
  status="${status:0:3}"
  [[ -n "$status" ]] || status="000"
  reason="$(head -c 300 "$body_file" | tr -d '\n')"
  rm -f "$body_file"
  case "$status" in
    200 | 202)
      accepted=$((accepted + 1))
      lines+=("- $name: accepted (HTTP $status)")
      echo "$name: accepted (HTTP $status)"
      ;;
    *)
      lines+=("- $name: refused (HTTP $status) ${reason}")
      echo "::warning::$name refused the submission (HTTP $status): ${reason:-no response body}"
      ;;
  esac
done

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
{
  echo "### Search engine reindex"
  echo ""
  echo "${url_count} URLs from the sitemap, accepted by ${accepted} of ${#ENGINES[@]} IndexNow engines."
  echo ""
  printf '%s\n' "${lines[@]}"
  echo ""
  echo "A 403 \`UserForbiddedToAccessSite\` means that engine hasn't verified the site for this key:"
  echo "verify zcrypt.cloud in [Bing Webmaster Tools](https://www.bing.com/webmasters) (import it from Search Console)."
  echo "Google has no instant-reindex API; it reads the sitemap submitted in [Search Console](https://search.google.com/search-console)."
} >>"$summary"

if [[ -n "${NTFY_TOPIC:-}" ]]; then
  curl -s -X POST "https://ntfy.sh/${NTFY_TOPIC}" \
    -H "Title: zcrypt reindex" \
    -d "IndexNow: ${accepted}/${#ENGINES[@]} engines accepted ${url_count} URLs." \
    >/dev/null || true
fi

if [[ "$accepted" -eq 0 ]]; then
  echo "::error::no search engine accepted the submission"
  exit 1
fi
