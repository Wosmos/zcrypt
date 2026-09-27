import { create } from "zustand";
import type { AuthUser } from "@/types";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { usePassphraseStore } from "@/store/passphrase";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { isTauri } from "@/lib/tauri";

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

// The refresh token is only ever persisted to localStorage on desktop
// (Tauri): its Rust sync worker needs the raw string across app restarts
// (lib/tauri.ts's startSync call). On the web, persisting a long-lived
// refresh token in localStorage means any XSS anywhere gets permanent
// account takeover, not just the current session — the backend now also
// sets it as an httpOnly cookie (cmd/auth.go's zcrypt_rt) on every
// login/refresh/OAuth callback, so the web app never needs the raw value:
// a plain `credentials: "include"` POST to /api/auth/refresh is enough
// (see lib/auth-fetch.ts). refreshTokenValue still gets populated in
// memory for the lifetime of the tab (desktop's startSync reads it
// in-process right after login), it just isn't written to disk for web.
export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: typeof window !== "undefined" ? localStorage.getItem("zcrypt-access-token") : null,
  refreshTokenValue:
    typeof window !== "undefined" && isTauri
      ? localStorage.getItem("zcrypt-refresh-token")
      : null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem("zcrypt-access-token", accessToken);
    if (isTauri) {
      localStorage.setItem("zcrypt-refresh-token", refreshToken);
    }
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
    useKeysStore.getState().reset(); // drop the in-memory private key
    useSpacesStore.getState().reset(); // drop cached space keys
    set({ user: null, accessToken: null, refreshTokenValue: null });
  },
}));
