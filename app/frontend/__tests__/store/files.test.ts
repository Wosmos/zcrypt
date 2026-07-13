import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// store/files.ts pulls in store/auth.ts, which reads `localStorage` unguarded
// at module load. This environment's global `localStorage` (Node's built-in,
// not jsdom's) is non-functional without `--localstorage-file`, so install a
// working stub before any import evaluates (vi.hoisted runs ahead of imports).
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

import * as React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  useFilesQuery,
  getFilesData,
  setFilesData,
  invalidateFiles,
  ensureFiles,
  prefetchFileList,
  updateFileStyle,
} from "@/store/files";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { listFiles, updateFileStyle as apiUpdateFileStyle } from "@/lib/api";
import { getOfflineCache } from "@/lib/offline-cache";
import type { FileMetadata } from "@/types";

vi.mock("@/lib/api", () => ({
  listFiles: vi.fn(),
  updateFileStyle: vi.fn(),
}));

// updateFileStyle drives real per-user name-key derivation (PBKDF2) + AES style
// encryption; only the network call and IndexedDB device-vault are mocked.
vi.mock("@/lib/device-vault", () => ({
  persistPassphrase: vi.fn(async () => {}),
  loadPassphrase: vi.fn(async () => null),
  clearPersistedPassphrase: vi.fn(async () => {}),
}));

vi.mock("@/lib/offline-cache", () => ({
  getOfflineCache: vi.fn(),
}));

function makeFile(id: string): FileMetadata {
  return {
    id,
    original_name: `${id}.txt`,
    original_size: 10,
    compressed_size: 8,
    encrypted_size: 9,
    chunk_count: 1,
    sha256: `sha-${id}`,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("files store (TanStack Query)", () => {
  beforeEach(() => {
    queryClient.clear();
    useAuthStore.setState({ user: null });
    vi.clearAllMocks();
    vi.mocked(listFiles).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getFilesData returns [] when nothing is cached yet", () => {
    expect(getFilesData()).toEqual([]);
  });

  it("useFilesQuery fetches through listFiles and exposes the result", async () => {
    const files = [makeFile("1")];
    vi.mocked(listFiles).mockResolvedValue(files);

    const { result } = renderHook(() => useFilesQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(files);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it("setFilesData accepts a direct array", () => {
    const files = [makeFile("1")];
    setFilesData(files);
    expect(getFilesData()).toEqual(files);
  });

  it("setFilesData accepts an updater function seeded with [] when nothing was cached", () => {
    setFilesData((prev) => [...prev, makeFile("1")]);
    expect(getFilesData()).toEqual([makeFile("1")]);
  });

  it("setFilesData's updater sees the previous data", () => {
    setFilesData([makeFile("1")]);
    setFilesData((prev) => [...prev, makeFile("2")]);
    expect(getFilesData().map((f) => f.id)).toEqual(["1", "2"]);
  });

  it("invalidateFiles invalidates the files query key", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await invalidateFiles();
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.files });
  });

  it("ensureFiles returns already-cached data without refetching", async () => {
    setFilesData([makeFile("1")]);
    const data = await ensureFiles();
    expect(data).toEqual([makeFile("1")]);
    expect(listFiles).not.toHaveBeenCalled();
  });

  it("ensureFiles fetches via listFiles when nothing is cached", async () => {
    vi.mocked(listFiles).mockResolvedValue([makeFile("9")]);
    const data = await ensureFiles();
    expect(data).toEqual([makeFile("9")]);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it("prefetchFileList(false) prefetches when the cache is empty", async () => {
    vi.mocked(listFiles).mockResolvedValue([makeFile("1")]);
    await prefetchFileList();
    expect(listFiles).toHaveBeenCalledTimes(1);
    expect(getFilesData()).toEqual([makeFile("1")]);
  });

  it("prefetchFileList(true) force-invalidates and refetches everything", async () => {
    setFilesData([makeFile("1")]);
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await prefetchFileList(true);
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.files, refetchType: "all" });
  });

  describe("hydrateFilesFromCache", () => {
    // hydrateFilesFromCache guards itself with a private module-level "hydrated"
    // flag that only ever resets when called with no logged-in user. Each test
    // below reloads a fresh module instance (vi.resetModules) so that flag starts
    // at its initial `false` regardless of test order.
    // NOTE: resetModules also gives store/files.ts a fresh "@/lib/query-client"
    // instance, distinct from this file's top-level `queryClient`/`getFilesData`.
    // So every assertion here must go through the FRESH module's own
    // getFilesData/setFilesData, not the top-level ones.
    async function freshHydrate() {
      vi.resetModules();
      const filesMod = await import("@/store/files");
      const authMod = await import("@/store/auth");
      const offlineCacheMod = await import("@/lib/offline-cache");
      return {
        hydrateFilesFromCache: filesMod.hydrateFilesFromCache,
        getFilesData: filesMod.getFilesData,
        setFilesData: filesMod.setFilesData,
        useAuthStore: authMod.useAuthStore,
        getOfflineCache: offlineCacheMod.getOfflineCache,
      };
    }

    it("no-ops (and stays retryable) when there is no logged-in user", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: null });
      await mod.hydrateFilesFromCache();
      expect(mod.getOfflineCache).not.toHaveBeenCalled();
    });

    it("seeds the query cache from OPFS when empty and a user is present", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: { id: "u1" } as never });
      const cached = [makeFile("cached-1")];
      vi.mocked(mod.getOfflineCache).mockResolvedValue({
        getFiles: vi.fn(() => cached),
      } as never);

      await mod.hydrateFilesFromCache();
      expect(mod.getFilesData()).toEqual(cached);
    });

    it("does not overwrite data that is already present", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: { id: "u1" } as never });
      mod.setFilesData([makeFile("already-here")]);

      await mod.hydrateFilesFromCache();
      expect(mod.getOfflineCache).not.toHaveBeenCalled();
      expect(mod.getFilesData()).toEqual([makeFile("already-here")]);
    });

    it("leaves the cache untouched when the OPFS cache is empty", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: { id: "u1" } as never });
      vi.mocked(mod.getOfflineCache).mockResolvedValue({ getFiles: vi.fn(() => []) } as never);

      await mod.hydrateFilesFromCache();
      expect(mod.getFilesData()).toEqual([]);
    });

    it("swallows an OPFS failure and leaves the cache empty", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: { id: "u1" } as never });
      vi.mocked(mod.getOfflineCache).mockRejectedValue(new Error("OPFS unavailable"));

      await expect(mod.hydrateFilesFromCache()).resolves.toBeUndefined();
      expect(mod.getFilesData()).toEqual([]);
    });

    it("is a no-op on a second call within the same session", async () => {
      const mod = await freshHydrate();
      mod.useAuthStore.setState({ user: { id: "u1" } as never });
      vi.mocked(mod.getOfflineCache).mockResolvedValue({
        getFiles: vi.fn(() => [makeFile("first-call")]),
      } as never);

      await mod.hydrateFilesFromCache();
      vi.mocked(mod.getOfflineCache).mockClear();

      await mod.hydrateFilesFromCache();
      expect(mod.getOfflineCache).not.toHaveBeenCalled();
    });
  });

  describe("OPFS write-through mirror", () => {
    it("mirrors a files-key update into the offline cache after a microtask", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      const setFiles = vi.fn();
      vi.mocked(getOfflineCache).mockResolvedValue({ getFiles: vi.fn(), setFiles } as never);

      setFilesData([makeFile("1")]);
      await flushMicrotasks();

      expect(getOfflineCache).toHaveBeenCalled();
      expect(setFiles).toHaveBeenCalledWith("u1", [makeFile("1")]);
    });

    it("strips decrypted names/styles of zero-knowledge files before persisting to OPFS", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      const setFiles = vi.fn();
      vi.mocked(getOfflineCache).mockResolvedValue({ getFiles: vi.fn(), setFiles } as never);

      // Three shapes so both the outer condition and the inner name ternary are
      // exercised: (a) encrypted name + style -> name blanked, style dropped;
      // (b) encrypted style only -> keep plaintext-less name as-is, style dropped;
      // (c) legacy plaintext -> untouched.
      const encName = {
        ...makeFile("a"),
        encrypted_name: "ENCNAME",
        encrypted_style: "ENCSTYLE",
        original_name: "secret.txt",
        style: { icon: "star" },
      } as FileMetadata;
      const encStyleOnly = {
        ...makeFile("b"),
        encrypted_style: "ENCSTYLE",
        original_name: "legacy.txt",
        style: { icon: "heart" },
      } as FileMetadata;
      const plaintext = makeFile("c");

      setFilesData([encName, encStyleOnly, plaintext]);
      await flushMicrotasks();

      expect(setFiles).toHaveBeenCalledTimes(1);
      const [userId, persisted] = setFiles.mock.calls[0];
      expect(userId).toBe("u1");
      // (a) name blanked (it's encrypted), style dropped, ciphertext kept.
      expect(persisted[0]).toMatchObject({ id: "a", original_name: "", style: null, encrypted_name: "ENCNAME" });
      // (b) no encrypted_name -> plaintext name preserved, style still dropped.
      expect(persisted[1]).toMatchObject({ id: "b", original_name: "legacy.txt", style: null });
      // (c) legacy plaintext file passes through untouched.
      expect(persisted[2]).toEqual(plaintext);
    });

    it("coalesces multiple synchronous updates into a single persist", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      const setFiles = vi.fn();
      vi.mocked(getOfflineCache).mockResolvedValue({ getFiles: vi.fn(), setFiles } as never);

      setFilesData([makeFile("1")]);
      setFilesData((prev) => [...prev, makeFile("2")]);
      await flushMicrotasks();

      expect(setFiles).toHaveBeenCalledTimes(1);
      expect(setFiles).toHaveBeenCalledWith("u1", [makeFile("1"), makeFile("2")]);
    });

    it("skips persisting when there is no logged-in user", async () => {
      useAuthStore.setState({ user: null });
      setFilesData([makeFile("1")]);
      await flushMicrotasks();
      expect(getOfflineCache).not.toHaveBeenCalled();
    });

    it("ignores updates to unrelated query keys", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      queryClient.setQueryData(["trash"], [1]);
      await flushMicrotasks();
      expect(getOfflineCache).not.toHaveBeenCalled();
    });

    it("ignores non-update cache events (e.g. query removal)", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      setFilesData([makeFile("1")]);
      await flushMicrotasks();
      vi.clearAllMocks();

      queryClient.removeQueries({ queryKey: qk.files });
      await flushMicrotasks();
      expect(getOfflineCache).not.toHaveBeenCalled();
    });

    it("swallows a persist failure without throwing", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      vi.mocked(getOfflineCache).mockRejectedValue(new Error("no opfs"));

      expect(() => setFilesData([makeFile("1")])).not.toThrow();
      await flushMicrotasks();
    });

    it("is never installed when window is undefined at module load (SSR)", async () => {
      vi.stubGlobal("window", undefined);
      vi.resetModules();
      const filesMod = await import("@/store/files");
      const authMod = await import("@/store/auth");
      const offlineCacheMod = await import("@/lib/offline-cache");

      authMod.useAuthStore.setState({ user: { id: "u1" } as never });
      vi.mocked(offlineCacheMod.getOfflineCache).mockResolvedValue({
        getFiles: vi.fn(),
        setFiles: vi.fn(),
      } as never);

      filesMod.setFilesData([makeFile("1")]);
      await flushMicrotasks();

      expect(offlineCacheMod.getOfflineCache).not.toHaveBeenCalled();
    });
  });

  describe("updateFileStyle", () => {
    // Drive the passphrase store directly (persistent branch, no expiry) so
    // getPassphrase() returns a value without touching the device vault.
    function unlock(passphrase: string | null) {
      usePassphraseStore.setState({
        cachedPassphrase: passphrase,
        persistent: passphrase != null,
        cacheUntil: null,
      });
    }

    afterEach(() => unlock(null));

    it("throws (and never calls the API) when there is no user", async () => {
      useAuthStore.setState({ user: null });
      unlock("vault-pass");
      await expect(updateFileStyle("f1", { icon: "star" })).rejects.toThrow(
        "Unlock your vault to customize files"
      );
      expect(apiUpdateFileStyle).not.toHaveBeenCalled();
    });

    it("throws (and never calls the API) when the vault is locked", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock(null);
      await expect(updateFileStyle("f1", { icon: "star" })).rejects.toThrow(
        "Unlock your vault to customize files"
      );
      expect(apiUpdateFileStyle).not.toHaveBeenCalled();
    });

    it("encrypts a non-null style, calls the API with the ciphertext, then invalidates", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      vi.mocked(apiUpdateFileStyle).mockResolvedValue({ success: true } as never);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await updateFileStyle("f1", { icon: "star", color: "#ff0000" });

      expect(apiUpdateFileStyle).toHaveBeenCalledTimes(1);
      const [fileId, encrypted] = vi.mocked(apiUpdateFileStyle).mock.calls[0];
      expect(fileId).toBe("f1");
      // Encrypted style is opaque base64 (the plaintext never reaches the API).
      expect(typeof encrypted).toBe("string");
      expect((encrypted as string).length).toBeGreaterThan(0);
      expect(encrypted).not.toContain("star");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.files });
      invalidateSpy.mockRestore();
    });

    it("sends null (clearing the style) without encrypting when style is null", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      vi.mocked(apiUpdateFileStyle).mockResolvedValue({ success: true } as never);

      await updateFileStyle("f1", null);

      expect(apiUpdateFileStyle).toHaveBeenCalledWith("f1", null);
    });
  });

  describe("vault lock/unlock re-decrypt subscription", () => {
    it("invalidates the files list when the vault's unlocked state flips", async () => {
      // The subscription is wired via a dynamic import at module load; let that
      // microtask settle so the subscriber is registered.
      await flushMicrotasks();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      // Flip locked -> unlocked -> locked. Regardless of the module-level
      // `lastUnlocked` seed, at least one of these transitions differs and fires.
      usePassphraseStore.setState({ cachedPassphrase: "vault-pass", persistent: true, cacheUntil: null });
      usePassphraseStore.setState({ cachedPassphrase: null, persistent: false, cacheUntil: null });

      const filesInvalidations = invalidateSpy.mock.calls.filter(
        (c) => c[0]?.queryKey?.[0] === "files"
      );
      expect(filesInvalidations.length).toBeGreaterThan(0);
      invalidateSpy.mockRestore();
    });
  });
});
