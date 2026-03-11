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

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
  await initPromise;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).postMessage(output, [encrypted.buffer as ArrayBuffer]);
};
