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
  prefetchVault,
  updateFileStyle,
  renameFile,
} from "@/store/files";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import {
  listFiles,
  listFolders,
  updateFileStyle as apiUpdateFileStyle,
  setFileName as apiSetFileName,
} from "@/lib/api";
import { deriveNameKey, encryptName } from "@/lib/name-crypto";
import type { FileMetadata } from "@/types";

vi.mock("@/lib/api", () => ({
  listFiles: vi.fn(),
  listFolders: vi.fn(),
  updateFileStyle: vi.fn(),
  setFileName: vi.fn(),
}));

// updateFileStyle drives real per-user name-key derivation (PBKDF2) + AES style
// encryption; only the network call and IndexedDB device-vault are mocked.
vi.mock("@/lib/device-vault", () => ({
  persistPassphrase: vi.fn(async () => {}),
  loadPassphrase: vi.fn(async () => null),
  clearPersistedPassphrase: vi.fn(async () => {}),
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

  describe("name resolution over the raw (ciphertext) cache", () => {
    function unlock(passphrase: string | null) {
      usePassphraseStore.setState({
        cachedPassphrase: passphrase,
        persistent: passphrase != null,
        cacheUntil: null,
      });
    }

    afterEach(() => unlock(null));

    async function sealed(name: string): Promise<FileMetadata> {
      const key = await deriveNameKey("vault-pass", "u1");
      return {
        ...makeFile(name),
        original_name: "",
        encrypted_name: await encryptName(name, key),
      };
    }

    it("keeps ciphertext in the cache and shows [locked] while locked", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      const raw = await sealed("secret.txt");
      vi.mocked(listFiles).mockResolvedValue([raw]);

      const { result } = renderHook(() => useFilesQuery(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.[0].original_name).toBe("[locked]");
      expect(queryClient.getQueryData<FileMetadata[]>(qk.files)?.[0].original_name).toBe("");
    });

    it("unlocking resolves names from cache with no refetch", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      const raw = await sealed("report.pdf");
      vi.mocked(listFiles).mockResolvedValue([raw]);
      const { result } = renderHook(() => useFilesQuery(), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      unlock("vault-pass");

      await waitFor(() => expect(result.current.data?.[0].original_name).toBe("report.pdf"));
      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(invalidateSpy.mock.calls.some((c) => c[0]?.queryKey?.[0] === "files")).toBe(false);
      expect(getFilesData()[0].original_name).toBe("report.pdf");
      // The cache itself still holds only ciphertext.
      expect(queryClient.getQueryData<FileMetadata[]>(qk.files)?.[0].original_name).toBe("");
      invalidateSpy.mockRestore();
    });

    it("a list landing while unlocked is decrypted without any hook mounted", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      setFilesData([await sealed("bg.txt")]);
      await waitFor(() => expect(getFilesData()[0].original_name).toBe("bg.txt"));
    });

    it("ensureFiles returns names resolved", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      // Set before unlocking: a hook left mounted by an earlier test re-renders
      // on unlock and would otherwise fetch the default [] first.
      vi.mocked(listFiles).mockResolvedValue([await sealed("e.txt")]);
      unlock("vault-pass");
      const data = await ensureFiles();
      expect(data[0].original_name).toBe("e.txt");
    });

    it("unlock refreshes tools lists; lock drops them; staying unlocked does neither", async () => {
      queryClient.setQueryData(qk.snapshots, [{ id: "s", label: "opened" }]);
      unlock(null);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      unlock("vault-pass");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tools"] });
      invalidateSpy.mockClear();
      unlock("vault-pass-2"); // unlocked -> unlocked: no transition
      expect(invalidateSpy).not.toHaveBeenCalled();
      invalidateSpy.mockRestore();

      usePassphraseStore.getState().clear();
      expect(queryClient.getQueryData(qk.snapshots)).toBeUndefined();
    });

    it("ignores unrelated keys and non-update cache events", () => {
      unlock("vault-pass");
      queryClient.setQueryData(["trash"], [1]);
      setFilesData([makeFile("1")]);
      queryClient.removeQueries({ queryKey: qk.files });
      expect(getFilesData()).toEqual([]);
    });

    it("installs no subscriptions without a window (SSR)", async () => {
      vi.stubGlobal("window", undefined);
      vi.resetModules();
      const filesMod = await import("@/store/files");
      expect(() => filesMod.setFilesData([makeFile("1")])).not.toThrow();
    });
  });

  describe("prefetchVault", () => {
    it("warms the file list and the root folders together", async () => {
      vi.mocked(listFiles).mockResolvedValue([makeFile("1")]);
      vi.mocked(listFolders).mockResolvedValue([]);
      await prefetchVault();
      expect(listFiles).toHaveBeenCalledTimes(1);
      expect(listFolders).toHaveBeenCalledWith(null);
      expect(queryClient.getQueryData(qk.folders(null))).toEqual([]);
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

  describe("renameFile", () => {
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
      await expect(renameFile("f1", "new name")).rejects.toThrow(
        "Unlock your vault to rename files",
      );
      expect(apiSetFileName).not.toHaveBeenCalled();
    });

    it("throws (and never calls the API) when the vault is locked", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock(null);
      await expect(renameFile("f1", "new name")).rejects.toThrow(
        "Unlock your vault to rename files",
      );
      expect(apiSetFileName).not.toHaveBeenCalled();
    });

    it("throws (and never calls the API) for a blank/whitespace-only name", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      await expect(renameFile("f1", "   ")).rejects.toThrow("Name cannot be empty");
      expect(apiSetFileName).not.toHaveBeenCalled();
    });

    it("blocks a duplicate sibling name in the same folder", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      setFilesData([
        { ...makeFile("f1"), folder_id: "fld1" },
        { ...makeFile("f2"), original_name: "taken.txt", folder_id: "fld1" },
      ]);

      await expect(renameFile("f1", "taken.txt")).rejects.toThrow(
        'A file named "taken.txt" already exists here.',
      );
      // No rename went out; the only PATCHes are the one-time legacy re-seals
      // of the two plaintext-named rows (once per file per session).
      await vi.waitFor(() => expect(apiSetFileName).toHaveBeenCalledTimes(2));
    });

    it("blocks a duplicate sibling name at the vault root", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      setFilesData([
        { ...makeFile("f1"), folder_id: undefined },
        { ...makeFile("f2"), original_name: "root.txt", folder_id: undefined },
      ]);

      await expect(renameFile("f1", "root.txt")).rejects.toThrow(
        'A file named "root.txt" already exists here.',
      );
    });

    it("allows the same name if the duplicate lives in a different folder", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      vi.mocked(apiSetFileName).mockResolvedValue({ success: true } as never);
      setFilesData([
        { ...makeFile("f1"), folder_id: "fld1" },
        { ...makeFile("f2"), original_name: "taken.txt", folder_id: "fld2" },
      ]);

      await renameFile("f1", "taken.txt");

      expect(apiSetFileName).toHaveBeenCalledTimes(1);
    });

    it("encrypts the trimmed name, calls the API with the ciphertext, then invalidates", async () => {
      useAuthStore.setState({ user: { id: "u1" } as never });
      unlock("vault-pass");
      vi.mocked(apiSetFileName).mockResolvedValue({ success: true } as never);
      setFilesData([makeFile("f1")]);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await renameFile("f1", "  My New Name.txt  ");

      expect(apiSetFileName).toHaveBeenCalledTimes(1);
      const [fileId, encrypted] = vi.mocked(apiSetFileName).mock.calls[0];
      expect(fileId).toBe("f1");
      expect(typeof encrypted).toBe("string");
      expect((encrypted as string).length).toBeGreaterThan(0);
      expect(encrypted).not.toContain("My New Name");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: qk.files });
      invalidateSpy.mockRestore();
    });
  });
});
