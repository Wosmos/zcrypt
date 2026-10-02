import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useFolderProtection,
  FolderUnlockCancelled,
  FolderPasswordRequired,
  resolveFilePasswordGlobal,
} from "@/hooks/useFolderProtection";
import type { UseVaultLock } from "@/hooks/useVaultLock";
import type { FileMetadata } from "@/types";

/**
 * useFolderProtection owns per-folder-password UX + crypto ROUTING, not the
 * crypto itself. Real PBKDF2/AES-GCM correctness for folder passwords is
 * already covered by __tests__/lib/metadata-crypto.test.ts (folder-crypto) and
 * __tests__/lib/crypto.test.ts (resolveFileKey/wrapKey). Here we mock those
 * primitives with fast, deterministic fakes that still encode "which
 * password unlocks which wrapped_cek", so the tests catch a REAL re-key
 * semantics bug (wrong source/dest password, dropped CEK, bad rollback) while
 * running in milliseconds instead of paying 600k-iteration PBKDF2 per call.
 */

const { getFileMeta, setFolderPassword, removeFolderPassword } = vi.hoisted(() => ({
  getFileMeta: vi.fn(),
  setFolderPassword: vi.fn(),
  removeFolderPassword: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getFileMeta, setFolderPassword, removeFolderPassword }));

const { resolveFileKey, generateSalt, fromBase64 } = vi.hoisted(() => ({
  resolveFileKey: vi.fn(),
  generateSalt: vi.fn(),
  fromBase64: vi.fn(),
}));
vi.mock("@/lib/crypto", () => ({ resolveFileKey, generateSalt, fromBase64 }));

const { deriveFolderPwSalt, makeFolderVerifier, verifyFolderPassword, rewrapFileKey } = vi.hoisted(() => ({
  deriveFolderPwSalt: vi.fn(),
  makeFolderVerifier: vi.fn(),
  verifyFolderPassword: vi.fn(),
  rewrapFileKey: vi.fn(),
}));
vi.mock("@/lib/folder-crypto", () => ({
  deriveFolderPwSalt,
  makeFolderVerifier,
  verifyFolderPassword,
  rewrapFileKey,
}));

const { folderRegistryState } = vi.hoisted(() => ({
  folderRegistryState: { get: vi.fn(), isProtected: vi.fn(), record: vi.fn() },
}));
vi.mock("@/store/folder-registry", () => {
  const useFolderRegistry = Object.assign(
    (selector: (s: typeof folderRegistryState) => unknown) => selector(folderRegistryState),
    { getState: () => folderRegistryState }
  );
  return { useFolderRegistry };
});

const { folderPasswordState } = vi.hoisted(() => ({
  folderPasswordState: {
    set: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
    has: vi.fn(),
    getRemainingMinutes: vi.fn(),
    clearAll: vi.fn(),
  },
}));
vi.mock("@/store/folder-passwords", () => {
  const useFolderPasswordStore = Object.assign(
    (selector: (s: typeof folderPasswordState) => unknown) => selector(folderPasswordState),
    { getState: () => folderPasswordState }
  );
  return { useFolderPasswordStore };
});

const { passphraseState } = vi.hoisted(() => ({
  passphraseState: { getPassphrase: vi.fn() },
}));
vi.mock("@/store/passphrase", () => ({ usePassphraseStore: { getState: () => passphraseState } }));

const { getFilesData } = vi.hoisted(() => ({ getFilesData: vi.fn() }));
vi.mock("@/store/files", () => ({ getFilesData }));

// ── Fast fakes that still model the REAL invariant: a wrapped_cek only
// unwraps under the password it was wrapped with (":"-delimited fixture
// format: "wrapped:<password>:<cekTag>"). Wrong password -> reject, exactly
// like resolveFileKey's real IncorrectPassphraseError. ──
function defaultResolveFileKey(password: string, _salt: Uint8Array, wrappedCek?: string | null) {
  if (!wrappedCek) return Promise.resolve(new TextEncoder().encode(`legacy:${password}`).buffer);
  const [, pw, cekTag] = wrappedCek.split(":");
  if (cekTag && cekTag.endsWith("FAIL")) return Promise.reject(new Error("simulated decrypt failure"));
  if (pw !== password) return Promise.reject(new Error("Incorrect passphrase: could not unlock this file."));
  return Promise.resolve(new TextEncoder().encode(cekTag).buffer);
}

function defaultRewrapFileKey(cek: Uint8Array, newPassword: string, _newSalt: Uint8Array) {
  const cekTag = new TextDecoder().decode(cek);
  return Promise.resolve({ salt: `salt(${newPassword})`, wrapped_cek: `wrapped:${newPassword}:${cekTag}` });
}

function makeVault(withPassphrase: UseVaultLock["withPassphrase"]): UseVaultLock {
  return {
    unlocked: true,
    persistent: false,
    remainingMinutes: 0,
    remainingSeconds: 0,
    unlock: vi.fn(),
    lock: vi.fn(),
    withPassphrase,
    modalProps: {
      open: false,
      title: "",
      subtitle: "",
      confirmLabel: "",
      error: null,
      onConfirm: vi.fn(),
      onClose: vi.fn(),
    },
    setError: vi.fn(),
    reopen: vi.fn(),
  };
}

function makeFile(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    id: "file-1",
    original_name: "file.txt",
    original_size: 10,
    compressed_size: 8,
    encrypted_size: 9,
    chunk_count: 1,
    sha256: "abc",
    created_at: "2026-01-01T00:00:00Z",
    folder_id: null,
    ...overrides,
  };
}

function makeMeta(id: string, password: string, cekTag: string, salt = `salt-${id}`) {
  return {
    id,
    original_name: `${id}.bin`,
    original_size: 1,
    compressed_size: 1,
    encrypted_size: 1,
    chunk_count: 1,
    sha256: "x",
    salt,
    wrapped_cek: `wrapped:${password}:${cekTag}`,
    status: "done",
    created_at: "now",
  };
}

type Rekey = { file_id: string; salt: string; wrapped_cek: string };

/** A tiny stateful fake "server": getFileMeta reads a Map that the folder
 *  (un)protect calls update with ALL their re-keys in one go, mirroring the
 *  backend's single transaction (a rejected call applies nothing). */
function makeFileServer(initial: Record<string, { password: string; cekTag: string; salt: string }>) {
  const state = new Map(Object.entries(initial));
  getFileMeta.mockImplementation(async (id: string) => {
    const w = state.get(id);
    if (!w) throw new Error(`no fixture meta for ${id}`);
    return makeMeta(id, w.password, w.cekTag, w.salt);
  });
  const apply = (rekeys: Rekey[]) => {
    for (const r of rekeys) {
      const [, pw, cekTag] = r.wrapped_cek.split(":");
      state.set(r.file_id, { password: pw, cekTag, salt: r.salt });
    }
    return { success: true };
  };
  setFolderPassword.mockImplementation(async (_fid: string, _s: string, _v: string, rekeys: Rekey[]) =>
    apply(rekeys),
  );
  removeFolderPassword.mockImplementation(async (_fid: string, rekeys: Rekey[]) => apply(rekeys));
  return state;
}

beforeEach(() => {
  getFileMeta.mockReset();
  setFolderPassword.mockReset().mockImplementation(async () => ({ success: true }));
  removeFolderPassword.mockReset().mockImplementation(async () => ({ success: true }));

  resolveFileKey.mockReset().mockImplementation(defaultResolveFileKey);
  generateSalt.mockReset().mockReturnValue(new Uint8Array([9, 9, 9]));
  fromBase64.mockReset().mockImplementation((s: string) => new TextEncoder().encode(s));

  deriveFolderPwSalt.mockReset().mockReturnValue("pw-salt-b64");
  makeFolderVerifier.mockReset().mockImplementation(async (password: string) => `verifier(${password})`);
  verifyFolderPassword
    .mockReset()
    .mockImplementation(async (password: string, _salt: string, verifier: string) => verifier === `verifier(${password})`);
  rewrapFileKey.mockReset().mockImplementation(defaultRewrapFileKey);

  folderRegistryState.get.mockReset().mockReturnValue(null);
  folderRegistryState.isProtected.mockReset().mockReturnValue(false);
  folderRegistryState.record.mockReset();

  folderPasswordState.set.mockReset();
  folderPasswordState.get.mockReset().mockReturnValue(null);
  folderPasswordState.clear.mockReset();
  folderPasswordState.has.mockReset();
  folderPasswordState.getRemainingMinutes.mockReset();
  folderPasswordState.clearAll.mockReset();

  passphraseState.getPassphrase.mockReset().mockReturnValue(null);
  getFilesData.mockReset().mockReturnValue([]);
});

describe("isFileProtected", () => {
  it("is false for a file with no folder", () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.isFileProtected(makeFile({ folder_id: null }))).toBe(false);
  });

  it("is false when the folder is unknown to the registry", () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.isFileProtected(makeFile({ folder_id: "f1" }))).toBe(false);
  });

  it("is false for a known but unprotected folder", () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: null, pwVerifier: null });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.isFileProtected(makeFile({ folder_id: "f1" }))).toBe(false);
  });

  it("is true for a protected folder", () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "s", pwVerifier: "v" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.isFileProtected(makeFile({ folder_id: "f1" }))).toBe(true);
  });
});

describe("passwordForFile", () => {
  it("resolves the vault passphrase for a file with no folder", async () => {
    const withPassphrase = vi.fn((action: (pp: string) => void) => action("vault-pw"));
    const { result } = renderHook(() => useFolderProtection(makeVault(withPassphrase)));
    await expect(result.current.passwordForFile(makeFile({ folder_id: null }))).resolves.toBe("vault-pw");
    expect(withPassphrase).toHaveBeenCalledTimes(1);
  });

  it("resolves the vault passphrase for a file in a known-unprotected folder", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: null, pwVerifier: null });
    const withPassphrase = vi.fn((action: (pp: string) => void) => action("vault-pw"));
    const { result } = renderHook(() => useFolderProtection(makeVault(withPassphrase)));
    await expect(result.current.passwordForFile(makeFile({ folder_id: "f1" }))).resolves.toBe("vault-pw");
  });

  it("resolves the CACHED folder password without opening the modal", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(folder-pw)" });
    folderPasswordState.get.mockReturnValue("folder-pw");
    const withPassphrase = vi.fn();
    const { result } = renderHook(() => useFolderProtection(makeVault(withPassphrase)));
    await expect(result.current.passwordForFile(makeFile({ folder_id: "f1" }))).resolves.toBe("folder-pw");
    expect(withPassphrase).not.toHaveBeenCalled();
    expect(result.current.modalState.open).toBe(false);
  });

  it("prompts, verifies, caches, and resolves when the folder password is not cached", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.passwordForFile(makeFile({ folder_id: "f1" }));
    });
    expect(result.current.modalState.open).toBe(true);
    expect(result.current.modalState.folderName).toBe("this folder");

    await act(async () => {
      await result.current.modalState.onConfirm("right-pw");
    });

    await expect(promise).resolves.toBe("right-pw");
    expect(folderPasswordState.set).toHaveBeenCalledWith("f1", "right-pw");
    expect(result.current.modalState.open).toBe(false);
  });

  it("shows an inline error on a wrong password, then resolves once the right one is given", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.passwordForFile(makeFile({ folder_id: "f1" }));
    });

    await act(async () => {
      await result.current.modalState.onConfirm("wrong-pw");
    });
    expect(result.current.modalState.error).toBe("Incorrect folder password. Please try again.");
    expect(result.current.modalState.open).toBe(true);

    await act(async () => {
      await result.current.modalState.onConfirm("right-pw");
    });
    await expect(promise).resolves.toBe("right-pw");
  });

  it("rejects with FolderUnlockCancelled when the user closes the prompt", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    let promise!: Promise<string>;
    act(() => {
      promise = result.current.passwordForFile(makeFile({ folder_id: "f1" }));
    });
    act(() => {
      result.current.modalState.onClose();
    });
    await expect(promise).rejects.toBeInstanceOf(FolderUnlockCancelled);
    expect(result.current.modalState.open).toBe(false);
  });
});

describe("withFolderPassword", () => {
  it("runs the action immediately when the password is already cached", () => {
    folderPasswordState.get.mockReturnValue("cached-pw");
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const action = vi.fn();
    act(() => result.current.withFolderPassword("f1", "Docs", action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.modalState.open).toBe(false);
  });

  it("prompts, verifies, and runs the action after a correct password", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const action = vi.fn();

    act(() => result.current.withFolderPassword("f1", "Docs", action));
    expect(result.current.modalState.open).toBe(true);
    expect(action).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.modalState.onConfirm("right-pw");
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(folderPasswordState.set).toHaveBeenCalledWith("f1", "right-pw");
  });

  it("re-prompts on a wrong password without running the action", async () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const action = vi.fn();

    act(() => result.current.withFolderPassword("f1", "Docs", action));
    await act(async () => {
      await result.current.modalState.onConfirm("wrong-pw");
    });
    expect(action).not.toHaveBeenCalled();
    expect(result.current.modalState.error).toBe("Incorrect folder password. Please try again.");
  });

  it("runs onCancel (not the action) when the user closes the prompt", () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "salt", pwVerifier: "verifier(right-pw)" });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const action = vi.fn();
    const onCancel = vi.fn();

    act(() => result.current.withFolderPassword("f1", "Docs", action, onCancel));
    act(() => result.current.modalState.onClose());
    expect(action).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("closing without an onCancel callback does not throw", () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    act(() => result.current.withFolderPassword("f1", "Docs", vi.fn()));
    expect(() => act(() => result.current.modalState.onClose())).not.toThrow();
  });

  it("onConfirm guards against a folder that isn't actually protected", async () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const action = vi.fn();
    act(() => result.current.withFolderPassword("f1", "Docs", action));
    await act(async () => {
      await result.current.modalState.onConfirm("whatever");
    });
    expect(action).not.toHaveBeenCalled();
    expect(result.current.modalState.error).toBe("This folder is not password-protected.");
  });
});

describe("modalState edge cases", () => {
  it("onConfirm is a no-op when no folder is pending", async () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    await act(async () => {
      await result.current.modalState.onConfirm("x");
    });
    expect(result.current.modalState.open).toBe(false);
    expect(verifyFolderPassword).not.toHaveBeenCalled();
  });

  it("onClose is a no-op when nothing is pending", () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(() => act(() => result.current.modalState.onClose())).not.toThrow();
  });
});

describe("clearFolderPassword", () => {
  it("clears the cache for that folder", () => {
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    act(() => result.current.clearFolderPassword("f1"));
    expect(folderPasswordState.clear).toHaveBeenCalledWith("f1");
  });
});

describe("thumbnailPasswordResolver", () => {
  it("returns the vault passphrase when the file is unknown (not in the map)", () => {
    passphraseState.getPassphrase.mockReturnValue("vault-pw");
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.thumbnailPasswordResolver("missing", new Map())).toBe("vault-pw");
  });

  it("returns the vault passphrase for an unprotected file", () => {
    passphraseState.getPassphrase.mockReturnValue("vault-pw");
    const fileById = new Map([["file-1", makeFile({ folder_id: null })]]);
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.thumbnailPasswordResolver("file-1", fileById)).toBe("vault-pw");
  });

  it("returns the cached folder password for an unlocked protected folder", () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "s", pwVerifier: "v" });
    folderPasswordState.get.mockReturnValue("folder-pw");
    const fileById = new Map([["file-1", makeFile({ folder_id: "f1" })]]);
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.thumbnailPasswordResolver("file-1", fileById)).toBe("folder-pw");
  });

  it("returns null (skip, never prompt) for a locked protected folder", () => {
    folderRegistryState.get.mockReturnValue({ pwSalt: "s", pwVerifier: "v" });
    folderPasswordState.get.mockReturnValue(null);
    const fileById = new Map([["file-1", makeFile({ folder_id: "f1" })]]);
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    expect(result.current.thumbnailPasswordResolver("file-1", fileById)).toBeNull();
  });
});

describe("rekeyFileForMove", () => {
  it("unprotected -> protected: recovers the CEK under the vault pass and rewraps under the folder pass", async () => {
    getFileMeta.mockResolvedValue(makeMeta("file-1", "vault-pw", "CEK-1", "salt-a"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    const rekey = await result.current.rekeyFileForMove("file-1", "vault-pw", "folder-pw");

    expect(getFileMeta).toHaveBeenCalledWith("file-1");
    expect(resolveFileKey).toHaveBeenCalledWith("vault-pw", fromBase64("salt-a"), "wrapped:vault-pw:CEK-1");
    // Wrapped in `new Uint8Array(...)` (not a bare TextEncoder().encode()
    // result) because the hook's `cek` is itself a `new Uint8Array(cekBuf)`
    // view over the resolved ArrayBuffer: on this runtime a raw
    // TextEncoder() output and a same-content Uint8Array(buffer) view compare
    // unequal by reference-y identity checks despite identical bytes.
    expect(rewrapFileKey).toHaveBeenCalledWith(
      new Uint8Array(new TextEncoder().encode("CEK-1")),
      "folder-pw",
      new Uint8Array([9, 9, 9])
    );
    expect(rekey).toEqual({ file_id: "file-1", salt: "salt(folder-pw)", wrapped_cek: "wrapped:folder-pw:CEK-1" });
  });

  it("protected -> unprotected: recovers under the folder pass and rewraps under the vault pass", async () => {
    getFileMeta.mockResolvedValue(makeMeta("file-1", "folder-pw", "CEK-2"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    await expect(result.current.rekeyFileForMove("file-1", "folder-pw", "vault-pw")).resolves.toEqual({
      file_id: "file-1",
      salt: "salt(vault-pw)",
      wrapped_cek: "wrapped:vault-pw:CEK-2",
    });
  });

  it("protected A -> protected B: rewraps under folder B's password", async () => {
    getFileMeta.mockResolvedValue(makeMeta("file-1", "folder-a-pw", "CEK-3"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    const rekey = await result.current.rekeyFileForMove("file-1", "folder-a-pw", "folder-b-pw");
    expect(rekey.wrapped_cek).toBe("wrapped:folder-b-pw:CEK-3");
  });

  it("only computes the envelope: nothing is written until the move carries it", async () => {
    getFileMeta.mockResolvedValue(makeMeta("file-1", "vault-pw", "CEK-4"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    await result.current.rekeyFileForMove("file-1", "vault-pw", "folder-pw");
    expect(setFolderPassword).not.toHaveBeenCalled();
    expect(removeFolderPassword).not.toHaveBeenCalled();
  });

  it("rejects on a wrong source password and never rewraps", async () => {
    getFileMeta.mockResolvedValue(makeMeta("file-1", "correct-pw", "CEK-5"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));
    await expect(result.current.rekeyFileForMove("file-1", "wrong-pw", "folder-pw")).rejects.toThrow(
      "Incorrect passphrase"
    );
    expect(rewrapFileKey).not.toHaveBeenCalled();
  });
});

describe("protectFolder", () => {
  it("re-keys every file to the new folder password with the protection record in one call, and caches it", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "vault-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "vault-pw", cekTag: "CEK-2", salt: "s2" },
    });
    deriveFolderPwSalt.mockReturnValue("new-pw-salt");
    const progress: { done: number; total: number }[] = [];
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await result.current.protectFolder("folder-1", "new-folder-pw", files, "vault-pw", (p) =>
      progress.push({ done: p.done, total: p.total })
    );

    expect(state.get("file-1")).toEqual({ password: "new-folder-pw", cekTag: "CEK-1", salt: "salt(new-folder-pw)" });
    expect(state.get("file-2")).toEqual({ password: "new-folder-pw", cekTag: "CEK-2", salt: "salt(new-folder-pw)" });
    expect(setFolderPassword).toHaveBeenCalledTimes(1);
    expect(setFolderPassword).toHaveBeenCalledWith("folder-1", "new-pw-salt", "verifier(new-folder-pw)", [
      { file_id: "file-1", salt: "salt(new-folder-pw)", wrapped_cek: "wrapped:new-folder-pw:CEK-1" },
      { file_id: "file-2", salt: "salt(new-folder-pw)", wrapped_cek: "wrapped:new-folder-pw:CEK-2" },
    ]);
    expect(folderRegistryState.record).toHaveBeenCalledWith([
      expect.objectContaining({ id: "folder-1", pw_salt: "new-pw-salt", pw_verifier: "verifier(new-folder-pw)" }),
    ]);
    expect(folderPasswordState.set).toHaveBeenCalledWith("folder-1", "new-folder-pw");
    expect(progress).toEqual([
      { done: 0, total: 2 },
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });

  it("writes nothing if a later file fails mid-sweep, so no file is left half re-keyed", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "vault-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "vault-pw", cekTag: "CEK-2", salt: "s2" },
    });
    const realGetFileMeta = getFileMeta.getMockImplementation()!;
    getFileMeta.mockImplementation(async (id: string) => {
      if (id === "file-2") throw new Error("network error");
      return realGetFileMeta(id);
    });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await expect(result.current.protectFolder("folder-1", "new-folder-pw", files, "vault-pw")).rejects.toThrow(
      "network error"
    );

    expect(state.get("file-1")).toEqual({ password: "vault-pw", cekTag: "CEK-1", salt: "s1" });
    expect(setFolderPassword).not.toHaveBeenCalled();
    expect(folderRegistryState.record).not.toHaveBeenCalled();
    expect(folderPasswordState.set).not.toHaveBeenCalled();
  });

  it("leaves every file on the vault pass if the server rejects the protect", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "vault-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "vault-pw", cekTag: "CEK-2", salt: "s2" },
    });
    setFolderPassword.mockRejectedValueOnce(new Error("server rejected"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await expect(result.current.protectFolder("folder-1", "new-folder-pw", files, "vault-pw")).rejects.toThrow(
      "server rejected"
    );

    expect(state.get("file-1")).toEqual({ password: "vault-pw", cekTag: "CEK-1", salt: "s1" });
    expect(state.get("file-2")).toEqual({ password: "vault-pw", cekTag: "CEK-2", salt: "s2" });
    expect(folderRegistryState.record).not.toHaveBeenCalled();
    expect(folderPasswordState.set).not.toHaveBeenCalled();
  });
});

describe("unprotectFolder", () => {
  it("re-keys every file back to the vault pass with the removal in one call, and clears the cache", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "folder-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "folder-pw", cekTag: "CEK-2", salt: "s2" },
    });
    const progress: { done: number; total: number }[] = [];
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await result.current.unprotectFolder("folder-1", "folder-pw", files, "vault-pw", (p) =>
      progress.push({ done: p.done, total: p.total })
    );

    expect(state.get("file-1")).toEqual({ password: "vault-pw", cekTag: "CEK-1", salt: "salt(vault-pw)" });
    expect(state.get("file-2")).toEqual({ password: "vault-pw", cekTag: "CEK-2", salt: "salt(vault-pw)" });
    expect(removeFolderPassword).toHaveBeenCalledTimes(1);
    expect(removeFolderPassword).toHaveBeenCalledWith("folder-1", [
      { file_id: "file-1", salt: "salt(vault-pw)", wrapped_cek: "wrapped:vault-pw:CEK-1" },
      { file_id: "file-2", salt: "salt(vault-pw)", wrapped_cek: "wrapped:vault-pw:CEK-2" },
    ]);
    expect(folderRegistryState.record).toHaveBeenCalledWith([
      expect.objectContaining({ id: "folder-1", pw_salt: null, pw_verifier: null }),
    ]);
    expect(folderPasswordState.clear).toHaveBeenCalledWith("folder-1");
    expect(progress[0]).toEqual({ done: 0, total: 2 });
    expect(progress.at(-1)).toEqual({ done: 2, total: 2 });
  });

  it("writes nothing if a later file fails mid-sweep", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "folder-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "folder-pw", cekTag: "CEK-2", salt: "s2" },
    });
    const realGetFileMeta = getFileMeta.getMockImplementation()!;
    getFileMeta.mockImplementation(async (id: string) => {
      if (id === "file-2") throw new Error("network error");
      return realGetFileMeta(id);
    });
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await expect(result.current.unprotectFolder("folder-1", "folder-pw", files, "vault-pw")).rejects.toThrow(
      "network error"
    );

    expect(state.get("file-1")).toEqual({ password: "folder-pw", cekTag: "CEK-1", salt: "s1" });
    expect(removeFolderPassword).not.toHaveBeenCalled();
    expect(folderRegistryState.record).not.toHaveBeenCalled();
    expect(folderPasswordState.clear).not.toHaveBeenCalled();
  });

  it("keeps every file on the folder pass if the server rejects the removal", async () => {
    const files = [makeFile({ id: "file-1" }), makeFile({ id: "file-2" })];
    const state = makeFileServer({
      "file-1": { password: "folder-pw", cekTag: "CEK-1", salt: "s1" },
      "file-2": { password: "folder-pw", cekTag: "CEK-2", salt: "s2" },
    });
    removeFolderPassword.mockRejectedValueOnce(new Error("server rejected"));
    const { result } = renderHook(() => useFolderProtection(makeVault(vi.fn())));

    await expect(result.current.unprotectFolder("folder-1", "folder-pw", files, "vault-pw")).rejects.toThrow(
      "server rejected"
    );

    expect(state.get("file-1")).toEqual({ password: "folder-pw", cekTag: "CEK-1", salt: "s1" });
    expect(state.get("file-2")).toEqual({ password: "folder-pw", cekTag: "CEK-2", salt: "s2" });
    expect(folderRegistryState.record).not.toHaveBeenCalled();
    expect(folderPasswordState.clear).not.toHaveBeenCalled();
  });
});

describe("FolderUnlockCancelled", () => {
  it("carries a fixed name and message, never the password", () => {
    const err = new FolderUnlockCancelled();
    expect(err.name).toBe("FolderUnlockCancelled");
    expect(err.message).toBe("Folder unlock cancelled");
  });
});

describe("FolderPasswordRequired", () => {
  it("carries the folder id", () => {
    const err = new FolderPasswordRequired("f9");
    expect(err.folderId).toBe("f9");
    expect(err.name).toBe("FolderPasswordRequired");
  });
});

describe("resolveFilePasswordGlobal", () => {
  it("returns the vault passphrase for a file with no folder", async () => {
    getFilesData.mockReturnValue([makeFile({ id: "file-1", folder_id: null })]);
    passphraseState.getPassphrase.mockReturnValue("vault-pw");
    await expect(resolveFilePasswordGlobal("file-1")).resolves.toBe("vault-pw");
  });

  it("returns the vault passphrase for a file not found in the list (treated unprotected)", async () => {
    getFilesData.mockReturnValue([]);
    passphraseState.getPassphrase.mockReturnValue("vault-pw");
    await expect(resolveFilePasswordGlobal("missing")).resolves.toBe("vault-pw");
  });

  it("throws when the vault is locked for an unprotected file", async () => {
    getFilesData.mockReturnValue([makeFile({ id: "file-1", folder_id: null })]);
    passphraseState.getPassphrase.mockReturnValue(null);
    await expect(resolveFilePasswordGlobal("file-1")).rejects.toThrow("Vault is locked");
  });

  it("returns the cached folder password for a protected-folder file", async () => {
    getFilesData.mockReturnValue([makeFile({ id: "file-1", folder_id: "f1" })]);
    folderRegistryState.isProtected.mockReturnValue(true);
    folderPasswordState.get.mockReturnValue("folder-pw");
    await expect(resolveFilePasswordGlobal("file-1")).resolves.toBe("folder-pw");
  });

  it("throws FolderPasswordRequired when the protected folder's password isn't cached", async () => {
    getFilesData.mockReturnValue([makeFile({ id: "file-1", folder_id: "f1" })]);
    folderRegistryState.isProtected.mockReturnValue(true);
    folderPasswordState.get.mockReturnValue(null);
    await expect(resolveFilePasswordGlobal("file-1")).rejects.toBeInstanceOf(FolderPasswordRequired);

    try {
      await resolveFilePasswordGlobal("file-1");
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as FolderPasswordRequired).folderId).toBe("f1");
    }
  });
});
