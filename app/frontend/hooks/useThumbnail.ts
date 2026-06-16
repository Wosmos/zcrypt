"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getFileMeta, getFileChunk } from "@/lib/api";
import { resolveFileKey, decryptChunk, fromBase64 } from "@/lib/crypto";
import { isImageFile } from "@/lib/utils";
import type { FileMetadata } from "@/types";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const DB_NAME = "zcrypt_thumbs";
const STORE_NAME = "thumbnails";
const DB_VERSION = 1;
const MAX_CONCURRENT = 3;

// ── In-memory mirror of IndexedDB ────────────────────────────────────
const memCache = new Map<string, string>();
let listeners: (() => void)[] = [];
function notify() { for (const l of listeners) l(); }
function subscribe(cb: () => void) { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; }
function getSnapshot() { return memCache; }

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
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
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

async function decryptFileToBlob(fileId: string, passphrase: string): Promise<Blob> {
  const meta = await getFileMeta(fileId);
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(passphrase, salt, meta.wrapped_cek);

  // Lazy-load zstd only when needed
  let zstd: Awaited<ReturnType<typeof import("@oneidentity/zstd-js/wasm")["ZstdInit"]>> | null = null;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < meta.chunk_count; i++) {
    const { data, compressed } = await getFileChunk(fileId, i);
    let plain = await decryptChunk(keyBytes, new Uint8Array(data));
    if (compressed) {
      if (!zstd) {
        const { ZstdInit } = await import("@oneidentity/zstd-js/wasm");
        zstd = await ZstdInit();
      }
      plain = zstd.ZstdStream.decompress(plain);
    }
    chunks.push(plain);
  }

  return new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
}

async function fetchAndCacheThumbnail(fileId: string, filename: string, passphrase: string): Promise<string | null> {
  if (memCache.has(fileId) || inflight.has(fileId)) return memCache.get(fileId) ?? null;
  inflight.add(fileId);

  await acquireSlot();
  try {
    const blob = await decryptFileToBlob(fileId, passphrase);
    const dataUrl = await generateThumbnail(blob, 300, 300);
    memCache.set(fileId, dataUrl);
    notify();
    // Persist to IndexedDB in background
    dbPut(fileId, dataUrl).catch(() => {});
    return dataUrl;
  } catch {
    return null;
  } finally {
    inflight.delete(fileId);
    releaseSlot();
  }
}

/** Batch-load thumbnails for all image files. Call once after passphrase is entered. */
export async function batchLoadThumbnails(files: FileMetadata[], passphrase: string) {
  const images = files.filter(
    (f) => isImageFile(f.original_name) && f.original_size < MAX_FILE_SIZE && !memCache.has(f.id) && !inflight.has(f.id)
  );
  // Process in parallel with concurrency limit (handled by acquireSlot)
  await Promise.allSettled(
    images.map((f) => fetchAndCacheThumbnail(f.id, f.original_name, passphrase))
  );
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
export function useThumbnail(fileId: string, filename: string): {
  thumbnailUrl: string | null;
  loading: boolean;
} {
  // Subscribe to memCache changes
  const cache = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const url = cache.get(fileId) ?? null;
  const loading = inflight.has(fileId);

  return { thumbnailUrl: url, loading };
}

/** Hook to get all cached thumbnails (for listing). */
export function useThumbnailCache(): Map<string, string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
