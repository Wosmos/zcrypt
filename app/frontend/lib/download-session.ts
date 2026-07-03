/**
 * Client-side download + decrypt pipeline.
 *
 * Downloads encrypted chunks from server, decrypts in browser,
 * decompresses if needed, verifies SHA-256, and triggers browser download.
 *
 * Supports cancellation via AbortController.
 */

import { getFileMeta, getFileChunk, type FileMetaResponse } from "@/lib/api";
import { resolveFileKey, fromBase64 } from "@/lib/crypto";
import { getDeviceProfile } from "@/lib/device-profile";
import { WorkerPool } from "@/lib/worker-pool";
import { OrderedWriter } from "@/lib/ordered-writer";
import type { DecryptOutput } from "@/workers/crypto-worker";

/** The subset of FileSystemWritableFileStream we use — structural so this module
 *  doesn't depend on lib.dom File System Access typings. */
export interface DiskWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

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
  /**
   * When provided, decrypted chunks are STREAMED to this disk writable (from
   * showSaveFilePicker().createWritable()) in order, instead of being assembled
   * in memory — the only way to download a file too big to hold in a browser
   * tab (e.g. 25GB). On integrity failure / cancel the writable is aborted so a
   * corrupt/partial file is never committed.
   */
  saveToDisk?: DiskWritable;
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
  const { onProgress, signal, resolvePassword, resolveKey, saveToDisk } = options ?? {};

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
  const hex = (bytes: Uint8Array) =>
    Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { sha256: nobleSha256 } = await import("@noble/hashes/sha2.js");
  const hasher = nobleSha256.create();

  const streaming = !!saveToDisk;
  let chunksDone = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;
  const pool = new WorkerPool();

  // STREAMING: chunks go straight to disk in order (hashed as written) so the
  // whole file is never held in memory. IN-MEMORY: fall back to the chunk array.
  const decryptedChunks: Uint8Array[] = streaming ? [] : new Array(meta.chunk_count);
  const writer = streaming
    ? new OrderedWriter(
        {
          async write(d: Uint8Array) {
            hasher.update(d);
            await saveToDisk!.write(d);
          },
        },
        Math.max(4, MAX_CONCURRENT * 2)
      )
    : null;

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

      const plain = new Uint8Array(out.plaintext);
      if (writer) {
        await writer.put(index, plain); // streamed to disk in index order + hashed
      } else {
        decryptedChunks[index] = plain;
      }
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
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    // Step 4: Verify integrity. Streaming hashes in write-order as chunks land;
    // in-memory hashes the array in index order. Either way, no second
    // full-file-sized buffer (the old concat doubled peak memory and OOM'd).
    onProgress?.({ stage: "Verifying integrity...", percent: 93, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

    if (streaming && writer) {
      await writer.close(meta.chunk_count); // drain + assert every chunk was written
    } else {
      for (const chunk of decryptedChunks) hasher.update(chunk);
    }
    const actualHash = hex(hasher.digest());
    if (actualHash !== meta.sha256) {
      throw new Error("File integrity check failed — SHA-256 mismatch");
    }

    // Step 5: Finalize. Streaming commits the on-disk file; in-memory triggers a
    // Blob download (the browser backs a large Blob with a temp file).
    onProgress?.({ stage: "Saving file...", percent: 97, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

    if (streaming) {
      await saveToDisk!.close(); // commit — the file is already on disk
    } else {
      const blob = new Blob(decryptedChunks as BlobPart[], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    onProgress?.({ stage: "Done", percent: 100, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });
  } catch (err) {
    // Discard a partially-written disk file so we never leave a corrupt/partial
    // download committed (integrity failure, cancel, decrypt error, …).
    if (saveToDisk?.abort) {
      try { await saveToDisk.abort(); } catch { /* already closed/aborted */ }
    }
    throw err;
  } finally {
    pool.terminate();
  }
}
