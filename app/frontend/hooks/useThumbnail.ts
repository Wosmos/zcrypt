"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getFileMeta, getFileChunk } from "@/lib/api";
import { resolveFileKey, decryptChunk, fromBase64 } from "@/lib/crypto";
import { isImageFile, isVideoFile, mimeForFile } from "@/lib/utils";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DB_NAME = "zcrypt_thumbs";
const STORE_NAME = "thumbnails";
const DB_VERSION = 1;
const MAX_CONCURRENT = 3;

// ── In-memory mirror of IndexedDB ────────────────────────────────────
const memCache = new Map<string, string>();
const failedSet = new Set<string>(); // files we tried and couldn't thumbnail
let version = 0; // bumped on every change so per-file hooks re-render
let listeners: (() => void)[] = [];
function notify() { version++; for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; }
function getSnapshot() { return memCache; }
function getVersion() { return version; }

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

async function dbGet(key: string): Promise<string | undefined> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function dbPut(key: string, value: string) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(value, key);
}

async function dbGetAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => resolve([]);
  });
}

// ── Boot: hydrate memCache from IndexedDB ────────────────────────────
let hydrated = false;
async function hydrate() {
  if (hydrated) return;
  hydrated = true;
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
        notify();
      }
    };
  } catch {
    // IndexedDB unavailable - fallback to memory-only
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

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(() => { activeCount++; resolve(); }));
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
  if (memCache.has(fileId) || inflight.has(fileId)) return memCache.get(fileId) ?? null;
  inflight.add(fileId);

  await acquireSlot();
  try {
    const video = isVideoFile(filename);
    // Bound both stages: a stalled chunk fetch (getFileChunk has no timeout of
    // its own) or an image the browser never fires load/error for (Safari is
    // stricter about odd formats) would otherwise hold this slot forever and
    // leave every queued card spinning.
    const blob = await withTimeout(
      decryptFileToBlob(fileId, passphrase, resolvePassword, mimeForFile(filename)),
      30_000,
      "thumbnail decrypt"
    );
    const dataUrl = video
      ? await generateVideoThumbnail(blob, 400, 400)
      : await withTimeout(generateThumbnail(blob, 300, 300), 15_000, "thumbnail render");
    memCache.set(fileId, dataUrl);
    notify();
    // Persist to IndexedDB in background
    dbPut(fileId, dataUrl).catch(() => {});
    return dataUrl;
  } catch {
    // Remember the failure so the lazy hook doesn't retry forever (locked
    // folder, unsupported codec, decode error, oversized, …).
    failedSet.add(fileId);
    notify();
    return null;
  } finally {
    inflight.delete(fileId);
    releaseSlot();
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

  // Lazy: generate this file's thumbnail the first time it renders after unlock.
  // The guards keep repeat renders cheap; fetchAndCacheThumbnail queues itself
  // behind the shared concurrency limit.
  useEffect(() => {
    if (!ctxReady || !thumbable || !withinSize) return;
    if (memCache.has(fileId) || inflight.has(fileId) || failedSet.has(fileId)) return;
    fetchAndCacheThumbnail(fileId, filename, ctxPassphrase as string, ctxResolver).catch(() => {});
  }, [fileId, filename, thumbable, withinSize, ctxReady, thumbnailUrl]);

  const pending =
    thumbable && withinSize && ctxReady && !thumbnailUrl && !failedSet.has(fileId);

  return { thumbnailUrl, loading, pending };
}

/** Hook to get all cached thumbnails (for listing). */
export function useThumbnailCache(): Map<string, string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
