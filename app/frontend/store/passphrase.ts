import { create } from "zustand";

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
    set({
      cachedPassphrase: passphrase,
      cacheUntil: Date.now() + ttlMinutes * 60 * 1000,
    });
  },

  getPassphrase: () => {
    const { cachedPassphrase, cacheUntil } = get();
    if (!cachedPassphrase || !cacheUntil) return null;
    if (Date.now() > cacheUntil) {
      set({ cachedPassphrase: null, cacheUntil: null });
      return null;
    }
    return cachedPassphrase;
  },

  clear: () => {
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
