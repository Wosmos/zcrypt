import { create } from "zustand";
import { clearDecryptCacheForFolder } from "@/lib/decrypt-cache";
import { ttlDeadline, minutesUntil } from "@/lib/ttl";

/**
 * In-memory per-folder password cache, mirroring `store/passphrase.ts` but keyed
 * by folder ID. A protected folder asks for its password once on open; we cache
 * it here for a TTL (default 15 min) so the user isn't nagged per file.
 *
 * Folder passwords live ONLY here, in memory — never persisted to localStorage,
 * IndexedDB, cookies, or anywhere else, and never sent to the server. The cache
 * is cleared on reload (state resets), on explicit lock, and lazily on TTL
 * expiry.
 */

interface CacheEntry {
  password: string;
  cacheUntil: number; // epoch ms
}

// Per-folder auto-clear timers. Kept outside zustand state (not serializable,
// not reactive) — same pattern as the single timer in store/passphrase.ts.
const clearTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelTimer(folderId: string) {
  const t = clearTimers.get(folderId);
  if (t) {
    clearTimeout(t);
    clearTimers.delete(folderId);
  }
}

interface FolderPasswordStore {
  /** folderId -> cached password + expiry. Replaced immutably on every change. */
  cache: Record<string, CacheEntry>;

  /** Cache a verified folder password for `ttlMinutes` (default 15). */
  set: (folderId: string, password: string, ttlMinutes?: number) => void;
  /** Return the cached password, or null if absent/expired (lazily evicts). */
  get: (folderId: string) => string | null;
  /** Whether a live (non-expired) password is cached for this folder. */
  has: (folderId: string) => boolean;
  /** Minutes remaining on this folder's cache (0 if none/expired). */
  getRemainingMinutes: (folderId: string) => number;
  /** Forget one folder's password. */
  clear: (folderId: string) => void;
  /** Forget every cached folder password. */
  clearAll: () => void;
}

export const useFolderPasswordStore = create<FolderPasswordStore>((set, get) => ({
  cache: {},

  set: (folderId, password, ttlMinutes = 15) => {
    const cacheUntil = ttlDeadline(ttlMinutes);
    set((s) => ({ cache: { ...s.cache, [folderId]: { password, cacheUntil } } }));

    cancelTimer(folderId);
    const timer = setTimeout(() => {
      clearTimers.delete(folderId);
      set((s) => {
        const { [folderId]: _removed, ...rest } = s.cache;
        return { cache: rest };
      });
      // Folder re-locked on TTL — drop its decrypted plaintext so a later open
      // re-gates it instead of being served from the cache.
      clearDecryptCacheForFolder(folderId);
    }, ttlMinutes * 60 * 1000);
    clearTimers.set(folderId, timer);
  },

  get: (folderId) => {
    const entry = get().cache[folderId];
    if (!entry) return null;
    if (Date.now() > entry.cacheUntil) {
      cancelTimer(folderId);
      set((s) => {
        const { [folderId]: _removed, ...rest } = s.cache;
        return { cache: rest };
      });
      // Lazy TTL expiry on read — same plaintext eviction as the timer path.
      clearDecryptCacheForFolder(folderId);
      return null;
    }
    return entry.password;
  },

  has: (folderId) => get().get(folderId) !== null,

  getRemainingMinutes: (folderId) => {
    const entry = get().cache[folderId];
    if (!entry) return 0;
    return minutesUntil(entry.cacheUntil);
  },

  clear: (folderId) => {
    cancelTimer(folderId);
    set((s) => {
      if (!(folderId in s.cache)) return s;
      const { [folderId]: _removed, ...rest } = s.cache;
      return { cache: rest };
    });
    // Forgetting the folder password must also evict that folder's plaintext.
    clearDecryptCacheForFolder(folderId);
  },

  clearAll: () => {
    const folderIds = Object.keys(get().cache);
    for (const folderId of clearTimers.keys()) cancelTimer(folderId);
    clearTimers.clear();
    set({ cache: {} });
    for (const folderId of folderIds) clearDecryptCacheForFolder(folderId);
  },
}));
