/**
 * In-memory, session-only cache of fully-decrypted file blobs, shared across the
 * whole app so re-opening — or navigating back to — a file is instant instead of
 * re-running the fetch → AES-256-GCM → zstd → SHA-256 pipeline every time.
 *
 * Zero-knowledge: entries hold DECRYPTED plaintext, so they live ONLY in memory
 * and are dropped on every lock-state transition — explicit vault lock, vault TTL
 * expiry, logout (clearDecryptCache), and a protected folder re-locking / expiring
 * (clearDecryptCacheForFolder). They are deliberately NEVER persisted to disk
 * (IndexedDB / Cache API) — unlike the small, lossy thumbnail previews in
 * useThumbnail — because writing plaintext to disk would break the zero-knowledge
 * guarantee.
 *
 * Bounded by a byte budget with LRU eviction so a few large media files can't
 * grow memory without limit. In-flight de-duplication means a viewer open and a
 * neighbour prefetch for the same file decrypt once, not twice.
 *
 * Keyed by `file.id`. Files in this system are immutable (a new upload gets a new
 * id), so the id alone is a sufficient content key. Each entry also records the
 * file's `folder_id` so a single folder's plaintext can be evicted when that
 * protected folder re-locks, without coupling this module to the file store.
 *
 * Also hosts a sibling cache for the per-file unwrapped CEK (see `cachedResolveCEK`
 * below) — the same file is often key-resolved twice (a thumbnail's chunk-0 peek,
 * then the full viewer), so memoizing the unwrap avoids paying it again. It shares
 * this module's clear/generation lifecycle so a CEK never outlives the lock event
 * that should have revoked it.
 */

import { clearDerivedKeyCache } from "@/lib/crypto";

const MAX_BYTES = 300 * 1024 * 1024; // 300 MB session budget

interface Entry {
  blob: Blob;
  folderId: string | null;
}

// Map iteration preserves insertion order; we treat the front as least-recently
// used and re-insert on access so the back is most-recently used.
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Blob>>();
let totalBytes = 0;

// Bumped on every clear (vault lock / TTL / logout / folder lock). A decrypt run
// captures the generation when it starts; if it has changed by the time the run
// resolves, the run must NOT repopulate the cache — the access window closed
// mid-decrypt (e.g. the user locked while the file was still downloading), so
// caching its plaintext would let it outlive the lock.
let generation = 0;

function touch(id: string, entry: Entry): void {
  cache.delete(id);
  cache.set(id, entry); // re-insert at the most-recently-used end
}

/** Cached blob for `id`, bumping its recency. Undefined if absent. */
export function getCachedBlob(id: string): Blob | undefined {
  const entry = cache.get(id);
  if (entry) {
    touch(id, entry);
    return entry.blob;
  }
  return undefined;
}

/** True if a blob is already cached or a decrypt for it is already running. */
export function isWarmOrInflight(id: string): boolean {
  return cache.has(id) || inflight.has(id);
}

/**
 * True while any full-file decrypt is in flight (viewer open, download reuse,
 * neighbour prefetch). Background work — e.g. the thumbnail queue — uses this
 * to yield network + CPU to the file the user is actually waiting on.
 */
export function isForegroundDecryptActive(): boolean {
  return inflight.size > 0;
}

function store(id: string, blob: Blob, folderId: string | null): void {
  if (blob.size > MAX_BYTES) return; // a single file larger than the whole budget
  const existing = cache.get(id);
  if (existing) totalBytes -= existing.blob.size;
  cache.set(id, { blob, folderId });
  totalBytes += blob.size;
  // Evict least-recently-used entries until back under budget (never the one we
  // just added — iteration starts at the LRU front, and the new entry is at the
  // back).
  for (const key of cache.keys()) {
    if (totalBytes <= MAX_BYTES) break;
    if (key === id) continue;
    totalBytes -= cache.get(key)!.blob.size;
    cache.delete(key);
  }
}

/**
 * Return the cached blob for `id`, or run `decrypt()` exactly once
 * (de-duplicating concurrent callers) and cache the result. `folderId` is the
 * file's folder (null for the vault root) so the entry can be folder-evicted.
 * Rejections are not cached, so a failed/cancelled decrypt can be retried; and a
 * run that resolves after a lock/clear does not repopulate the cache.
 */
export function cachedDecrypt(
  id: string,
  folderId: string | null,
  decrypt: () => Promise<Blob>
): Promise<Blob> {
  const hit = getCachedBlob(id);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(id);
  if (pending) return pending;

  const gen = generation;
  const run = decrypt().then((blob) => {
    // Only cache if no lock/clear happened while we were decrypting — otherwise
    // we'd repopulate a cache the user just locked. The caller still gets the
    // blob it requested (it asked while unlocked); we just don't retain it.
    if (gen === generation) store(id, blob, folderId);
    return blob;
  });
  inflight.set(id, run);
  // Clear the in-flight entry whether it resolves or rejects. The trailing catch
  // is only to avoid an unhandled rejection on this bookkeeping chain — callers
  // still receive the original `run` rejection.
  run
    .finally(() => {
      if (inflight.get(id) === run) inflight.delete(id);
    })
    .catch(() => {});
  return run;
}

/**
 * CEK cache — the per-file Content Encryption Key, already unwrapped from
 * `meta.wrapped_cek`. Unwrapping is one cheap AES-GCM call (the expensive part
 * — 600k-iteration PBKDF2 KEK derivation — is already memoized separately by
 * lib/crypto's deriveKeyBytesCached, keyed by salt+passphrase), BUT a file's
 * key is resolved from more than one place — the thumbnail pipeline
 * (useThumbnail) generates its LQIP from chunk 0, then the full viewer
 * (useFileDecryptor) resolves the SAME file's key again to decrypt every
 * chunk. Caching the final unwrapped CEK here turns the second (and every
 * later) resolution for a given file into a plain map lookup instead of a
 * repeat unwrap + await round trip through Web Crypto.
 *
 * Same exposure class + lifecycle as the plaintext blob cache above — a CEK
 * lets its holder decrypt that file's chunks, so it rides the exact same
 * lock/TTL/logout/folder-relock eviction below (and the same generation
 * guard: a resolve that finishes after a lock/clear must not repopulate it).
 */
const CEK_CACHE_MAX = 256;
interface CEKEntry {
  keyBytes: ArrayBuffer;
  folderId: string | null;
}
const cekCache = new Map<string, CEKEntry>();
const cekInflight = new Map<string, Promise<ArrayBuffer>>();

function touchCEK(id: string, entry: CEKEntry): void {
  cekCache.delete(id);
  cekCache.set(id, entry); // re-insert at the most-recently-used end
}

/** Cached CEK for `id`, or undefined. Returns a FRESH ArrayBuffer copy on every
 *  call (mirrors deriveKeyBytesCached's copy-out contract) so a caller that
 *  transfers it to a worker can never corrupt the cached bytes. */
export function getCachedCEK(id: string): ArrayBuffer | undefined {
  const entry = cekCache.get(id);
  if (!entry) return undefined;
  touchCEK(id, entry);
  return entry.keyBytes.slice(0);
}

function storeCEK(id: string, keyBytes: ArrayBuffer, folderId: string | null): void {
  if (!cekCache.has(id) && cekCache.size >= CEK_CACHE_MAX) {
    // Simple insertion-order eviction (Map iterates oldest-first) — keys are a
    // fixed 32 bytes each, so a count cap (not a byte budget) is sufficient.
    const oldest = cekCache.keys().next().value as string;
    cekCache.delete(oldest);
  }
  cekCache.set(id, { keyBytes: keyBytes.slice(0), folderId });
}

/**
 * Return the cached CEK for `id`, or run `resolve()` exactly once
 * (de-duplicating concurrent callers — e.g. a thumbnail generation and a
 * viewer open racing for the same file) and cache the result. Rejections
 * (wrong password) are not cached, so a retry re-resolves; and a resolve that
 * finishes after a lock/clear does not repopulate the cache.
 */
export function cachedResolveCEK(
  id: string,
  folderId: string | null,
  resolve: () => Promise<ArrayBuffer>
): Promise<ArrayBuffer> {
  const hit = getCachedCEK(id);
  if (hit) return Promise.resolve(hit);

  const pending = cekInflight.get(id);
  if (pending) return pending.then((keyBytes) => keyBytes.slice(0));

  const gen = generation;
  const run = resolve().then((keyBytes) => {
    if (gen === generation) storeCEK(id, keyBytes, folderId);
    return keyBytes;
  });
  cekInflight.set(id, run);
  run
    .finally(() => {
      if (cekInflight.get(id) === run) cekInflight.delete(id);
    })
    .catch(() => {});
  return run;
}

/**
 * Drop the plaintext for a single file. Called when a file is deleted, moved, or
 * restored so its decrypted bytes don't linger in memory keyed by a now-stale id
 * (and so a moved file's entry, tagged with its OLD folder, can't survive a
 * later folder re-lock). Cheap no-op if the file was never decrypted.
 */
export function clearDecryptCacheForFile(id: string): void {
  const entry = cache.get(id);
  if (entry) {
    totalBytes -= entry.blob.size;
    cache.delete(id);
  }
  cekCache.delete(id);
  // A decrypt/CEK-resolve may still be in flight for this id; bump the
  // generation so it can't repopulate either cache after we've evicted it.
  if (inflight.has(id) || cekInflight.has(id)) generation++;
}

/**
 * Modules that hold their OWN decrypted plaintext-at-rest (e.g. the thumbnail
 * cache in useThumbnail) register a clearer here. `clearDecryptCache()` — the one
 * lock / TTL / logout eviction call the stores already make — then drops their
 * plaintext too. This inversion keeps the stores from importing those modules
 * directly (which pulled lib/api → store/auth into store/passphrase's graph and
 * both created an import cycle and eagerly ran store/auth's module init).
 */
const clearListeners: Array<() => void> = [];
export function onDecryptCacheClear(cb: () => void): void {
  clearListeners.push(cb);
}

/**
 * Drop everything. Called on vault lock / TTL expiry / logout so decrypted
 * plaintext does not linger in memory once the vault re-locks.
 */
export function clearDecryptCache(): void {
  cache.clear();
  inflight.clear();
  cekCache.clear();
  cekInflight.clear();
  totalBytes = 0;
  generation++; // invalidate any in-flight run so it can't repopulate post-lock
  // Derived keys are the same exposure class as this plaintext — a lock event
  // must drop both, or a re-lock would leave 600k-iteration PBKDF2 results
  // usable in memory.
  clearDerivedKeyCache();
  // Fan out to registered plaintext holders (thumbnails) — same eviction event.
  for (const cb of clearListeners) cb();
}

/**
 * Drop only the plaintext belonging to one protected folder. Called when a
 * folder's password is forgotten (explicit re-lock, unprotect, wrong-password
 * recovery, or TTL expiry) so re-locking a folder again gates content already
 * viewed — a cache hit must never serve a folder's file after it re-locks.
 */
export function clearDecryptCacheForFolder(folderId: string): void {
  for (const [id, entry] of cache) {
    if (entry.folderId === folderId) {
      totalBytes -= entry.blob.size;
      cache.delete(id);
    }
  }
  for (const [id, entry] of cekCache) {
    if (entry.folderId === folderId) {
      cekCache.delete(id);
    }
  }
  // We can't cheaply map an in-flight decrypt/CEK-resolve to its folder, so
  // bump the generation: any run still in flight cannot repopulate either
  // cache after this (worst case an unrelated file just misses the cache and
  // re-decrypts/re-resolves later).
  generation++;
  // Same story for derived keys: there is no folder→salt mapping, so the safe
  // fallback is a FULL clear — unaffected files merely re-derive on next open.
  clearDerivedKeyCache();
}
