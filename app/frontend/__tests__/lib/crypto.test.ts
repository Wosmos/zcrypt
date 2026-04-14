import { describe, it, expect } from "vitest";
import {
  generateSalt,
  deriveKeyBytes,
  encryptChunk,
  decryptChunk,
  sha256Hex,
  toBase64,
  fromBase64,
} from "@/lib/crypto";

describe("generateSalt", () => {
  it("returns 32 bytes", () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(32);
  });

  it("returns unique values", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).not.toEqual(b);
  });
});

describe("deriveKeyBytes", () => {
  it("returns 32-byte key (256 bits)", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test-passphrase", salt);
    expect(key.byteLength).toBe(32);
  });

  it("same passphrase + salt = same key (deterministic)", async () => {
    const salt = generateSalt();
    const key1 = await deriveKeyBytes("my-passphrase", salt);
    const key2 = await deriveKeyBytes("my-passphrase", salt);
    expect(new Uint8Array(key1)).toEqual(new Uint8Array(key2));
  });

  it("different passphrase = different key", async () => {
    const salt = generateSalt();
    const key1 = await deriveKeyBytes("passphrase-a", salt);
    const key2 = await deriveKeyBytes("passphrase-b", salt);
    expect(new Uint8Array(key1)).not.toEqual(new Uint8Array(key2));
  });

  it("different salt = different key", async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = await deriveKeyBytes("same-passphrase", salt1);
    const key2 = await deriveKeyBytes("same-passphrase", salt2);
    expect(new Uint8Array(key1)).not.toEqual(new Uint8Array(key2));
  });
});

describe("encryptChunk / decryptChunk roundtrip", () => {
  it("decrypts back to original plaintext", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test-passphrase", salt);
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const encrypted = await encryptChunk(key, original);
    const decrypted = await decryptChunk(key, encrypted);

    expect(decrypted).toEqual(original);
  });

  it("encrypted output has correct format: 12B IV + ciphertext + 16B tag", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const plaintext = new Uint8Array([1, 2, 3]);

    const encrypted = await encryptChunk(key, plaintext);

    // Minimum size: 12 (IV) + 3 (data) + 16 (tag) = 31
    expect(encrypted.length).toBe(12 + 3 + 16);
  });

  it("encrypted output differs each time (random IV)", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const plaintext = new Uint8Array([1, 2, 3]);

    const a = await encryptChunk(key, plaintext);
    const b = await encryptChunk(key, plaintext);

    // Same plaintext + same key but different IVs → different ciphertext
    expect(a).not.toEqual(b);

    // But both decrypt to same plaintext
    expect(await decryptChunk(key, a)).toEqual(plaintext);
    expect(await decryptChunk(key, b)).toEqual(plaintext);
  });

  it("wrong passphrase fails to decrypt", async () => {
    const salt = generateSalt();
    const rightKey = await deriveKeyBytes("right-passphrase", salt);
    const wrongKey = await deriveKeyBytes("wrong-passphrase", salt);
    const plaintext = new Uint8Array([10, 20, 30, 40, 50]);

    const encrypted = await encryptChunk(rightKey, plaintext);

    await expect(decryptChunk(wrongKey, encrypted)).rejects.toThrow();
  });

  it("tampered ciphertext fails to decrypt", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const encrypted = await encryptChunk(key, new Uint8Array([1, 2, 3]));

    // Flip a byte in the ciphertext (after IV, before tag)
    const tampered = new Uint8Array(encrypted);
    tampered[15] ^= 0xff;

    await expect(decryptChunk(key, tampered)).rejects.toThrow();
  });

  it("handles empty plaintext", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const empty = new Uint8Array(0);

    const encrypted = await encryptChunk(key, empty);
    const decrypted = await decryptChunk(key, encrypted);

    expect(decrypted).toEqual(empty);
    // 12 IV + 0 data + 16 tag = 28
    expect(encrypted.length).toBe(28);
  });

  it("handles large chunk (1MB)", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const large = new Uint8Array(1024 * 1024);
    // Fill with pattern
    for (let i = 0; i < large.length; i++) large[i] = i % 256;

    const encrypted = await encryptChunk(key, large);
    const decrypted = await decryptChunk(key, encrypted);

    expect(decrypted).toEqual(large);
  });
});

describe("sha256Hex", () => {
  it("returns 64-char hex string", async () => {
    const hash = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same input = same hash", async () => {
    const data = new Uint8Array([10, 20, 30]);
    const a = await sha256Hex(data);
    const b = await sha256Hex(data);
    expect(a).toBe(b);
  });

  it("different input = different hash", async () => {
    const a = await sha256Hex(new Uint8Array([1]));
    const b = await sha256Hex(new Uint8Array([2]));
    expect(a).not.toBe(b);
  });

  it("matches known SHA-256 for empty input", async () => {
    const hash = await sha256Hex(new Uint8Array(0));
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("toBase64 / fromBase64", () => {
  it("roundtrips correctly", () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(original);
  });

  it("handles empty array", () => {
    const encoded = toBase64(new Uint8Array(0));
    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(new Uint8Array(0));
  });

  it("produces valid base64 string", () => {
    const encoded = toBase64(new Uint8Array([72, 101, 108, 108, 111]));
    expect(encoded).toBe("SGVsbG8="); // "Hello" in base64
  });
});
