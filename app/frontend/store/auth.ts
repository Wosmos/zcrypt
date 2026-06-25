import { create } from "zustand";
import type { AuthUser } from "@/types";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { usePassphraseStore } from "@/store/passphrase";

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshTokenValue: string | null;
  loading: boolean;
  initialized: boolean;

  setUser: (user: AuthUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken:
    typeof window !== "undefined"
      ? localStorage.getItem("zcrypt-access-token")
      : null,
  refreshTokenValue:
    typeof window !== "undefined"
      ? localStorage.getItem("zcrypt-refresh-token")
      : null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem("zcrypt-access-token", accessToken);
    localStorage.setItem("zcrypt-refresh-token", refreshToken);
    set({ accessToken, refreshTokenValue: refreshToken });
  },

  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  clearAuth: () => {
    localStorage.removeItem("zcrypt-access-token");
    localStorage.removeItem("zcrypt-refresh-token");
    // Logout is stronger than a vault lock: also drop all decrypted plaintext
    // and forget the vault passphrase (incl. the device-persisted copy) so a
    // different user on the same tab can't inherit the prior session's data.
    clearDecryptCache();
    usePassphraseStore.getState().clear();
    set({ user: null, accessToken: null, refreshTokenValue: null });
  },
}));
