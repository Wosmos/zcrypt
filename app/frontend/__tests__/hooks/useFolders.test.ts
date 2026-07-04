import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

// This environment's Node runtime ships a global `localStorage` that shadows
// jsdom's real one and throws unless `--localstorage-file` points at a valid
// path — store/auth.ts's module-level `localStorage.getItem(...)` read (no
// try/catch, unlike the passphrase store's) crashes on import as a result.
// Stub a working in-memory Storage before anything imports that module; scoped
// to this file only (vitest.setup.ts is shared and off-limits).
vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => {
        backing.set(k, String(v));
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => backing.clear(),
    },
  });
});
import { createElement, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFolders } from "@/hooks/useFolders";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { useFolderStore } from "@/store/folders";
import { useFolderRegistry } from "@/store/folder-registry";
import { deriveNameKey, encryptName } from "@/lib/name-crypto";
import * as nameCrypto from "@/lib/name-crypto";
import * as api from "@/lib/api";
import type { Folder } from "@/types";
import type { AuthUser } from "@/types";

// Folder CRUD is network I/O — mocked. Name encryption/decryption is real
// (fast, synchronous-ish WebCrypto) so round-trips are exercised for real.
vi.mock("@/lib/api", () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

// Same convention as passphrase.test.ts: never touch real IndexedDB.
vi.mock("@/lib/device-vault", () => ({
  persistPassphrase: vi.fn(async () => {}),
  loadPassphrase: vi.fn(async () => null),
  clearPersistedPassphrase: vi.fn(async () => {}),
}));

const USER: AuthUser = { id: "user-1", email: "a@example.com" } as AuthUser;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function renderFolders() {
  return renderHook(() => useFolders(), { wrapper });
}

describe("useFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    useAuthStore.getState().clearAuth();
    usePassphraseStore.getState().setRememberDevice(false);
    usePassphraseStore.getState().clear();
    useFolderStore.getState().reset();
    useFolderRegistry.setState({ byId: {} });
  });

  afterEach(() => {
    cleanup();
  });

  describe("locked state", () => {
    it("shows [locked] placeholders and locked=true when no passphrase is cached", async () => {
      useAuthStore.getState().setUser(USER);
      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: "irrelevant", created_at: "t" },
      ]);

      const { result } = renderFolders();

      await waitFor(() => expect(result.current.folders).toHaveLength(1));
      expect(result.current.locked).toBe(true);
      expect(result.current.folders[0].name).toBe("[locked]");
    });

    it("shows [locked] placeholders when there is no authenticated user (even if a passphrase were cached)", async () => {
      usePassphraseStore.getState().setPassphrase("vault-pass");
      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: "someone", parent_id: null, encrypted_name: "irrelevant", created_at: "t" },
      ]);

      const { result } = renderFolders();

      await waitFor(() => expect(result.current.folders).toHaveLength(1));
      expect(result.current.locked).toBe(true);
      expect(result.current.folders[0].name).toBe("[locked]");
    });

    it("starts with an empty folder list before the query resolves", () => {
      useAuthStore.getState().setUser(USER);
      vi.mocked(api.listFolders).mockReturnValue(new Promise(() => {}));

      const { result } = renderFolders();
      expect(result.current.folders).toEqual([]);
      expect(result.current.loading).toBe(true);
    });
  });

  describe("unlocked decrypt", () => {
    it("decrypts folder names with the derived key and derives `protected` from pw_salt", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);

      const plain: Folder = {
        id: "f1",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: await encryptName("Documents", key),
        created_at: "t",
      };
      const protectedFolder: Folder = {
        id: "f2",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: await encryptName("Secrets", key),
        created_at: "t",
        pw_salt: "c2FsdA==",
        pw_verifier: "dmVyaWZpZXI=",
      };
      vi.mocked(api.listFolders).mockResolvedValue([plain, protectedFolder]);

      const { result } = renderFolders();

      await waitFor(() => expect(result.current.folders).toHaveLength(2));
      expect(result.current.locked).toBe(false);

      const byId = Object.fromEntries(result.current.folders.map((f) => [f.id, f]));
      expect(byId.f1.name).toBe("Documents");
      expect(byId.f1.protected).toBe(false);
      expect(byId.f2.name).toBe("Secrets");
      expect(byId.f2.protected).toBe(true);
    });

    it("falls back to [locked] for a single corrupted/wrong-key name without affecting the rest", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      const otherKey = await deriveNameKey("different-pass", USER.id);

      const good: Folder = {
        id: "f1",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: await encryptName("Good", key),
        created_at: "t",
      };
      const wrongKey: Folder = {
        id: "f2",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: await encryptName("Bad", otherKey),
        created_at: "t",
      };
      const corrupted: Folder = {
        id: "f3",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: "not-valid-base64!!",
        created_at: "t",
      };
      vi.mocked(api.listFolders).mockResolvedValue([good, wrongKey, corrupted]);

      const { result } = renderFolders();

      await waitFor(() => expect(result.current.folders).toHaveLength(3));
      // Vault-level lock state is unaffected — the KEY is present and valid.
      expect(result.current.locked).toBe(false);

      const byId = Object.fromEntries(result.current.folders.map((f) => [f.id, f]));
      expect(byId.f1.name).toBe("Good");
      expect(byId.f2.name).toBe("[locked]");
      expect(byId.f3.name).toBe("[locked]");
    });

    it("memoizes the derived name key across refreshes with the same passphrase", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      const deriveSpy = vi.spyOn(nameCrypto, "deriveNameKey");

      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("A", key), created_at: "t" },
      ]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.folders).toHaveLength(1));
      const callsAfterFirstDecrypt = deriveSpy.mock.calls.length;
      expect(callsAfterFirstDecrypt).toBeGreaterThan(0);

      await act(async () => {
        await result.current.refresh();
      });
      await waitFor(() => expect(result.current.folders).toHaveLength(1));

      // Same passphrase on refresh -> the cached CryptoKey is reused, no re-derive.
      expect(deriveSpy.mock.calls.length).toBe(callsAfterFirstDecrypt);
      deriveSpy.mockRestore();
    });

    it("re-derives the name key when the passphrase changes", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("pass-a");
      const keyA = await deriveNameKey("pass-a", USER.id);

      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("Under A", keyA), created_at: "t" },
      ]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.folders[0]?.name).toBe("Under A"));

      const keyB = await deriveNameKey("pass-b", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("Under B", keyB), created_at: "t" },
      ]);

      act(() => {
        usePassphraseStore.getState().clear();
      });
      act(() => {
        usePassphraseStore.getState().setPassphrase("pass-b");
      });
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => expect(result.current.folders[0]?.name).toBe("Under B"));
      expect(result.current.locked).toBe(false);
    });

    it("discards a decrypt superseded by a vault lock mid-flight (race guard)", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);

      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("Report", key), created_at: "t" },
      ]);

      let resolveStale: (v: string) => void = () => {};
      const stale = new Promise<string>((resolve) => {
        resolveStale = resolve;
      });
      const spy = vi.spyOn(nameCrypto, "decryptNameSafe").mockReturnValueOnce(stale);

      const { result } = renderFolders();
      await waitFor(() => expect(spy).toHaveBeenCalled());

      act(() => {
        usePassphraseStore.getState().clear();
      });

      await waitFor(() => expect(result.current.locked).toBe(true));
      expect(result.current.folders[0]?.name).toBe("[locked]");

      // The superseded decrypt finally resolves — its result must be discarded.
      resolveStale("Report");
      await stale;
      await Promise.resolve();

      expect(result.current.folders[0]?.name).toBe("[locked]");
      spy.mockRestore();
    });
  });

  describe("createFolder", () => {
    it("encrypts the name, sends it with the current parent, and refreshes the list", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([]);
      vi.mocked(api.createFolder).mockResolvedValue({
        id: "new",
        user_id: USER.id,
        parent_id: null,
        encrypted_name: "x",
        created_at: "t",
      });

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.createFolder("  My Folder  ");
      });

      expect(api.createFolder).toHaveBeenCalledTimes(1);
      const call = vi.mocked(api.createFolder).mock.calls[0][0];
      expect(call.parent_id).toBeNull();
      expect(await nameCrypto.decryptName(call.encrypted_name, key)).toBe("My Folder");
    });

    it("throws and never calls the API when the vault is locked", async () => {
      useAuthStore.getState().setUser(USER);
      vi.mocked(api.listFolders).mockResolvedValue([]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.createFolder("Nope")).rejects.toThrow(
        "Unlock your vault to create folders"
      );
      expect(api.createFolder).not.toHaveBeenCalled();
    });
  });

  describe("renameFolder", () => {
    it("encrypts the new name and calls the API with the folder id", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([]);
      vi.mocked(api.renameFolder).mockResolvedValue({ success: true });

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.renameFolder("f1", "  Renamed  ");
      });

      expect(api.renameFolder).toHaveBeenCalledTimes(1);
      const [id, encryptedName] = vi.mocked(api.renameFolder).mock.calls[0];
      expect(id).toBe("f1");
      expect(await nameCrypto.decryptName(encryptedName, key)).toBe("Renamed");
    });

    it("throws and never calls the API when the vault is locked", async () => {
      useAuthStore.getState().setUser(USER);
      vi.mocked(api.listFolders).mockResolvedValue([]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(result.current.renameFolder("f1", "Nope")).rejects.toThrow(
        "Unlock your vault to rename folders"
      );
      expect(api.renameFolder).not.toHaveBeenCalled();
    });
  });

  describe("deleteFolder", () => {
    it("calls the API and invalidates folders + files views", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      vi.mocked(api.listFolders).mockResolvedValue([]);
      vi.mocked(api.deleteFolder).mockResolvedValue({ success: true });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.deleteFolder("f1");
      });

      expect(api.deleteFolder).toHaveBeenCalledWith("f1");
      const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey?.[0]);
      expect(invalidatedKeys).toContain("folders");
      expect(invalidatedKeys).toEqual(expect.arrayContaining(["files", "trash", "quota"]));
      invalidateSpy.mockRestore();
    });
  });

  describe("refresh", () => {
    it("invalidates the folders query cache", async () => {
      useAuthStore.getState().setUser(USER);
      vi.mocked(api.listFolders).mockResolvedValue([]);
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.refresh();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["folders"] });
      invalidateSpy.mockRestore();
    });
  });

  describe("navigation", () => {
    it("openFolder sets the current folder and appends a breadcrumb", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("Docs", key), created_at: "t" },
      ]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.folders).toHaveLength(1));

      act(() => {
        result.current.openFolder(result.current.folders[0]);
      });

      expect(result.current.currentFolderId).toBe("f1");
      expect(result.current.breadcrumb.map((c) => c.name)).toEqual(["My Vault", "Docs"]);
    });

    it("navigateToCrumb truncates the breadcrumb back to that index", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([
        { id: "f1", user_id: USER.id, parent_id: null, encrypted_name: await encryptName("Docs", key), created_at: "t" },
      ]);

      const { result } = renderFolders();
      await waitFor(() => expect(result.current.folders).toHaveLength(1));

      act(() => {
        result.current.openFolder(result.current.folders[0]);
      });
      expect(result.current.currentFolderId).toBe("f1");

      act(() => {
        result.current.navigateToCrumb(0);
      });

      expect(result.current.currentFolderId).toBeNull();
      expect(result.current.breadcrumb.map((c) => c.name)).toEqual(["My Vault"]);
    });
  });

  describe("registry recording", () => {
    it("records protection metadata for every browsed folder", async () => {
      useAuthStore.getState().setUser(USER);
      usePassphraseStore.getState().setPassphrase("vault-pass");
      const key = await deriveNameKey("vault-pass", USER.id);
      vi.mocked(api.listFolders).mockResolvedValue([
        {
          id: "f1",
          user_id: USER.id,
          parent_id: null,
          encrypted_name: await encryptName("Vault", key),
          created_at: "t",
          pw_salt: "c2FsdA==",
          pw_verifier: "dmVyaWZpZXI=",
        },
      ]);

      renderFolders();

      await waitFor(() => expect(useFolderRegistry.getState().isProtected("f1")).toBe(true));
    });
  });
});
