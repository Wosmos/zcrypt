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
 */

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
 * Drop everything. Called on vault lock / TTL expiry / logout so decrypted
 * plaintext does not linger in memory once the vault re-locks.
 */
export function clearDecryptCache(): void {
  cache.clear();
  inflight.clear();
  totalBytes = 0;
  generation++; // invalidate any in-flight run so it can't repopulate post-lock
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
  // We can't cheaply map an in-flight decrypt to its folder, so bump the
  // generation: any decrypt still running cannot repopulate the cache after this
  // (worst case an unrelated file just misses the cache and re-decrypts later).
  generation++;
}
