import { create } from "zustand";
import { persistPassphrase, loadPassphrase, clearPersistedPassphrase } from "@/lib/device-vault";
import { clearDecryptCache } from "@/lib/decrypt-cache";

// clearDecryptCache() drops the in-memory blob cache + derived KEKs AND fans out
// to registered plaintext holders (notably the decrypted-thumbnail cache, memory
// + the on-disk `zcrypt_thumbs` store, via useThumbnail's onDecryptCacheClear).
// So every lock path below that calls it leaves NO readable plaintext anywhere —
// memory or IndexedDB — and this store never imports useThumbnail (which would
// pull lib/api → store/auth into its module graph and cycle).

let clearTimer: ReturnType<typeof setTimeout> | null = null;

const REMEMBER_KEY = "zcrypt-remember-device";
const SESSION_TTL_MIN = 15;

function readRememberPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Default ON: stay unlocked on this device unless the user explicitly opts
    // out ("0"). So the first unlock persists and they're never re-prompted here.
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return false;
  }
}

function writeRememberPref(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface PassphraseStore {
  cachedPassphrase: string | null;
  /** Expiry timestamp for a SESSION (15-min) unlock. `null` when persistent or locked. */
  cacheUntil: number | null;
  /** True when unlocked via "keep me unlocked on this device" — no expiry. */
  persistent: boolean;
  /** Preference: persist the passphrase on this device on unlock (survives reloads). */
  rememberDevice: boolean;
  rememberByDefault: boolean;

  setPassphrase: (passphrase: string, ttlMinutes?: number) => void;
  getPassphrase: () => string | null;
  clear: () => void;
  getRemainingMinutes: () => number;
  /** Toggle the device-remember preference; upgrades/downgrades the current unlock. */
  setRememberDevice: (on: boolean) => void;
  /** Restore a device-persisted passphrase into memory (call once on app load). */
  rehydrate: () => Promise<void>;
}

export const usePassphraseStore = create<PassphraseStore>((set, get) => ({
  cachedPassphrase: null,
  cacheUntil: null,
  persistent: false,
  rememberDevice: readRememberPref(),
  rememberByDefault: true,

  setPassphrase: (passphrase, ttlMinutes = SESSION_TTL_MIN) => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }

    if (get().rememberDevice) {
      // Persistent unlock: no TTL, survives reloads. Encrypt-at-rest on device.
      set({ cachedPassphrase: passphrase, cacheUntil: null, persistent: true });
      void persistPassphrase(passphrase);
      return;
    }

    // Session unlock: cached in memory only, auto-clears after the TTL.
    const cacheUntil = Date.now() + ttlMinutes * 60 * 1000;
    set({ cachedPassphrase: passphrase, cacheUntil, persistent: false });
    clearTimer = setTimeout(() => {
      set({ cachedPassphrase: null, cacheUntil: null });
      clearTimer = null;
      // Vault auto-locked on TTL — drop decrypted plaintext too (it must not
      // outlive the unlocked session).
      clearDecryptCache();
    }, ttlMinutes * 60 * 1000);
  },

  getPassphrase: () => {
    const { cachedPassphrase, cacheUntil, persistent } = get();
    if (!cachedPassphrase) return null;
    if (persistent) return cachedPassphrase; // no expiry
    if (!cacheUntil) return null;
    if (Date.now() > cacheUntil) {
      set({ cachedPassphrase: null, cacheUntil: null });
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      // Lazy TTL expiry on read — same plaintext eviction as the timer path.
      clearDecryptCache();
      return null;
    }
    return cachedPassphrase;
  },

  clear: () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    // Locking forgets the device-persisted copy too (so a reload stays locked),
    // but keeps the rememberDevice PREFERENCE so the next unlock re-persists.
    set({ cachedPassphrase: null, cacheUntil: null, persistent: false });
    void clearPersistedPassphrase();
    // Drop all decrypted plaintext (blobs, derived keys, thumbnails) on re-lock.
    clearDecryptCache();
  },

  getRemainingMinutes: () => {
    const { cacheUntil, persistent } = get();
    if (persistent) return Infinity; // no expiry while remembered on this device
    if (!cacheUntil) return 0;
    const remaining = cacheUntil - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 60000);
  },

  setRememberDevice: (on) => {
    set({ rememberDevice: on });
    writeRememberPref(on);

    const pp = get().cachedPassphrase;
    if (on) {
      // Upgrade an already-unlocked session to a persistent device unlock.
      if (pp) {
        if (clearTimer) {
          clearTimeout(clearTimer);
          clearTimer = null;
        }
        set({ cacheUntil: null, persistent: true });
        void persistPassphrase(pp);
      }
    } else {
      // Opt out: wipe the on-device copy. Keep the current unlock as a normal
      // 15-min session so the user isn't abruptly logged out of their vault.
      void clearPersistedPassphrase();
      if (get().persistent && pp) {
        const cacheUntil = Date.now() + SESSION_TTL_MIN * 60 * 1000;
        set({ persistent: false, cacheUntil });
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
          set({ cachedPassphrase: null, cacheUntil: null });
          clearTimer = null;
          clearDecryptCache();
        }, SESSION_TTL_MIN * 60 * 1000);
      } else {
        set({ persistent: false });
      }
    }
  },

  rehydrate: async () => {
    if (!get().rememberDevice) return;
    if (get().cachedPassphrase) return; // already unlocked this session
    const pp = await loadPassphrase();
    if (pp && !get().cachedPassphrase) {
      set({ cachedPassphrase: pp, cacheUntil: null, persistent: true });
    }
  },
}));
