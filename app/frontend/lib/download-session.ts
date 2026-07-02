/**
 * Client-side download + decrypt pipeline.
 *
 * Downloads encrypted chunks from server, decrypts in browser,
 * decompresses if needed, verifies SHA-256, and triggers browser download.
 *
 * Supports cancellation via AbortController.
 */

import { getFileMeta, getFileChunk, type FileMetaResponse } from "@/lib/api";
import { resolveFileKey, sha256Hex, fromBase64 } from "@/lib/crypto";
import { getDeviceProfile } from "@/lib/device-profile";
import { WorkerPool } from "@/lib/worker-pool";
import type { DecryptOutput } from "@/workers/crypto-worker";

export type DownloadProgressCallback = (info: {
  stage: string;
  percent: number;
  chunksDone: number;
  chunksTotal: number;
}) => void;

/** Retry a transient chunk FETCH (network/timeout/stall/5xx) with backoff.
 *  Mirrors the upload path so one blip over a long download doesn't fail the
 *  whole file. Aborts (cancellation) and non-transient errors are NOT retried. */
async function fetchChunkWithRetry(
  fileId: string,
  index: number,
  signal?: AbortSignal,
  maxRetries = 5
): Promise<{ data: ArrayBuffer; sha256: string; compressed: boolean }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
    try {
      return await getFileChunk(fileId, index, signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const transient =
        msg.includes("network request failed") || msg.includes("timed out") ||
        msg.includes("timeout") || msg.includes("stalled") ||
        msg.includes("too many requests") || msg.includes("temporarily") ||
        msg.includes("unavailable") || /\b5\d\d\b/.test(msg);
      if (transient && attempt < maxRetries) {
        const backoff = Math.min(1000 * 2 ** attempt, 15_000) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

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
  /**
   * Resolve the raw file key directly from the fetched metadata, bypassing
   * passphrase derivation entirely. Used for shared-space files: the CEK is
   * unwrapped with the space key (not the vault passphrase), so `passphrase`
   * and `resolvePassword` are ignored when this is provided. Omitted by all
   * vault/folder callers, so their behavior is unchanged.
   */
  resolveKey?: (meta: FileMetaResponse) => Promise<ArrayBuffer>;
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
  const { onProgress, signal, resolvePassword, resolveKey } = options ?? {};

  // Check abort before starting
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 1: Get file metadata
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: 0 });
  const meta = await getFileMeta(fileId);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 2: Resolve the file key from passphrase + salt (unwraps the per-file
  // CEK for envelope files; falls back to the derived key for legacy files).
  // A per-file resolver (folder-protected files) overrides the vault passphrase.
  onProgress?.({ stage: "Deriving key...", percent: 1, chunksDone: 0, chunksTotal: meta.chunk_count });
  let keyBytes: ArrayBuffer;
  if (resolveKey) {
    // Shared-space file: the CEK is unwrapped with the space key, not derived
    // from a passphrase.
    keyBytes = await resolveKey(meta);
  } else {
    const filePassphrase = resolvePassword ? await resolvePassword(fileId) : passphrase;
    const salt = fromBase64(meta.salt);
    keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);
  }

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 3: Download + decrypt chunks. Fetching runs at device-aware concurrency;
  // decrypt + zstd-decompress is offloaded to a Web Worker pool so it runs across
  // cores and never blocks the main thread (a big win on mobile, where doing this
  // inline stalled the UI and serialized decompression).
  const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
  let chunksDone = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;
  const pool = new WorkerPool();

  try {
    const processChunk = async (index: number) => {
      if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

      const { data, compressed } = await fetchChunkWithRetry(fileId, index, signal);

      if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

      // Decrypt (+ decompress) off the main thread. `data` is transferred to the
      // worker (zero-copy); keyBytes is cloned per call, so it stays valid here.
      let out: DecryptOutput;
      try {
        out = await pool.process<DecryptOutput>({
          mode: "decrypt",
          chunkIndex: index,
          encrypted: data,
          keyBytes,
          compressed,
        });
      } catch {
        throw new Error("Decryption failed — wrong passphrase?");
      }

      decryptedChunks[index] = new Uint8Array(out.plaintext);
      chunksDone++;

      const percent = 2 + Math.round((chunksDone / meta.chunk_count) * 90);
      onProgress?.({
        stage: `Downloading ${chunksDone}/${meta.chunk_count}`,
        percent,
        chunksDone,
        chunksTotal: meta.chunk_count,
      });
    };

    // Fetch with a concurrency limit; each fetched chunk fans out to the pool.
    const queue = Array.from({ length: meta.chunk_count }, (_, i) => i);
    const fetchers: Promise<void>[] = [];

    for (let w = 0; w < Math.min(MAX_CONCURRENT, meta.chunk_count); w++) {
      fetchers.push(
        (async () => {
          while (queue.length > 0) {
            if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
            const idx = queue.shift()!;
            await processChunk(idx);
          }
        })()
      );
    }

    await Promise.all(fetchers);
  } finally {
    pool.terminate();
  }

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
