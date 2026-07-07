import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FileMetadata } from "@/types";
import { deriveNameKey, encryptName } from "@/lib/name-crypto";

// Control the passphrase + user the transform reads. Hoisted so vi.mock can use them.
const { getPassphrase, getUser } = vi.hoisted(() => ({
  getPassphrase: vi.fn<() => string | null>(),
  getUser: vi.fn<() => { id: string } | null>(),
}));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: { getState: () => ({ getPassphrase }) },
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ user: getUser() }) },
}));

import { decryptFileNames } from "@/lib/file-names";

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
    expect(out).toBe(list); // same reference — no work done
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

  it("a wrong-key / corrupt ciphertext degrades to a safe placeholder, not a throw", async () => {
    // decryptNameSafe swallows the AES-GCM failure; the list must still resolve.
    const [out] = await decryptFileNames([file({ id: "1", encrypted_name: "bm90LXZhbGlkLWNpcGhlcnRleHQ=" })]);
    expect(typeof out.original_name).toBe("string");
  });
});
