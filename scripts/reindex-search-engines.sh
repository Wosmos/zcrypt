#!/usr/bin/env bash
# Nudge search engines to recrawl zcrypt.cloud after a deploy.
#
# Google has no public "reindex this page now" API for ordinary sites (the
# Indexing API is restricted to JobPosting/BroadcastEvent structured data —
# using it for regular pages risks the account getting throttled), so the
# sanctioned move is a sitemap ping. IndexNow (Bing, Yandex, Seznam) does
# support real instant reindex requests for any URL, so we push the full
# sitemap there too. Either way we leave a job-summary reminder so a human
# can hit "Request Indexing" in Search Console for anything that matters.
set -euo pipefail

SITE="https://zcrypt.cloud"
SITE_HOST="${SITE#https://}"
SITEMAP_URL="$SITE/sitemap.xml"
INDEXNOW_KEY="21e77bf9a5bb60bbac0bf2b10a664299"

echo "== Pinging Google with the sitemap =="
google_status=$(curl -s -o /dev/null -w "%{http_code}" "https://www.google.com/ping?sitemap=${SITEMAP_URL}")
echo "google ping: HTTP ${google_status}"

echo "== Fetching sitemap URLs =="
urls_json=$(curl -s "$SITEMAP_URL" | grep -oE '<loc>[^<]+</loc>' | sed -E 's#</?loc>##g' | jq -R . | jq -s .)
url_count=$(echo "$urls_json" | jq 'length')
echo "found ${url_count} URLs in sitemap"

echo "== Submitting to IndexNow (Bing, Yandex, Seznam) =="
indexnow_status=$(curl -s -o /tmp/indexnow-response.txt -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg host "$SITE_HOST" --arg key "$INDEXNOW_KEY" --arg keyLocation "$SITE/$INDEXNOW_KEY.txt" --argjson urlList "$urls_json" \
    '{host: $host, key: $key, keyLocation: $keyLocation, urlList: $urlList}')")
echo "indexnow submit: HTTP ${indexnow_status}"
cat /tmp/indexnow-response.txt 2>/dev/null || true

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
{
  echo "### Search engine reindex nudge"
  echo ""
  echo "- Google sitemap ping: HTTP ${google_status}"
  echo "- IndexNow (Bing/Yandex/Seznam): HTTP ${indexnow_status}, ${url_count} URLs submitted"
  echo ""
  echo "**Google has no public instant-reindex API for regular pages.** If this"
  echo "deploy changed anything important, manually hit **Request Indexing** in"
  echo "[Search Console](https://search.google.com/search-console) for those URLs."
} >>"$summary"

if [[ -n "${NTFY_TOPIC:-}" ]]; then
  curl -s -X POST "https://ntfy.sh/${NTFY_TOPIC}" \
    -H "Title: zcrypt reindex nudge" \
    -d "Sitemap pinged (Google ${google_status}, IndexNow ${indexnow_status}). Consider manual Search Console reindex for changed pages." \
    >/dev/null || true
fi
