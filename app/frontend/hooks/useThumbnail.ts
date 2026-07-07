"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getFileMeta, getFileChunk } from "@/lib/api";
import { resolveFileKey, decryptChunk, fromBase64 } from "@/lib/crypto";
import { isForegroundDecryptActive, onDecryptCacheClear } from "@/lib/decrypt-cache";
import { isImageFile, isVideoFile, mimeForFile } from "@/lib/utils";

// A thumbnail decrypts the WHOLE file for one 300px preview, so cap how much a
// background grid preview is allowed to pull. Files above this just show their
// type icon.
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const DB_NAME = "zcrypt_thumbs";
const STORE_NAME = "thumbnails";
const DB_VERSION = 1;
const MAX_CONCURRENT = 3;

// ── In-memory mirror of IndexedDB ────────────────────────────────────
const memCache = new Map<string, string>();
// Files whose thumbnail generation failed, with a bounded RETRY schedule rather
// than a permanent blacklist. This matters most right after an upload: the
// file's chunks may still be syncing to the storage platform when the thumbnail
// first tries to fetch them, so the first attempt fails — a permanent blacklist
// then left the file iconless until a full page reload. With retry, the shimmer
// simply resolves into the real thumbnail once the chunk lands (a few seconds),
// no reload needed; a genuinely un-thumbnailable file gives up after MAX_ATTEMPTS.
const MAX_THUMB_ATTEMPTS = 3;
const failed = new Map<string, { attempts: number; nextRetryAt: number }>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
let version = 0; // bumped on every change so per-file hooks re-render
// Bumped on every vault lock / logout. An in-flight decrypt captures the current
// value; if it changes before the thumbnail lands, the result is DROPPED instead
// of repopulating memCache/IndexedDB after a lock (the post-lock repopulation gap).
let generation = 0;
// False until the IndexedDB cache has finished loading into memCache. Cards must
// NOT shimmer or start (re)generating before this — otherwise on every reload a
// card sees an empty memCache, re-decrypts a thumbnail that's actually cached on
// disk, and shimmers through it. Gating on this makes cached thumbnails appear
// instantly across reloads/logouts (the cache itself already survives both).
let hydrated = false;
let listeners: (() => void)[] = [];
function notify() { version++; for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; }
function getSnapshot() { return memCache; }
function getVersion() { return version; }

/** Given up after MAX_THUMB_ATTEMPTS — show the type icon, stop retrying. */
function isPermanentlyFailed(id: string): boolean {
  const f = failed.get(id);
  return !!f && f.attempts >= MAX_THUMB_ATTEMPTS;
}
/** May a (re)generation run now — never tried, or a prior failure's backoff has
 *  elapsed and attempts remain. */
function canGenerateNow(id: string): boolean {
  const f = failed.get(id);
  if (!f) return true;
  if (f.attempts >= MAX_THUMB_ATTEMPTS) return false;
  return Date.now() >= f.nextRetryAt;
}
/** Record a failed attempt. `permanent` (render/decode/locked) gives up
 *  immediately → type icon. A transient failure (fetch/decrypt/timeout) gets a
 *  bounded backoff and schedules a wake-up so mounted cards retry once it
 *  elapses (effects only re-fire on state change, so without this notify the
 *  retry would wait for an unrelated re-render). Gives up after MAX attempts. */
function markThumbFailed(id: string, permanent: boolean): void {
  if (permanent) {
    failed.set(id, { attempts: MAX_THUMB_ATTEMPTS, nextRetryAt: 0 });
    return;
  }
  const attempts = (failed.get(id)?.attempts ?? 0) + 1;
  const backoff = Math.min(30_000, 3_000 * 2 ** (attempts - 1)); // 3s, 6s, 12s (cap 30s)
  failed.set(id, { attempts, nextRetryAt: Date.now() + backoff });
  const existing = retryTimers.get(id);
  if (existing) clearTimeout(existing);
  if (attempts < MAX_THUMB_ATTEMPTS) {
    retryTimers.set(id, setTimeout(() => { retryTimers.delete(id); notify(); }, backoff + 50));
  }
}

// Lazy generation context: set once on unlock via primeThumbnails(). Each
// file's hook then generates its own thumbnail the first time it renders,
// rather than decrypting the whole vault up front.
let ctxPassphrase: string | null = null;
let ctxResolver: ThumbnailPasswordResolver | undefined;

// ── IndexedDB helpers ────────────────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbPut(key: string, value: string) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(value, key);
}

/** Wipe every persisted thumbnail from disk. Called on lock/logout so no
 *  decrypted preview survives at rest (readable straight from IndexedDB). */
async function dbClear() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
  } catch {
    /* IndexedDB unavailable — memory eviction below is the real guarantee */
  }
}

// ── Boot: hydrate memCache from IndexedDB ────────────────────────────
// Only ever invoked once, below — no re-entrancy guard needed.
function markHydrated() {
  if (hydrated) return;
  hydrated = true;
  notify();
}

async function hydrate() {
  // Safety net: never block thumbnails forever if IndexedDB open/cursor hangs.
  setTimeout(markHydrated, 3000);
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        memCache.set(cursor.key as string, cursor.value as string);
        cursor.continue();
      } else {
        markHydrated(); // cache fully loaded — a memCache miss is now trustworthy
      }
    };
    req.onerror = () => markHydrated();
  } catch {
    // IndexedDB unavailable - fallback to memory-only
    markHydrated();
  }
}
if (typeof window !== "undefined") hydrate();

// ── Canvas thumbnail generation ──────────────────────────────────────
async function generateThumbnail(blob: Blob, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // SVGs (and some formats) can report 0 intrinsic size — fall back so we
      // still rasterize something rather than dividing by zero.
      const iw = img.naturalWidth || img.width || 300;
      const ih = img.naturalHeight || img.height || 300;
      const scale = Math.min(maxW / iw, maxH / ih, 1);
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/webp", 0.55));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

// ── Video thumbnail: grab a frame a little way in ────────────────────
async function generateVideoThumbnail(blob: Blob, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const url = URL.createObjectURL(blob);
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      try { video.load(); } catch { /* ignore */ }
    };
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };
    const capture = () => {
      if (settled) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { fail("no video dimensions"); return; }
      const scale = Math.min(maxW / vw, maxH / vh, 1);
      const w = Math.max(1, Math.round(vw * scale));
      const h = Math.max(1, Math.round(vh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { fail("no canvas context"); return; }
      try {
        ctx.drawImage(video, 0, 0, w, h);
      } catch {
        fail("drawImage failed");
        return;
      }
      settled = true;
      const dataUrl = canvas.toDataURL("image/webp", 0.6);
      cleanup();
      resolve(dataUrl);
    };

    // Once data is available, seek ~10% in (capped at 1s) to skip black frames.
    video.onloadeddata = () => {
      const dur = isFinite(video.duration) ? video.duration : 2;
      const t = Math.min(1, Math.max(0, dur * 0.1));
      try { video.currentTime = t; } catch { capture(); }
    };
    video.onseeked = capture;
    video.onerror = () => fail("video decode error");
    // Safety net: never hang a slot on a codec the browser can't decode.
    setTimeout(() => fail("video thumbnail timeout"), 15000);

    video.src = url;
  });
}

/** Reject a promise if it doesn't settle within `ms`, so one stuck thumbnail
 *  can't hold its concurrency slot forever and freeze every other card in a
 *  perpetual loading state. The underlying work is abandoned (its result is
 *  ignored); the file is then marked failed and the slot released. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label + " timed out")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ── Batch loader: fetches all image thumbs when passphrase is available ──
const inflight = new Set<string>();
let activeCount = 0;
const queue: (() => void)[] = [];

function releaseSlot() {
  activeCount--;
  const next = queue.shift();
  if (next) next();
}

/** Resolve once no foreground decrypt (file open / preview / neighbour
 *  prefetch) is in flight. Thumbnails are background polish — while the user is
 *  waiting on a real file, queued thumbnail starts hold back instead of
 *  competing for network + CPU. Simple 500ms poll; thumbnails already running
 *  just finish (they're bounded by their own timeouts). */
async function waitForForegroundIdle(): Promise<void> {
  // Yield to foreground decrypts — but never indefinitely. If foreground work
  // stays "active" past this cap (a decrypt hung on some path we don't guard),
  // proceed anyway rather than starve every thumbnail into a perpetual spinner.
  // getFileChunk now carries its own timeout, so this is belt-and-suspenders.
  const MAX_WAIT_MS = 60_000;
  const start = Date.now();
  while (isForegroundDecryptActive()) {
    if (Date.now() - start >= MAX_WAIT_MS) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function acquireSlot(): Promise<void> {
  await waitForForegroundIdle();
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(() => { activeCount++; resolve(); }));
  // A foreground decrypt may have started while this item sat in the queue —
  // re-check before letting it run. It holds its slot while waiting, which
  // conveniently pauses the rest of the queue too.
  await waitForForegroundIdle();
}

/**
 * Optional per-file password resolver for thumbnails. For a file in a protected
 * folder it returns the cached folder password; if that folder is locked it
 * returns `null` so the thumbnail is silently skipped (thumbnails must never
 * prompt — we don't nag for a locked folder just to draw a grid preview). For
 * unprotected files it returns the vault passphrase. When NOT supplied, the
 * plain `passphrase` is used (legacy/unprotected behavior, byte-for-byte).
 */
export type ThumbnailPasswordResolver = (fileId: string) => string | null;

async function decryptFileToBlob(
  fileId: string,
  passphrase: string,
  resolvePassword?: ThumbnailPasswordResolver,
  mime = "application/octet-stream"
): Promise<Blob> {
  const filePassphrase = resolvePassword ? resolvePassword(fileId) : passphrase;
  if (filePassphrase == null) {
    // Protected folder is locked — skip (don't prompt for a thumbnail).
    throw new Error("locked");
  }
  const meta = await getFileMeta(fileId);
  const salt = fromBase64(meta.salt);
  // resolveFileKey memoizes its PBKDF2 derivation (lib/crypto's derived-key
  // cache), so a thumbnail no longer pays 600k iterations that the preview /
  // download of the same file will just re-pay.
  const keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);

  // Use the single app-wide zstd codec — NEVER call ZstdInit() here. The
  // thumbnail loader runs several decrypts concurrently; a per-call ZstdInit()
  // re-initialises the shared wasm mid-use and corrupts other in-flight
  // decompression (the file viewer's), throwing "ZSTD_ERROR: Src size is
  // incorrect, -72". See lib/zstd.ts.
  const { getZstdCodec } = await import("@/lib/zstd");
  let zstd: Awaited<ReturnType<typeof getZstdCodec>> | null = null;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < meta.chunk_count; i++) {
    const { data, compressed } = await getFileChunk(fileId, i);
    let plain = await decryptChunk(keyBytes, new Uint8Array(data));
    if (compressed) {
      if (!zstd) zstd = await getZstdCodec();
      plain = zstd.ZstdStream.decompress(plain);
    }
    chunks.push(plain);
  }

  return new Blob(chunks as BlobPart[], { type: mime });
}

async function fetchAndCacheThumbnail(
  fileId: string,
  filename: string,
  passphrase: string,
  resolvePassword?: ThumbnailPasswordResolver
): Promise<string | null> {
  // Sole caller (the hook's effect) already checks memCache/inflight/failedSet
  // synchronously right before calling — no gap for that state to change.
  inflight.add(fileId);
  notify(); // surface the loading state to mounted cards right away

  // Snapshot the lock generation: if the vault locks (or logs out) while this
  // decrypt is in flight, the result is discarded rather than written back to
  // the cache — otherwise a lock could leave a fresh plaintext preview behind.
  const gen = generation;

  // acquireSlot() lives INSIDE the try so the finally always runs and clears
  // `inflight` — otherwise a slow/blocked acquire would leave the card's
  // `loading` flag stuck true forever (the perpetual-shimmer bug). releaseSlot
  // is paired only when a slot was actually taken.
  let slotHeld = false;
  try {
    await acquireSlot();
    slotHeld = true;
    const video = isVideoFile(filename);

    // STAGE 1 — fetch + decrypt. Failures here (a chunk still syncing to the
    // platform right after upload, a network blip, a slow-link timeout) are
    // TRANSIENT: mark with a bounded backoff so the shimmer resolves into the
    // real thumbnail on a retry a few seconds later — no page reload needed. A
    // locked protected folder is the one permanent case (don't re-poll it).
    let blob: Blob;
    try {
      blob = await withTimeout(
        decryptFileToBlob(fileId, passphrase, resolvePassword, mimeForFile(filename)),
        30_000,
        "thumbnail decrypt"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      markThumbFailed(fileId, /* permanent */ msg === "locked");
      return null;
    }

    // STAGE 2 — rasterize. Failures here (unsupported codec, undecodable image,
    // no canvas context) are PERMANENT: the bytes are fine but this file can't
    // become a thumbnail, so fall straight back to the type icon rather than
    // burning retries re-decrypting a file that will never render.
    let dataUrl: string;
    try {
      dataUrl = video
        ? await generateVideoThumbnail(blob, 400, 400)
        : await withTimeout(generateThumbnail(blob, 300, 300), 15_000, "thumbnail render");
    } catch {
      markThumbFailed(fileId, /* permanent */ true);
      return null;
    }
    // Vault re-locked / logged out mid-decrypt → drop the plaintext, don't cache.
    if (gen !== generation) return null;
    memCache.set(fileId, dataUrl);
    // Persist to IndexedDB in background
    dbPut(fileId, dataUrl).catch(() => {});
    return dataUrl;
  } catch {
    // acquireSlot (or something unexpected) threw — treat as transient so a
    // retry can still succeed once the queue frees up.
    markThumbFailed(fileId, /* permanent */ false);
    return null;
  } finally {
    inflight.delete(fileId);
    if (slotHeld) releaseSlot();
    notify(); // always: clears `loading`, and reflects the cached/failed result
  }
}

/** Arm lazy thumbnail generation. Call once after the passphrase is entered
 *  (on unlock). Nothing is decrypted here — each file's `useThumbnail` hook
 *  generates its own thumbnail the first time its card renders, so we never
 *  block on decrypting the whole vault. `resolvePassword` routes
 *  protected-folder files to their folder password (locked ones are skipped). */
export function primeThumbnails(
  passphrase: string,
  resolvePassword?: ThumbnailPasswordResolver
) {
  ctxPassphrase = passphrase;
  ctxResolver = resolvePassword;
  notify(); // wake already-mounted hooks so they start generating
}

/**
 * Evict every decrypted thumbnail on a vault LOCK / logout, so the "locked" state
 * is genuine — not merely a CSS overlay hiding plaintext previews that a devtools
 * / IndexedDB peek could still read.
 *
 * Drops: the armed passphrase (`ctxPassphrase`) so no NEW thumbnails generate
 * while locked; the in-memory mirror + failure/retry bookkeeping; and the
 * on-disk `zcrypt_thumbs` store. Bumps `generation` so any decrypt already in
 * flight is discarded instead of repopulating the cache after the lock.
 *
 * `useVaultActions` re-arms via `primeThumbnails()` on the next unlock, so
 * previews come back the moment the vault is unlocked again.
 */
export function clearThumbnails() {
  ctxPassphrase = null;
  ctxResolver = undefined;
  generation++; // invalidate any in-flight decrypt so it can't repopulate
  memCache.clear();
  inflight.clear();
  failed.clear();
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  void dbClear();
  notify();
}

// A vault lock / TTL expiry / logout goes through clearDecryptCache(); piggyback
// on that single eviction event so thumbnails are dropped in lockstep with the
// blob cache — no store→hook import (which would cycle through lib/api).
onDecryptCacheClear(clearThumbnails);

/** Check if a file has a cached thumbnail (no passphrase needed). */
export function hasCachedThumbnail(fileId: string): boolean {
  return memCache.has(fileId);
}

/** Get cached thumbnail count for stats. */
export function getCachedThumbnailCount(): number {
  return memCache.size;
}

// ── React hook ───────────────────────────────────────────────────────
export function useThumbnail(
  fileId: string,
  filename: string,
  size?: number
): {
  thumbnailUrl: string | null;
  loading: boolean;
  /** True while a thumbnail is expected but not ready yet — show a loader. */
  pending: boolean;
} {
  // Re-render on any thumbnail state change (cache / inflight / failed / prime).
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const thumbnailUrl = memCache.get(fileId) ?? null;
  const loading = inflight.has(fileId);
  const thumbable = isImageFile(filename) || isVideoFile(filename);
  const withinSize = size === undefined || size < MAX_FILE_SIZE;
  const ctxReady = ctxPassphrase !== null;

  // Whether a (re)generation should run right now. Recomputed every render —
  // including the notify() the retry timer fires — so `canGenerateNow` flips
  // false→true when a failed attempt's backoff elapses and the effect re-runs.
  const shouldGenerate =
    hydrated && ctxReady && thumbable && withinSize && !thumbnailUrl && canGenerateNow(fileId);

  // Lazy: generate this file's thumbnail the first time it renders after unlock,
  // and again after a transient failure's backoff. fetchAndCacheThumbnail queues
  // itself behind the shared concurrency limit and guards against double-starts.
  useEffect(() => {
    if (!shouldGenerate) return;
    if (memCache.has(fileId) || inflight.has(fileId)) return;
    fetchAndCacheThumbnail(fileId, filename, ctxPassphrase as string, ctxResolver).catch(() => {});
  }, [shouldGenerate, fileId, filename]);

  // Still expecting a thumbnail (show the shimmer) until it lands or we give up
  // for good. A file in backoff between retries keeps shimmering — it's about to
  // try again — rather than flickering to an icon and back.
  // Don't shimmer until the disk cache has hydrated — otherwise every reload
  // flashes a shimmer over thumbnails that are actually cached and about to
  // appear instantly. After hydration, a genuine miss still shimmers while it
  // generates.
  const pending =
    hydrated && thumbable && withinSize && ctxReady && !thumbnailUrl && !isPermanentlyFailed(fileId);

  return { thumbnailUrl, loading, pending };
}

/** Hook to get all cached thumbnails (for listing). */
export function useThumbnailCache(): Map<string, string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
