import { describe, it, expect } from "vitest";
import {
  deriveNameKey,
  encryptName,
  decryptName,
  decryptNameSafe,
  encryptStyle,
  decryptStyle,
} from "@/lib/name-crypto";

describe("deriveNameKey", () => {
  it("derives a usable AES-GCM CryptoKey from a passphrase + userId", async () => {
    const key = await deriveNameKey("vault-pass", "user-1");
    expect(key.algorithm.name).toBe("AES-GCM");
    // Round trip proves the key actually works for encrypt/decrypt.
    const enc = await encryptName("hello", key);
    expect(await decryptName(enc, key)).toBe("hello");
  });

  it("derives different keys for different users (per-user salt)", async () => {
    const keyA = await deriveNameKey("same-pass", "user-a");
    const keyB = await deriveNameKey("same-pass", "user-b");
    const enc = await encryptName("secret", keyA);
    await expect(decryptName(enc, keyB)).rejects.toThrow();
  });
});

describe("encryptName / decryptName", () => {
  it("round-trips a name through encrypt then decrypt", async () => {
    const key = await deriveNameKey("pw", "u1");
    const enc = await encryptName("My Documents", key);
    expect(await decryptName(enc, key)).toBe("My Documents");
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const key = await deriveNameKey("pw", "u1");
    const a = await encryptName("same name", key);
    const b = await encryptName("same name", key);
    expect(a).not.toBe(b);
  });

  it("decryptName throws on a wrong key", async () => {
    const key = await deriveNameKey("pw-a", "u1");
    const otherKey = await deriveNameKey("pw-b", "u1");
    const enc = await encryptName("secret", key);
    await expect(decryptName(enc, otherKey)).rejects.toThrow();
  });

  it("decryptName throws on corrupted/non-base64 input", async () => {
    const key = await deriveNameKey("pw", "u1");
    await expect(decryptName("not-valid-base64!!", key)).rejects.toThrow();
  });
});

describe("decryptNameSafe", () => {
  it("returns the decrypted name on success", async () => {
    const key = await deriveNameKey("pw", "u1");
    const enc = await encryptName("Folder A", key);
    expect(await decryptNameSafe(enc, key)).toBe("Folder A");
  });

  it("returns [locked] instead of throwing on a wrong key", async () => {
    const key = await deriveNameKey("pw-a", "u1");
    const otherKey = await deriveNameKey("pw-b", "u1");
    const enc = await encryptName("secret", key);
    expect(await decryptNameSafe(enc, otherKey)).toBe("[locked]");
  });

  it("returns [locked] instead of throwing on corrupted input", async () => {
    const key = await deriveNameKey("pw", "u1");
    expect(await decryptNameSafe("garbage!!", key)).toBe("[locked]");
  });
});

describe("encryptStyle / decryptStyle", () => {
  it("round-trips a CustomStyle object", async () => {
    const key = await deriveNameKey("pw", "u1");
    const style = { icon: "star", color: "#ff0000" };
    const enc = await encryptStyle(style, key);
    expect(await decryptStyle(enc, key)).toEqual(style);
  });

  it("returns null for null input", async () => {
    const key = await deriveNameKey("pw", "u1");
    expect(await decryptStyle(null, key)).toBeNull();
  });

  it("returns null for undefined input", async () => {
    const key = await deriveNameKey("pw", "u1");
    expect(await decryptStyle(undefined, key)).toBeNull();
  });

  it("returns null for empty-string input", async () => {
    const key = await deriveNameKey("pw", "u1");
    expect(await decryptStyle("", key)).toBeNull();
  });

  it("returns null when the decrypted payload parses to null", async () => {
    const key = await deriveNameKey("pw", "u1");
    const enc = await encryptName(JSON.stringify(null), key);
    expect(await decryptStyle(enc, key)).toBeNull();
  });

  it("returns null when the decrypted payload is not an object", async () => {
    const key = await deriveNameKey("pw", "u1");
    const enc = await encryptName(JSON.stringify(42), key);
    expect(await decryptStyle(enc, key)).toBeNull();
  });

  it("returns null on decrypt failure (wrong key)", async () => {
    const key = await deriveNameKey("pw-a", "u1");
    const otherKey = await deriveNameKey("pw-b", "u1");
    const enc = await encryptStyle({ icon: "star" }, key);
    expect(await decryptStyle(enc, otherKey)).toBeNull();
  });

  it("returns null on corrupted/non-base64 input", async () => {
    const key = await deriveNameKey("pw", "u1");
    expect(await decryptStyle("not-valid-base64!!", key)).toBeNull();
  });
});
