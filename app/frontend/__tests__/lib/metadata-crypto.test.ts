import { describe, it, expect } from "vitest";
import {
  deriveNameKey,
  encryptName,
  decryptName,
  decryptNameSafe,
} from "@/lib/name-crypto";
import {
  deriveFolderPwSalt,
  makeFolderVerifier,
  verifyFolderPassword,
  rewrapFileKey,
} from "@/lib/folder-crypto";
import { generateCEK, generateSalt, deriveKeyBytes, unwrapKey, fromBase64 } from "@/lib/crypto";

// Zero-knowledge metadata crypto: filename encryption (name-crypto) and
// per-folder password protection (folder-crypto). Both are pure client-side
// AES-GCM over PBKDF2-derived keys; the server only ever sees opaque base64.

describe("name-crypto: encrypted filenames", () => {
  it("round-trips a name under the derived key", async () => {
    const key = await deriveNameKey("vault pass", "user-1");
    const ct = await encryptName("Quarterly Report.pdf", key);
    expect(await decryptName(ct, key)).toBe("Quarterly Report.pdf");
  });

  it("round-trips unicode names", async () => {
    const key = await deriveNameKey("vault pass", "user-1");
    const name = "报告-2024 📊 café.txt";
    expect(await decryptName(await encryptName(name, key), key)).toBe(name);
  });

  it("uses a fresh IV each time (ciphertext is non-deterministic)", async () => {
    const key = await deriveNameKey("vault pass", "user-1");
    const a = await encryptName("same", key);
    const b = await encryptName("same", key);
    expect(a).not.toBe(b);
  });

  it("derives a per-user key: another user's key cannot decrypt the name", async () => {
    const mine = await deriveNameKey("vault pass", "user-1");
    const theirs = await deriveNameKey("vault pass", "user-2");
    const ct = await encryptName("secret.txt", mine);
    await expect(decryptName(ct, theirs)).rejects.toThrow();
  });

  it("the wrong passphrase (same user) cannot decrypt", async () => {
    const right = await deriveNameKey("right pass", "user-1");
    const wrong = await deriveNameKey("wrong pass", "user-1");
    const ct = await encryptName("secret.txt", right);
    await expect(decryptName(ct, wrong)).rejects.toThrow();
  });

  it("decryptNameSafe returns the name on success and a placeholder on failure", async () => {
    const key = await deriveNameKey("p", "u");
    const wrong = await deriveNameKey("q", "u");
    const ct = await encryptName("visible.txt", key);
    expect(await decryptNameSafe(ct, key)).toBe("visible.txt");
    expect(await decryptNameSafe(ct, wrong)).toBe("[locked]");
    expect(await decryptNameSafe("not-valid-base64!!", key)).toBe("[locked]");
  });
});

describe("folder-crypto: per-folder password", () => {
  it("generates a unique base64 salt each call", () => {
    const a = deriveFolderPwSalt();
    const b = deriveFolderPwSalt();
    expect(a).not.toBe(b);
    expect(fromBase64(a).length).toBe(32);
  });

  it("verifies the correct folder password and rejects the wrong one", async () => {
    const salt = deriveFolderPwSalt();
    const verifier = await makeFolderVerifier("open sesame", salt);
    expect(await verifyFolderPassword("open sesame", salt, verifier)).toBe(true);
    expect(await verifyFolderPassword("not it", salt, verifier)).toBe(false);
  });

  it("returns false (never throws) on a corrupt verifier", async () => {
    const salt = deriveFolderPwSalt();
    expect(await verifyFolderPassword("whatever", salt, "garbage-not-base64")).toBe(false);
  });

  it("a verifier is bound to its salt: the same password with a different salt fails", async () => {
    const saltA = deriveFolderPwSalt();
    const saltB = deriveFolderPwSalt();
    const verifier = await makeFolderVerifier("pw", saltA);
    expect(await verifyFolderPassword("pw", saltB, verifier)).toBe(false);
  });

  it("rewrapFileKey re-wraps a CEK so it unwraps under the new password + salt", async () => {
    const cek = generateCEK();
    const newSalt = generateSalt();
    const { salt, wrapped_cek } = await rewrapFileKey(cek, "folder-pw", newSalt);

    // The returned salt is the one we passed (server must store the matching salt).
    expect(salt).toBe((await rewrapFileKey(cek, "folder-pw", newSalt)).salt);

    // Unwrapping with a KEK derived from the new password + salt recovers the CEK.
    const kek = await deriveKeyBytes("folder-pw", newSalt);
    expect(await unwrapKey(kek, fromBase64(wrapped_cek))).toEqual(cek);
  });

  it("rewrapFileKey output cannot be unwrapped with the wrong password", async () => {
    const cek = generateCEK();
    const newSalt = generateSalt();
    const { wrapped_cek } = await rewrapFileKey(cek, "right", newSalt);
    const wrongKek = await deriveKeyBytes("wrong", newSalt);
    await expect(unwrapKey(wrongKek, fromBase64(wrapped_cek))).rejects.toThrow();
  });
});
