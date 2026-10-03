import { create } from "zustand";
import type { AuthUser } from "@/types";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { usePassphraseStore } from "@/store/passphrase";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { isTauri } from "@/lib/tauri";
import { setPersistUser, wipeQueryCache } from "@/lib/query-client";

const USER_KEY = "zcrypt-user";
const ACCESS_KEY = "zcrypt-access-token";
const REFRESH_KEY = "zcrypt-refresh-token";

/** Desktop restores its access token across restarts. The web never stores it:
 *  a reload trades the httpOnly refresh cookie for a fresh one instead, so a
 *  script running in the page cannot lift a live token from storage. */
function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  if (isTauri) return localStorage.getItem(ACCESS_KEY);
  localStorage.removeItem(ACCESS_KEY);
  return null;
}

/** Just enough of the user to render the app shell before /api/auth/me answers.
 *  Never tokens, never the email: getMe fills in the rest moments later. */
type CachedUser = Pick<AuthUser, "id" | "role" | "onboarded_at" | "username">;

export function readCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedUser;
    if (!c?.id) return null;
    return {
      id: c.id,
      role: c.role,
      onboarded_at: c.onboarded_at,
      username: c.username ?? "",
      email: "",
      email_verified: true,
      totp_enabled: false,
      created_at: "",
      updated_at: "",
    };
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null): void {
  try {
    if (!user) localStorage.removeItem(USER_KEY);
    else {
      const c: CachedUser = {
        id: user.id,
        role: user.role,
        onboarded_at: user.onboarded_at,
        username: user.username,
      };
      localStorage.setItem(USER_KEY, JSON.stringify(c));
    }
  } catch {
    /* storage unavailable: the shell just waits for getMe */
  }
}

// The user the persisted query snapshot belongs to, known at module load so the
// restore buster matches before /api/auth/me resolves.
const bootUser = readCachedUser();
setPersistUser(bootUser?.id ?? null);

export const cachedUserId: string = bootUser?.id ?? "";

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

// Tokens are only ever persisted to localStorage on desktop
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
  accessToken: readStoredAccessToken(),
  refreshTokenValue:
    typeof window !== "undefined" && isTauri ? localStorage.getItem(REFRESH_KEY) : null,
  loading: false,
  initialized: false,

  setUser: (user) => {
    const prev = readCachedUser()?.id ?? null;
    // A different account on this device must never see the previous one's
    // cached lists, in memory or on disk.
    if (user && prev && prev !== user.id) void wipeQueryCache();
    setPersistUser(user?.id ?? null);
    writeCachedUser(user);
    set({ user });
  },

  setTokens: (accessToken, refreshToken) => {
    if (isTauri) {
      localStorage.setItem(ACCESS_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
    }
    set({ accessToken, refreshTokenValue: refreshToken });
  },

  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  clearAuth: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    // Logout is stronger than a vault lock: also drop all decrypted plaintext
    // and forget the vault passphrase (incl. the device-persisted copy) so a
    // different user on the same tab can't inherit the prior session's data.
    clearDecryptCache();
    usePassphraseStore.getState().clear();
    useKeysStore.getState().reset(); // drop the in-memory private key
    useSpacesStore.getState().reset(); // drop cached space keys
    writeCachedUser(null);
    setPersistUser(null);
    void wipeQueryCache(); // every cached list, in memory and the IndexedDB snapshot
    set({ user: null, accessToken: null, refreshTokenValue: null });
  },
}));
