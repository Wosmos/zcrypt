/**
 * Web Worker for client-side compress -> encrypt -> hash pipeline.
 *
 * Input:  { chunkIndex, plaintext: ArrayBuffer, keyBytes: ArrayBuffer, compress: boolean }
 * Output: { chunkIndex, encrypted: ArrayBuffer, sha256: string, compressed: boolean,
 *           originalSize: number, compressedSize: number, encryptedSize: number }
 */

// Use the WASM-only build for modern browsers (smaller bundle)
import { ZstdInit } from "@oneidentity/zstd-js/wasm";

let zstd: Awaited<ReturnType<typeof ZstdInit>> | null = null;

// Initialize WASM on worker start
const initPromise = ZstdInit().then((codec) => {
  zstd = codec;
});

export interface WorkerInput {
  mode?: "encrypt";
  chunkIndex: number;
  plaintext: ArrayBuffer;
  keyBytes: ArrayBuffer;
  compress: boolean;
  compressionLevel?: number; // zstd level 1-3 (default 3)
}

export interface WorkerOutput {
  chunkIndex: number;
  encrypted: ArrayBuffer;
  sha256: string;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  encryptedSize: number;
}

// Download direction: decrypt (+ decompress) a fetched chunk off the main thread
// so large downloads don't block the UI and decryption parallelizes across cores.
export interface DecryptInput {
  mode: "decrypt";
  chunkIndex: number;
  encrypted: ArrayBuffer;
  keyBytes: ArrayBuffer;
  compressed: boolean;
}

export interface DecryptOutput {
  chunkIndex: number;
  plaintext: ArrayBuffer;
}

const IV_SIZE = 12;

async function encryptChunk(keyBytes: ArrayBuffer, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plaintext as BufferSource);
  const result = new Uint8Array(IV_SIZE + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_SIZE);
  return result;
}

async function decryptChunk(keyBytes: ArrayBuffer, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = data.subarray(0, IV_SIZE);
  const ciphertext = data.subarray(IV_SIZE);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
  return new Uint8Array(plaintext);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (e: MessageEvent<WorkerInput | DecryptInput>) => {
  await initPromise;

  // ── Download direction: decrypt (+ decompress) ──
  if (e.data.mode === "decrypt") {
    const { chunkIndex, encrypted, keyBytes, compressed } = e.data;
    let plain = await decryptChunk(keyBytes, new Uint8Array(encrypted));
    if (compressed && zstd) {
      plain = zstd.ZstdStream.decompress(plain);
    }
    // Copy into an exact-length buffer so the transfer sends only this chunk's
    // bytes (a WASM-heap view could back a much larger buffer).
    const out = plain.slice();
    const output: DecryptOutput = { chunkIndex, plaintext: out.buffer as ArrayBuffer };
    (self as unknown as Worker).postMessage(output, [out.buffer as ArrayBuffer]);
    return;
  }

  const { chunkIndex, plaintext, keyBytes, compress, compressionLevel = 3 } = e.data;
  const raw = new Uint8Array(plaintext);
  const originalSize = raw.byteLength;

  let processedData: Uint8Array<ArrayBufferLike> = raw;
  let compressed = false;

  // Compress if requested and beneficial
  if (compress && zstd) {
    try {
      const compressedData = zstd.ZstdStream.compress(raw, compressionLevel);
      // Only use compressed version if it saves >= 5%
      if (compressedData.byteLength < originalSize * 0.95) {
        processedData = compressedData;
        compressed = true;
      }
    } catch {
      // Compression failed, continue with uncompressed data
    }
  }

  const compressedSize = processedData.byteLength;

  // Encrypt
  const encrypted = await encryptChunk(keyBytes, processedData);

  // Hash the encrypted output (this is what the server will verify)
  const sha256 = await sha256Hex(encrypted);

  const output: WorkerOutput = {
    chunkIndex,
    encrypted: encrypted.buffer as ArrayBuffer,
    sha256,
    compressed,
    originalSize,
    compressedSize,
    encryptedSize: encrypted.byteLength,
  };

  // Transfer the encrypted buffer (zero-copy)
  (self as unknown as Worker).postMessage(output, [encrypted.buffer as ArrayBuffer]);
};
