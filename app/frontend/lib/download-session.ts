/**
 * Client-side download + decrypt pipeline.
 *
 * Downloads encrypted chunks from server, decrypts in browser,
 * decompresses if needed, verifies SHA-256, and triggers browser download.
 *
 * Supports cancellation via AbortController.
 */

import { getFileMeta, getFileChunk } from "@/lib/api";
import { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } from "@/lib/crypto";
import { ZstdInit } from "@oneidentity/zstd-js/wasm";
import { getDeviceProfile } from "@/lib/device-profile";

let zstdCodec: Awaited<ReturnType<typeof ZstdInit>> | null = null;
const zstdReady = ZstdInit().then((codec) => {
  zstdCodec = codec;
});

export type DownloadProgressCallback = (info: {
  stage: string;
  percent: number;
  chunksDone: number;
  chunksTotal: number;
}) => void;

export interface DownloadOptions {
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
  /**
   * Optional per-file password resolver. When provided, its return value is used
   * to decrypt THIS file instead of the `passphrase` argument — this is how a
   * file in a password-protected folder uses its folder password rather than the
   * vault passphrase. Omitted by all unprotected/legacy callers, so their
   * behavior is byte-for-byte unchanged (the plain `passphrase` is used).
   */
  resolvePassword?: (fileId: string) => Promise<string> | string;
}

/**
 * Download, decrypt, and save a file.
 * Throws on wrong passphrase, integrity failure, or abort.
 */
export async function downloadAndDecryptFile(
  fileId: string,
  passphrase: string,
  options?: DownloadOptions
): Promise<void> {
  const { onProgress, signal, resolvePassword } = options ?? {};

  // Check abort before starting
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  await zstdReady;

  // Step 1: Get file metadata
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: 0 });
  const meta = await getFileMeta(fileId);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 2: Resolve the file key from passphrase + salt (unwraps the per-file
  // CEK for envelope files; falls back to the derived key for legacy files).
  // A per-file resolver (folder-protected files) overrides the vault passphrase.
  onProgress?.({ stage: "Deriving key...", percent: 1, chunksDone: 0, chunksTotal: meta.chunk_count });
  const filePassphrase = resolvePassword ? await resolvePassword(fileId) : passphrase;
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 3: Download and decrypt chunks (device-aware concurrency)
  const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
  let chunksDone = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;

  const processChunk = async (index: number) => {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const { data, compressed } = await getFileChunk(fileId, index);

    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const encrypted = new Uint8Array(data);

    // Decrypt
    let plaintext: Uint8Array;
    try {
      plaintext = await decryptChunk(keyBytes, encrypted);
    } catch {
      throw new Error("Decryption failed — wrong passphrase?");
    }

    // Decompress if needed
    if (compressed && zstdCodec) {
      try {
        // Use ZstdStream (streaming API) — it doesn't require frame content size,
        // which ZstdSimple.decompress needs but some frames may not include.
        plaintext = zstdCodec.ZstdStream.decompress(plaintext);
      } catch (decompressErr) {
        console.error(
          `[download] zstd decompress failed for chunk ${index}:`,
          `decryptedSize=${plaintext.byteLength}`,
          `header=[${plaintext.slice(0, 4).join(",")}]`,
          decompressErr
        );
        throw new Error(
          `Decompression failed on chunk ${index}: ${decompressErr instanceof Error ? decompressErr.message : decompressErr}`
        );
      }
    }

    decryptedChunks[index] = plaintext;
    chunksDone++;

    const percent = 2 + Math.round((chunksDone / meta.chunk_count) * 90);
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
  onProgress?.({ stage: "Verifying integrity...", percent: 93, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

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
  onProgress?.({ stage: "Saving file...", percent: 97, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

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
