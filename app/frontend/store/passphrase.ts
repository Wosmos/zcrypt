import { create } from "zustand";

let clearTimer: ReturnType<typeof setTimeout> | null = null;

interface PassphraseStore {
  cachedPassphrase: string | null;
  cacheUntil: number | null;
  rememberByDefault: boolean;

  setPassphrase: (passphrase: string, ttlMinutes?: number) => void;
  getPassphrase: () => string | null;
  clear: () => void;
  getRemainingMinutes: () => number;
}

export const usePassphraseStore = create<PassphraseStore>((set, get) => ({
  cachedPassphrase: null,
  cacheUntil: null,
  rememberByDefault: true,

  setPassphrase: (passphrase, ttlMinutes = 15) => {
    const cacheUntil = Date.now() + ttlMinutes * 60 * 1000;
    set({ cachedPassphrase: passphrase, cacheUntil });

    // Auto-clear when TTL expires
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      set({ cachedPassphrase: null, cacheUntil: null });
      clearTimer = null;
    }, ttlMinutes * 60 * 1000);
  },

  getPassphrase: () => {
    const { cachedPassphrase, cacheUntil } = get();
    if (!cachedPassphrase || !cacheUntil) return null;
    if (Date.now() > cacheUntil) {
      set({ cachedPassphrase: null, cacheUntil: null });
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
      return null;
    }
    return cachedPassphrase;
  },

  clear: () => {
    if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
    set({ cachedPassphrase: null, cacheUntil: null });
  },

  getRemainingMinutes: () => {
    const { cacheUntil } = get();
    if (!cacheUntil) return 0;
    const remaining = cacheUntil - Date.now();
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 60000);
  },
}));
