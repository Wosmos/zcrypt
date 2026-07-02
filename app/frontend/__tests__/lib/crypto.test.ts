import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSalt,
  deriveKeyBytes,
  deriveKeyBytesCached,
  clearDerivedKeyCache,
  encryptChunk,
  decryptChunk,
  sha256Hex,
  sha256File,
  generateCEK,
  wrapKey,
  unwrapKey,
  resolveFileKey,
  IncorrectPassphraseError,
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

describe("generateCEK", () => {
  it("returns 32 random bytes", () => {
    const a = generateCEK();
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(generateCEK()).not.toEqual(a);
  });
});

describe("wrapKey / unwrapKey roundtrip", () => {
  it("unwraps back to the original CEK", async () => {
    const kek = await deriveKeyBytes("kek-pass", generateSalt());
    const cek = generateCEK();
    const wrapped = await wrapKey(kek, cek);
    expect(await unwrapKey(kek, wrapped)).toEqual(cek);
  });

  it("a different KEK cannot unwrap", async () => {
    const salt = generateSalt();
    const kek = await deriveKeyBytes("right", salt);
    const wrongKek = await deriveKeyBytes("wrong", salt);
    const wrapped = await wrapKey(kek, generateCEK());
    await expect(unwrapKey(wrongKek, wrapped)).rejects.toThrow();
  });
});

describe("resolveFileKey", () => {
  it("legacy file (no wrappedCek) returns the passphrase-derived key", async () => {
    const salt = generateSalt();
    const expected = await deriveKeyBytes("pass", salt);
    const key = await resolveFileKey("pass", salt, null);
    expect(new Uint8Array(key)).toEqual(new Uint8Array(expected));
  });

  it("undefined wrappedCek is also treated as legacy", async () => {
    const salt = generateSalt();
    const expected = await deriveKeyBytes("pass", salt);
    const key = await resolveFileKey("pass", salt);
    expect(new Uint8Array(key)).toEqual(new Uint8Array(expected));
  });

  it("envelope file (with wrappedCek) returns the unwrapped CEK", async () => {
    const salt = generateSalt();
    const kek = await deriveKeyBytes("pass", salt);
    const cek = generateCEK();
    const wrappedCek = toBase64(await wrapKey(kek, cek));

    const key = await resolveFileKey("pass", salt, wrappedCek);
    expect(new Uint8Array(key)).toEqual(cek);
  });

  it("envelope file with the WRONG passphrase throws IncorrectPassphraseError", async () => {
    const salt = generateSalt();
    const kek = await deriveKeyBytes("right-pass", salt);
    const cek = generateCEK();
    const wrappedCek = toBase64(await wrapKey(kek, cek));

    // A wrong passphrase derives a different KEK, so unwrapping the CEK fails
    // AES-GCM auth and resolveFileKey re-throws the typed error.
    await expect(
      resolveFileKey("wrong-pass", salt, wrappedCek)
    ).rejects.toBeInstanceOf(IncorrectPassphraseError);
  });
});

describe("sha256File", () => {
  it("hashes a small file via the fast path (matches sha256Hex)", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    // File-like stub: the fast path only reads file.size and file.arrayBuffer().
    const smallFile = {
      size: data.length,
      arrayBuffer: async () => data.buffer,
    } as unknown as File;
    expect(await sha256File(smallFile)).toBe(await sha256Hex(data));
  });

  it("hashes a large file via the streaming path", async () => {
    // Reports just over the 50MB fast-path threshold so the streaming branch
    // runs, but each slice yields only a few bytes so hashing is instant. The
    // resulting digest is arbitrary — we only assert it produced a valid hash.
    const bigFile = {
      size: 51 * 1024 * 1024,
      slice: () => ({ arrayBuffer: async () => new Uint8Array(8).buffer }),
    } as unknown as File;
    expect(await sha256File(bigFile)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deriveKeyBytesCached (derived-key memo)", () => {
  // A distinct, deterministic 32-byte salt per index (so distinct cache keys).
  function saltOf(i: number): Uint8Array {
    const s = new Uint8Array(32);
    s[0] = i & 0xff;
    s[1] = (i >> 8) & 0xff;
    s[2] = (i >> 16) & 0xff;
    return s;
  }

  // Real PBKDF2 at 600k iterations is ~77ms/call; filling the 256-entry cap to
  // exercise eviction would take ~20s. The memo logic under test is independent
  // of the KDF, so stub deriveBits with a fast, unique-per-call result and assert
  // on the deriveBits CALL COUNT to prove hits (no call) vs misses (a call).
  let deriveSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    clearDerivedKeyCache();
    let n = 0;
    deriveSpy = vi
      .spyOn(crypto.subtle, "deriveBits")
      .mockImplementation(async () => {
        const buf = new Uint8Array(32);
        buf[0] = n & 0xff;
        buf[1] = (n >> 8) & 0xff;
        n++;
        return buf.buffer;
      });
  });
  afterEach(() => {
    deriveSpy.mockRestore();
    clearDerivedKeyCache();
  });

  it("derives once then serves the cached bytes on a repeat (same salt+passphrase)", async () => {
    const salt = saltOf(1);
    const a = await deriveKeyBytesCached("pw", salt);
    const b = await deriveKeyBytesCached("pw", salt);
    // Second call was a cache hit — no second derivation.
    expect(deriveSpy).toHaveBeenCalledTimes(1);
    // Same bytes, but a FRESH buffer each time so a caller that transfers the
    // buffer to a worker can never corrupt the cached copy.
    expect(new Uint8Array(b)).toEqual(new Uint8Array(a));
    expect(b).not.toBe(a);
  });

  it("treats distinct salts (and distinct passphrases) as separate cache entries", async () => {
    await deriveKeyBytesCached("pw", saltOf(1));
    await deriveKeyBytesCached("pw", saltOf(2)); // different salt → miss
    await deriveKeyBytesCached("other", saltOf(1)); // different passphrase → miss
    expect(deriveSpy).toHaveBeenCalledTimes(3);
  });

  it("clearDerivedKeyCache forces the next call to re-derive", async () => {
    const salt = saltOf(1);
    await deriveKeyBytesCached("pw", salt);
    await deriveKeyBytesCached("pw", salt); // hit
    expect(deriveSpy).toHaveBeenCalledTimes(1);
    clearDerivedKeyCache();
    await deriveKeyBytesCached("pw", salt); // miss again
    expect(deriveSpy).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry once the cache is full (insertion-order LRU)", async () => {
    const MAX = 256; // mirrors DERIVED_KEY_CACHE_MAX
    for (let i = 0; i < MAX; i++) await deriveKeyBytesCached("pw", saltOf(i));
    expect(deriveSpy).toHaveBeenCalledTimes(MAX); // all misses

    // The oldest entry (index 0) is still cached — a hit, no new derivation.
    await deriveKeyBytesCached("pw", saltOf(0));
    expect(deriveSpy).toHaveBeenCalledTimes(MAX);

    // Adding a fresh 257th entry trips the cap and evicts the oldest (index 0).
    await deriveKeyBytesCached("pw", saltOf(9999));
    expect(deriveSpy).toHaveBeenCalledTimes(MAX + 1);

    // Index 0 was evicted, so requesting it again is now a miss (re-derives).
    await deriveKeyBytesCached("pw", saltOf(0));
    expect(deriveSpy).toHaveBeenCalledTimes(MAX + 2);
  });
});
