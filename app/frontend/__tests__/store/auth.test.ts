import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// This environment's global `localStorage` (Node's built-in, not jsdom's) is a
// non-functional stub unless `--localstorage-file` is set, so a bare
// `localStorage.getItem(...)` throws. auth.ts reads it unguarded at MODULE LOAD
// time, so the stub must be installed before the very first import of
// "@/store/auth" anywhere (hence vi.hoisted: it runs before this file's
// imports are evaluated, unlike a plain top-level statement).
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
    },
  });
});

import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { Role, type AuthUser } from "@/types";

// auth.ts's clearAuth() fans out to decrypt-cache directly; mock it so the test
// only asserts that logout wires it up, not decrypt-cache's own internals
// (those have their own test file).
vi.mock("@/lib/decrypt-cache", () => ({
  clearDecryptCache: vi.fn(),
}));

const USER: AuthUser = {
  id: "user-1",
  email: "a@example.com",
  username: "alice",
  role: Role.User,
  email_verified: true,
  totp_enabled: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshTokenValue: null,
      loading: false,
      initialized: false,
    });
    // usePassphraseStore/useKeysStore/useSpacesStore are the REAL stores here
    // (clearAuth's whole job is to fan out to them) — reset to a known baseline.
    usePassphraseStore.getState().setRememberDevice(false);
    usePassphraseStore.setState({ cachedPassphrase: null, cacheUntil: null, persistent: false });
    useKeysStore.getState().reset();
    useSpacesStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("initial hydration from localStorage", () => {
    it("reads existing tokens from localStorage when the module first loads", async () => {
      localStorage.setItem("zcrypt-access-token", "stored-access");
      localStorage.setItem("zcrypt-refresh-token", "stored-refresh");
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.useAuthStore.getState().accessToken).toBe("stored-access");
      expect(fresh.useAuthStore.getState().refreshTokenValue).toBe("stored-refresh");
    });

    it("defaults tokens to null when localStorage has nothing stored", async () => {
      localStorage.clear();
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.useAuthStore.getState().accessToken).toBeNull();
      expect(fresh.useAuthStore.getState().refreshTokenValue).toBeNull();
    });

    it("skips localStorage entirely when window is undefined (SSR)", async () => {
      localStorage.setItem("zcrypt-access-token", "should-be-ignored");
      vi.stubGlobal("window", undefined);
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.useAuthStore.getState().accessToken).toBeNull();
      expect(fresh.useAuthStore.getState().refreshTokenValue).toBeNull();
    });
  });

  it("starts logged out, not loading, not initialized", () => {
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.initialized).toBe(false);
  });

  it("setUser stores and clears the current user", () => {
    useAuthStore.getState().setUser(USER);
    expect(useAuthStore.getState().user).toEqual(USER);
    useAuthStore.getState().setUser(null);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("setTokens persists both tokens to localStorage and to state", () => {
    useAuthStore.getState().setTokens("access-1", "refresh-1");
    expect(localStorage.getItem("zcrypt-access-token")).toBe("access-1");
    expect(localStorage.getItem("zcrypt-refresh-token")).toBe("refresh-1");
    expect(useAuthStore.getState().accessToken).toBe("access-1");
    expect(useAuthStore.getState().refreshTokenValue).toBe("refresh-1");
  });

  it("setLoading toggles the loading flag", () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().loading).toBe(true);
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().loading).toBe(false);
  });

  it("setInitialized toggles the initialized flag", () => {
    useAuthStore.getState().setInitialized(true);
    expect(useAuthStore.getState().initialized).toBe(true);
  });

  describe("clearAuth", () => {
    it("wipes tokens, user, and every other zero-knowledge session store", () => {
      useAuthStore.getState().setTokens("access-1", "refresh-1");
      useAuthStore.getState().setUser(USER);

      // Persistent mode avoids scheduling a real 15-min TTL timer.
      usePassphraseStore.getState().setRememberDevice(true);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      expect(usePassphraseStore.getState().cachedPassphrase).toBe("vault-pass");

      useKeysStore.setState({
        privateKey: new Uint8Array([1, 2, 3]),
        publicKey: new Uint8Array([4, 5, 6]),
        fingerprint: "ABCD-EF01-2345-6789",
        ready: true,
        loading: false,
      });
      useSpacesStore.getState().setSpaceKey("space-1", new Uint8Array([9, 9, 9]));

      useAuthStore.getState().clearAuth();

      expect(localStorage.getItem("zcrypt-access-token")).toBeNull();
      expect(localStorage.getItem("zcrypt-refresh-token")).toBeNull();
      // Called both directly by clearAuth() and transitively via
      // usePassphraseStore's own clear() (both modules import the same mock).
      expect(clearDecryptCache).toHaveBeenCalled();

      expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
      expect(usePassphraseStore.getState().persistent).toBe(false);

      expect(useKeysStore.getState().privateKey).toBeNull();
      expect(useKeysStore.getState().publicKey).toBeNull();
      expect(useKeysStore.getState().ready).toBe(false);

      expect(useSpacesStore.getState().spaceKeys).toEqual({});

      const s = useAuthStore.getState();
      expect(s.user).toBeNull();
      expect(s.accessToken).toBeNull();
      expect(s.refreshTokenValue).toBeNull();
    });

    it("is safe to call when nothing was ever set", () => {
      expect(() => useAuthStore.getState().clearAuth()).not.toThrow();
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
