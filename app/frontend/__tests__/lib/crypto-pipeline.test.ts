/**
 * Tests the encrypt → hash → decrypt pipeline that the crypto-worker performs.
 * The actual worker uses WASM zstd (not available in vitest), so we test
 * the crypto + hash portion which is the data-loss-critical path.
 */
import { describe, it, expect } from "vitest";
import {
  generateSalt,
  deriveKeyBytes,
  encryptChunk,
  decryptChunk,
  sha256Hex,
} from "@/lib/crypto";

describe("multi-chunk pipeline simulation", () => {
  it("splits, encrypts, and reassembles correctly", async () => {
    // Simulate a 30-byte "file" split into 3 chunks of 10 bytes
    const fileData = new Uint8Array(30);
    for (let i = 0; i < 30; i++) fileData[i] = i;

    const salt = generateSalt();
    const key = await deriveKeyBytes("test-passphrase", salt);
    const chunkSize = 10;

    // Encrypt each chunk (simulating what the worker does)
    const encryptedChunks: Uint8Array[] = [];
    const chunkHashes: string[] = [];

    for (let i = 0; i < 3; i++) {
      const chunk = fileData.slice(i * chunkSize, (i + 1) * chunkSize);
      const encrypted = await encryptChunk(key, chunk);
      const hash = await sha256Hex(encrypted);

      encryptedChunks.push(encrypted);
      chunkHashes.push(hash);
    }

    // Verify each chunk has unique hash (different IVs)
    const uniqueHashes = new Set(chunkHashes);
    expect(uniqueHashes.size).toBe(3);

    // Decrypt and reassemble
    const decryptedChunks: Uint8Array[] = [];
    for (const encrypted of encryptedChunks) {
      const decrypted = await decryptChunk(key, encrypted);
      decryptedChunks.push(decrypted);
    }

    // Reassemble
    const reassembled = new Uint8Array(30);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      reassembled.set(chunk, offset);
      offset += chunk.length;
    }

    expect(reassembled).toEqual(fileData);
  });

  it("hash of encrypted chunk is stable (same encrypted data = same hash)", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const encrypted = await encryptChunk(key, data);
    const hash1 = await sha256Hex(encrypted);
    const hash2 = await sha256Hex(encrypted);

    expect(hash1).toBe(hash2);
  });

  it("detects wrong chunk order on reassembly", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);

    // Two different chunks
    const chunk0 = new Uint8Array([10, 20, 30]);
    const chunk1 = new Uint8Array([40, 50, 60]);

    const enc0 = await encryptChunk(key, chunk0);
    const enc1 = await encryptChunk(key, chunk1);

    // Decrypt in wrong order
    const dec0 = await decryptChunk(key, enc1); // swapped!
    const dec1 = await decryptChunk(key, enc0); // swapped!

    // Reassembled data is wrong
    const wrongOrder = new Uint8Array([...dec0, ...dec1]);
    const correctOrder = new Uint8Array([10, 20, 30, 40, 50, 60]);

    expect(wrongOrder).not.toEqual(correctOrder);
  });

  it("encrypted chunk size = plaintext + 28 bytes overhead per chunk", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);

    const sizes = [0, 1, 100, 1000, 10000];
    for (const size of sizes) {
      const data = new Uint8Array(size);
      const encrypted = await encryptChunk(key, data);
      // 12 bytes IV + plaintext + 16 bytes GCM tag = plaintext + 28
      expect(encrypted.length).toBe(size + 28);
    }
  });

  it("handles 1MB chunk size", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);

    const chunk = new Uint8Array(1 * 1024 * 1024);
    for (let i = 0; i < chunk.length; i++) chunk[i] = i % 256;

    const encrypted = await encryptChunk(key, chunk);
    expect(encrypted.length).toBe(chunk.length + 28);

    const decrypted = await decryptChunk(key, encrypted);
    expect(decrypted).toEqual(chunk);
  }, 15000);

  it("sha256 integrity check catches single-bit corruption", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("test", salt);
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const encrypted = await encryptChunk(key, data);
    const originalHash = await sha256Hex(encrypted);

    // Corrupt one bit
    const corrupted = new Uint8Array(encrypted);
    corrupted[20] ^= 0x01; // flip one bit

    const corruptedHash = await sha256Hex(corrupted);
    expect(corruptedHash).not.toBe(originalHash);
  });
});

describe("key derivation edge cases", () => {
  it("handles empty passphrase", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("", salt);
    expect(key.byteLength).toBe(32);
  });

  it("handles unicode passphrase", async () => {
    const salt = generateSalt();
    const key = await deriveKeyBytes("密码🔑пароль", salt);
    expect(key.byteLength).toBe(32);

    // Roundtrip with unicode passphrase
    const data = new Uint8Array([1, 2, 3]);
    const encrypted = await encryptChunk(key, data);
    const decrypted = await decryptChunk(key, encrypted);
    expect(decrypted).toEqual(data);
  });

  it("handles very long passphrase", async () => {
    const salt = generateSalt();
    const longPass = "a".repeat(10000);
    const key = await deriveKeyBytes(longPass, salt);
    expect(key.byteLength).toBe(32);
  });
});
