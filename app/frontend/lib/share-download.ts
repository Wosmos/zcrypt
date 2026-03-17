/**
 * Share-specific download + decrypt pipeline.
 *
 * Same as download-session.ts but uses public share endpoints
 * (no auth required). The share token + optional share password
 * are used instead of the authenticated user's session.
 */

import { getShareFileMeta, getShareChunk } from "@/lib/api";
import { deriveKeyBytes, decryptChunk, sha256Hex, fromBase64 } from "@/lib/crypto";
import { ZstdInit } from "@oneidentity/zstd-js/wasm";
import { getDeviceProfile } from "@/lib/device-profile";

let zstdCodec: Awaited<ReturnType<typeof ZstdInit>> | null = null;
const zstdReady = ZstdInit().then((codec) => {
  zstdCodec = codec;
});

export type ShareDownloadProgressCallback = (info: {
  stage: string;
  percent: number;
  chunksDone: number;
  chunksTotal: number;
}) => void;

export interface ShareDownloadOptions {
  onProgress?: ShareDownloadProgressCallback;
  signal?: AbortSignal;
  sharePassword?: string;
}

/**
 * Download, decrypt, and save a shared file.
 * Throws on wrong passphrase, integrity failure, or abort.
 */
export async function downloadSharedFile(
  token: string,
  passphrase: string,
  options?: ShareDownloadOptions
): Promise<void> {
  const { onProgress, signal, sharePassword } = options ?? {};

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  await zstdReady;

  // Step 1: Get file metadata via share endpoint
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: 0 });
  const meta = await getShareFileMeta(token, sharePassword);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 2: Derive key from passphrase + salt
  onProgress?.({ stage: "Deriving key...", percent: 5, chunksDone: 0, chunksTotal: meta.chunk_count });
  const salt = fromBase64(meta.salt);
  const keyBytes = await deriveKeyBytes(passphrase, salt);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 3: Download and decrypt chunks
  const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
  let chunksDone = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;

  const processChunk = async (index: number) => {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const { data, compressed } = await getShareChunk(token, index, sharePassword);

    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const encrypted = new Uint8Array(data);

    let plaintext: Uint8Array;
    try {
      plaintext = await decryptChunk(keyBytes, encrypted);
    } catch {
      throw new Error("Decryption failed — wrong passphrase?");
    }

    if (compressed && zstdCodec) {
      try {
        plaintext = zstdCodec.ZstdStream.decompress(plaintext);
      } catch (decompressErr) {
        throw new Error(
          `Decompression failed on chunk ${index}: ${decompressErr instanceof Error ? decompressErr.message : decompressErr}`
        );
      }
    }

    decryptedChunks[index] = plaintext;
    chunksDone++;

    const percent = 10 + Math.round((chunksDone / meta.chunk_count) * 80);
    onProgress?.({
      stage: `Downloading ${chunksDone}/${meta.chunk_count}`,
      percent,
      chunksDone,
      chunksTotal: meta.chunk_count,
    });
  };

  // Process with concurrency limit
  const queue = Array.from({ length: meta.chunk_count }, (_, i) => i);
  const workers: Promise<void>[] = [];

  for (let w = 0; w < Math.min(MAX_CONCURRENT, meta.chunk_count); w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
          const idx = queue.shift()!;
          await processChunk(idx);
        }
      })()
    );
  }

  await Promise.all(workers);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 4: Concatenate and verify
  onProgress?.({ stage: "Verifying integrity...", percent: 92, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

  const totalSize = decryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const fullFile = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of decryptedChunks) {
    fullFile.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const actualHash = await sha256Hex(fullFile);
  if (actualHash !== meta.sha256) {
    throw new Error("File integrity check failed — SHA-256 mismatch");
  }

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 5: Trigger browser download
  onProgress?.({ stage: "Saving file...", percent: 98, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

  const blob = new Blob([fullFile], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = meta.original_name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({ stage: "Done", percent: 100, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });
}
