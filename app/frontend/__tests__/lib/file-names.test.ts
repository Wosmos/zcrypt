import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FileMetadata } from "@/types";
import { deriveNameKey, encryptName, encryptStyle } from "@/lib/name-crypto";

// Control the passphrase + user the transform reads. Hoisted so vi.mock can use them.
const { getPassphrase, getUser } = vi.hoisted(() => ({
  getPassphrase: vi.fn<() => string | null>(),
  getUser: vi.fn<() => { id: string } | null>(),
}));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: {
    getState: () => ({
      getPassphrase,
      get cachedPassphrase() {
        return getPassphrase();
      },
    }),
  },
}));
const { setFileName } = vi.hoisted(() => ({
  setFileName: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock("@/lib/api", () => ({ setFileName }));
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ user: getUser() }) },
}));

import {
  decryptFileNames,
  ensureNames,
  ensureFileNames,
  resolveFileNames,
  subscribeNames,
  getNamesEpoch,
  peekName,
  peekStyle,
  clearNames,
} from "@/lib/file-names";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { userNameKey } from "@/lib/sealed";

function file(over: Partial<FileMetadata>): FileMetadata {
  return {
    id: "f", original_name: "", original_size: 1, compressed_size: 1, encrypted_size: 1,
    chunk_count: 1, sha256: "x", created_at: "2026-01-01", ...over,
  } as FileMetadata;
}

const USER = { id: "user-1" };
const PASS = "vault-pass";

beforeEach(() => {
  getUser.mockReturnValue(USER);
  getPassphrase.mockReturnValue(PASS);
  clearNames();
});

describe("decryptFileNames (zero-knowledge name dual-read)", () => {
  it("decrypts encrypted_name into original_name when unlocked", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("Quarterly Report.pdf", key);
    const [out] = await decryptFileNames([file({ id: "1", encrypted_name: enc })]);
    expect(out.original_name).toBe("Quarterly Report.pdf");
  });

  it("shows [locked] for encrypted files when the vault is locked", async () => {
    getPassphrase.mockReturnValue(null);
    const [out] = await decryptFileNames([file({ id: "1", encrypted_name: "some-ciphertext" })]);
    expect(out.original_name).toBe("[locked]");
  });

  it("passes legacy plaintext-name files through untouched", async () => {
    const legacy = file({ id: "1", original_name: "old.txt", encrypted_name: "" });
    const [out] = await decryptFileNames([legacy]);
    expect(out.original_name).toBe("old.txt");
  });

  it("all-legacy list is returned as-is (fast path, no key derivation)", async () => {
    getPassphrase.mockReturnValue(null); // would fail to derive a key if it tried
    const list = [file({ id: "1", original_name: "a", encrypted_name: "" })];
    const out = await decryptFileNames(list);
    expect(out).toBe(list); // same reference, no work done
  });

  it("re-seals each legacy name once while unlocked, without changing what's displayed", async () => {
    getPassphrase.mockReturnValue(PASS);
    setFileName.mockClear();
    const list = [
      file({ id: "1", original_name: "a.txt", encrypted_name: "" }),
      file({ id: "2", original_name: "b.txt", encrypted_name: "" }),
    ];
    const out = await decryptFileNames(list);
    expect(out).toBe(list); // display untouched
    await vi.waitFor(() => expect(setFileName).toHaveBeenCalledTimes(2));
    // Look the call up by id rather than taking calls[0]: the two re-seals are
    // issued concurrently, so whichever key derivation finishes first lands
    // first. Indexing by position made this test fail roughly one run in four.
    const calls = setFileName.mock.calls as unknown as [string, string][];
    const sealed = calls.find(([id]) => id === "1")?.[1];
    expect(calls.map(([id]) => id).sort()).toEqual(["1", "2"]);
    expect(sealed).toBeDefined();
    expect(sealed).not.toBe("a.txt");
    expect(sealed!.length).toBeGreaterThan(20); // base64 [iv || ct+tag]
    await decryptFileNames(list); // second listing: already queued → no duplicate PATCH
    expect(setFileName).toHaveBeenCalledTimes(2);
  });

  it("a failed re-seal is retried on the next listing (id released from the queue)", async () => {
    getPassphrase.mockReturnValue(PASS);
    setFileName.mockClear();
    setFileName.mockRejectedValueOnce(new Error("offline"));
    const list = [file({ id: "retry-1", original_name: "c.txt", encrypted_name: "" })];
    await decryptFileNames(list);
    await vi.waitFor(() => expect(setFileName).toHaveBeenCalledTimes(1));
    await decryptFileNames(list); // first attempt failed → not stuck in the dedupe set
    await vi.waitFor(() => expect(setFileName).toHaveBeenCalledTimes(2));
  });

  it("never re-seals while locked, nor a legacy row that has no name", async () => {
    setFileName.mockClear();
    getPassphrase.mockReturnValue(null); // locked
    await decryptFileNames([file({ id: "lk", original_name: "x.txt", encrypted_name: "" })]);
    getPassphrase.mockReturnValue(PASS); // unlocked, but nothing to seal
    await decryptFileNames([file({ id: "empty", original_name: "", encrypted_name: "" })]);
    expect(setFileName).not.toHaveBeenCalled();
  });

  it("in a mixed list, skips re-sealing a legacy row that has no name", async () => {
    getPassphrase.mockReturnValue(PASS);
    setFileName.mockClear();
    const key = await deriveNameKey(PASS, USER.id);
    await decryptFileNames([
      file({ id: "enc", original_name: "", encrypted_name: await encryptName("real.txt", key) }),
      file({ id: "nameless", original_name: "", encrypted_name: "" }),
    ]);
    expect(setFileName).not.toHaveBeenCalled();
  });

  it("mixed list: encrypted decrypts, legacy untouched", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("secret.zip", key);
    const out = await decryptFileNames([
      file({ id: "1", encrypted_name: enc }),
      file({ id: "2", original_name: "public.txt", encrypted_name: "" }),
    ]);
    expect(out[0].original_name).toBe("secret.zip");
    expect(out[1].original_name).toBe("public.txt");
  });

  it("keeps the plaintext original_name for a file with only an encrypted_style (no encrypted_name)", async () => {
    // Exercises the `f.encrypted_name ? … : f.original_name` false branch: the
    // file is not name-encrypted but does carry a custom style to decrypt.
    const key = await deriveNameKey(PASS, USER.id);
    const encStyle = await encryptStyle({ icon: "star", color: "#abcdef" }, key);
    const [out] = await decryptFileNames([
      file({ id: "1", original_name: "keep.txt", encrypted_name: "", encrypted_style: encStyle }),
    ]);
    expect(out.original_name).toBe("keep.txt");
    expect(out.style).toEqual({ icon: "star", color: "#abcdef" });
  });

  it("a wrong-key / corrupt ciphertext degrades to a safe placeholder, not a throw", async () => {
    // decryptNameSafe swallows the AES-GCM failure; the list must still resolve.
    const [out] = await decryptFileNames([file({ id: "1", encrypted_name: "bm90LXZhbGlkLWNpcGhlcnRleHQ=" })]);
    expect(typeof out.original_name).toBe("string");
  });
});

describe("name maps (sync resolve over a raw ciphertext list)", () => {
  it("resolves from the maps once ensured, and notifies subscribers", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("a.pdf", key);
    const encStyle = await encryptStyle({ icon: "star", color: "#123456" }, key);
    const raw = [file({ id: "1", encrypted_name: enc, encrypted_style: encStyle })];
    const cb = vi.fn();
    const unsub = subscribeNames(cb);
    const before = getNamesEpoch();

    // Pending while unlocked: the row's own (empty) original_name, no plaintext yet.
    expect(resolveFileNames(raw)[0].original_name).toBe("");

    await ensureFileNames(raw);
    expect(cb).toHaveBeenCalled();
    expect(getNamesEpoch()).toBeGreaterThan(before);
    expect(peekName(enc)).toBe("a.pdf");
    const [out] = resolveFileNames(raw, true, getNamesEpoch());
    expect(out.original_name).toBe("a.pdf");
    expect(out.style).toEqual({ icon: "star", color: "#123456" });

    // Locked: names and styles are withheld even though the maps are warm.
    const [locked] = resolveFileNames(raw, false);
    expect(locked.original_name).toBe("[locked]");
    expect(locked.style).toBeNull();

    unsub();
    cb.mockClear();
    clearNames();
    expect(cb).not.toHaveBeenCalled();
  });

  it("shows an optimistic row's own plaintext until its ciphertext resolves", () => {
    const [out] = resolveFileNames(
      [file({ id: "1", original_name: "just-uploaded.txt", encrypted_name: "ct" })],
      true,
    );
    expect(out.original_name).toBe("just-uploaded.txt");
  });

  it("peekStyle is null for no ciphertext or an unknown one", () => {
    expect(peekStyle(undefined)).toBeNull();
    expect(peekStyle("unknown")).toBeNull();
  });

  it("clearDecryptCache (lock / logout) drops every resolved name", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("gone.txt", key);
    await ensureNames([enc]);
    expect(peekName(enc)).toBe("gone.txt");
    clearDecryptCache();
    expect(peekName(enc)).toBeUndefined();
  });

  it("does nothing while locked, and skips empty or already-known ciphertexts", async () => {
    getPassphrase.mockReturnValue(null);
    const before = getNamesEpoch();
    await ensureNames(["some-ct"], ["some-style"]);
    expect(peekName("some-ct")).toBeUndefined();
    await ensureNames([null, undefined, ""]);
    expect(getNamesEpoch()).toBe(before);
  });

  it("dedupes a ciphertext already in flight", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("once.txt", key);
    const encStyle = await encryptStyle({ icon: "x", color: "#000000" }, key);
    const before = getNamesEpoch();
    await Promise.all([ensureNames([enc], [encStyle]), ensureNames([enc], [encStyle])]);
    expect(peekName(enc)).toBe("once.txt");
    expect(getNamesEpoch()).toBe(before + 1);
  });

  it("never repopulates the maps when the vault locks mid-decrypt", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("race.txt", key);
    const pending = ensureNames([enc]);
    clearNames(); // lock lands while the key/decrypt is in flight
    await pending;
    expect(peekName(enc)).toBeUndefined();
  });

  it("never repopulates when the lock lands after the key but before the decrypt finishes", async () => {
    const key = await deriveNameKey(PASS, USER.id);
    const enc = await encryptName("late.txt", key);
    await userNameKey(); // warm the memo so the key resolves immediately
    const pending = ensureNames([enc]);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    clearNames();
    await pending;
    expect(peekName(enc)).toBeUndefined();
  });

  it("ensureFileNames on an empty list is a no-op", async () => {
    await expect(ensureFileNames([])).resolves.toBeUndefined();
  });
});
