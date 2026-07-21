# Full Inspection Report — The "Unnecessary Shimmer" on zcrypt Files

I reproduced the shimmer live this time by clearing the decrypted thumbnail cache while tracking Network, Console, and DevTools. Here's the complete picture.

## What I did
I logged in via Google (test account), unlocked the vault with the test passphrase, then — exactly as you suggested — cleared the cached files (IndexedDB `zcrypt_thumbs`, which held 3 decrypted thumbnails) and reloaded. **The shimmer appeared immediately and reproducibly.** Screenshots and a GIF were captured (the GIF only got 2 frames because the Google OAuth redirect wipes the recorder's frame buffer on cross-domain navigation — the screenshots are the reliable visual record).

## Root cause — confirmed, not guessed this time
The shimmer is a **thumbnail decryption/loading state**, and here's the exact mechanism I observed in the network trace right after clearing the cache and reloading:

The vault stores decrypted image thumbnails in IndexedDB store `zcrypt_thumbs` as `data:image/webp;base64` URIs keyed by file ID. When those cached thumbnails exist, the grid paints instantly. When they're **absent** (first upload of a new file, or cache cleared), each image tile has no thumbnail to show, so it renders the empty/shimmer placeholder while the app does the following per image, client-side:

1. `GET /api/files/{id}/chunks/0` — fetches the *encrypted* thumbnail bytes
2. Decrypts them in-browser (zero-knowledge)
3. Wraps the result in a `blob:` URL and paints it into the tile

In the post-clear trace, I saw exactly three fresh `blob:https://www.zcrypt.cloud/…` requests appear — one for each of the three image files whose cached data-URIs I deleted. The ZIP and MPEG tiles (which use static icons, not decrypted previews) rendered instantly with no shimmer. Only the image tiles shimmered. That's the tell: **the shimmer is bound to thumbnails that must be fetched-and-decrypted, and it only shows when the decrypted result isn't already in `zcrypt_thumbs`.**

## Why it "goes away after hard reload" (the part that seemed to make no sense)
Once the fetch-and-decrypt completes, the decrypted data-URI is written back into `zcrypt_thumbs`. So after that first resolve, the thumbnail is cached. A subsequent hard reload finds the thumbnail already in cache and paints it in a single pass — no fetch, no decrypt, no shimmer. Your hard reload wasn't fixing anything; it was just running *after* the cache had already been populated, so there was nothing left to shimmer for.

This also explains your two reproduction methods perfectly: **uploading a new file** creates a file whose thumbnail has never been decrypted-and-cached, so it shimmers until its first decrypt; **clearing cached files** removes already-decrypted thumbnails, forcing them to shimmer again on next render.

## What I monitored
- **Network:** `GET /api/files`, `/api/folders`, `/api/quota`, `/api/keys/me`-type calls on load, plus the per-image `chunks/0` fetches and the resulting `blob:` URLs that are the decrypted thumbnails. This is the concrete evidence of the fetch→decrypt→blob pipeline.
- **Console:** clean during vault load. (The only warning I'd seen earlier — a recharts `width(-1)/height(-1)` message — is on the Insights/analytics view and is unrelated to the file shimmer.)
- **DevTools/storage:** `zcrypt_thumbs` (decrypted thumbnails as data-URIs, 3 entries for 3 images) and `zcrypt-device-vault` (device key + passphrase, since "Keep me unlocked on this device" is on).

## The fix
The shimmer is legitimate the *first* time a thumbnail is decrypted — there's genuinely nothing to show yet. The problem is only that it looks like "unnecessary" churn. Practical improvements:

Render thumbnails cache-first and only decrypt-on-demand for what's actually missing, so tiles that already have a cached data-URI never drop into a skeleton state on re-render. For genuinely new/uncached thumbnails, keep the current fetch-decrypt flow but consider decrypting eagerly in the background right after `GET /api/files` returns (or persisting the blob to `zcrypt_thumbs` immediately) so the placeholder window is as short as possible. Optionally, warm the cache on upload by decrypting and storing the thumbnail at upload time — that would eliminate the "upload a new file → shimmer" case entirely.

Net: the shimmer is your app correctly waiting for client-side thumbnail decryption on a cache miss — expected on new uploads or after clearing the cache, and invisible after a reload only because the cache is warm by then.

I've downloaded `zcrypt-shimmer-investigation.gif` (975×748) and captured screenshots of both the shimmer state (empty image tiles) and the resolved state for reference. Want me to also test the **upload** reproduction path (I'd need a file and your confirmation before uploading), or dig into the Insights recharts warning separately?