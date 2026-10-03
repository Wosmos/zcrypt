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

import { useAuthStore, readCachedUser } from "@/store/auth";
import { queryClient } from "@/lib/query-client";
import * as qc from "@/lib/query-client";
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
    // (clearAuth's whole job is to fan out to them): reset to a known baseline.
    usePassphraseStore.getState().setRememberDevice(false);
    usePassphraseStore.setState({ cachedPassphrase: null, cacheUntil: null, persistent: false });
    useKeysStore.getState().reset();
    useSpacesStore.getState().reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/tauri");
  });

  describe("initial hydration from localStorage", () => {
    it("desktop (Tauri): reads both tokens from localStorage when the module first loads", async () => {
      vi.doMock("@/lib/tauri", () => ({ isTauri: true }));
      localStorage.setItem("zcrypt-access-token", "stored-access");
      localStorage.setItem("zcrypt-refresh-token", "stored-refresh");
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.useAuthStore.getState().accessToken).toBe("stored-access");
      expect(fresh.useAuthStore.getState().refreshTokenValue).toBe("stored-refresh");
    });

    it("web: never reads a token from localStorage and drops a leftover access token", async () => {
      vi.doMock("@/lib/tauri", () => ({ isTauri: false }));
      localStorage.setItem("zcrypt-access-token", "stored-access");
      localStorage.setItem("zcrypt-refresh-token", "stored-refresh");
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.useAuthStore.getState().accessToken).toBeNull();
      expect(fresh.useAuthStore.getState().refreshTokenValue).toBeNull();
      expect(localStorage.getItem("zcrypt-access-token")).toBeNull();
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

  it("desktop (Tauri): setTokens persists both tokens to localStorage", async () => {
    vi.doMock("@/lib/tauri", () => ({ isTauri: true }));
    vi.resetModules();
    const fresh = await import("@/store/auth");
    fresh.useAuthStore.getState().setTokens("access-1", "refresh-1");
    expect(localStorage.getItem("zcrypt-access-token")).toBe("access-1");
    expect(localStorage.getItem("zcrypt-refresh-token")).toBe("refresh-1");
    expect(fresh.useAuthStore.getState().accessToken).toBe("access-1");
    expect(fresh.useAuthStore.getState().refreshTokenValue).toBe("refresh-1");
  });

  it("web: setTokens keeps both tokens in memory only", async () => {
    vi.doMock("@/lib/tauri", () => ({ isTauri: false }));
    vi.resetModules();
    const fresh = await import("@/store/auth");
    fresh.useAuthStore.getState().setTokens("access-1", "refresh-1");
    expect(localStorage.getItem("zcrypt-access-token")).toBeNull();
    expect(localStorage.getItem("zcrypt-refresh-token")).toBeNull();
    expect(fresh.useAuthStore.getState().accessToken).toBe("access-1");
    expect(fresh.useAuthStore.getState().refreshTokenValue).toBe("refresh-1");
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

  describe("cached identity (instant shell)", () => {
    it("persists only id, role, onboarded_at and username, and reads it back", () => {
      useAuthStore.getState().setUser({ ...USER, onboarded_at: "2026-02-01" });
      const raw = JSON.parse(localStorage.getItem("zcrypt-user")!);
      expect(raw).toEqual({
        id: "user-1",
        role: Role.User,
        onboarded_at: "2026-02-01",
        username: "alice",
      });
      expect(raw.email).toBeUndefined();
      const cached = readCachedUser();
      expect(cached).toMatchObject({ id: "user-1", role: Role.User, username: "alice", email: "" });
    });

    it("reads nothing for missing, id-less, username-less or corrupt entries", () => {
      expect(readCachedUser()).toBeNull();
      localStorage.setItem("zcrypt-user", JSON.stringify({ role: "user" }));
      expect(readCachedUser()).toBeNull();
      localStorage.setItem("zcrypt-user", "{not json");
      expect(readCachedUser()).toBeNull();
      localStorage.setItem("zcrypt-user", JSON.stringify({ id: "u", role: "user" }));
      expect(readCachedUser()?.username).toBe("");
    });

    it("reads nothing during SSR", () => {
      vi.stubGlobal("window", undefined);
      expect(readCachedUser()).toBeNull();
    });

    it("survives storage that throws on write", () => {
      const spy = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      expect(() => useAuthStore.getState().setUser(USER)).not.toThrow();
      spy.mockRestore();
    });

    it("wipes the query cache when a different account signs in on this device", () => {
      const wipe = vi.spyOn(qc, "wipeQueryCache");
      useAuthStore.getState().setUser(USER);
      expect(wipe).not.toHaveBeenCalled();
      useAuthStore.getState().setUser(USER); // same account again
      expect(wipe).not.toHaveBeenCalled();
      queryClient.setQueryData(["files"], [{ id: "a-file" }]);
      useAuthStore.getState().setUser({ ...USER, id: "user-2" });
      expect(wipe).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(["files"])).toBeUndefined();
      wipe.mockRestore();
    });

    it("clearAuth forgets the cached identity and wipes the query cache", () => {
      useAuthStore.getState().setUser(USER);
      queryClient.setQueryData(["files"], [{ id: "a-file" }]);
      useAuthStore.getState().clearAuth();
      expect(localStorage.getItem("zcrypt-user")).toBeNull();
      expect(queryClient.getQueryData(["files"])).toBeUndefined();
    });

    it("exposes the boot-time cached user id for the persist buster", async () => {
      localStorage.setItem("zcrypt-user", JSON.stringify({ id: "boot-user", role: "user" }));
      vi.resetModules();
      const fresh = await import("@/store/auth");
      expect(fresh.cachedUserId).toBe("boot-user");
      localStorage.clear();
      vi.resetModules();
      expect((await import("@/store/auth")).cachedUserId).toBe("");
    });
  });
});
