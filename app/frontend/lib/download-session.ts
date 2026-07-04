/**
 * Client-side download + decrypt pipeline.
 *
 * Downloads encrypted chunks from server, decrypts in browser,
 * decompresses if needed, verifies SHA-256, and triggers browser download.
 *
 * Supports cancellation via AbortController, and — via an optional caller-owned
 * `resume` object — PAUSE/RESUME/RETRY-continue: a run can stop partway (pause
 * or transient failure) keeping everything it has decrypted so far, and a later
 * run continues from there instead of restarting at chunk 0. In-session only:
 * the partial data lives client-side (memory, or an open disk writable), so
 * closing the tab still restarts the download — unlike uploads, whose partial
 * state is held server-side.
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

/** Thrown (never surfaced as a failure) when a download stops because the user
 *  paused it. The store maps this to a "paused" row, keeping the resume state. */
export class DownloadPausedError extends Error {
  constructor() {
    super("Download paused");
    this.name = "DownloadPausedError";
  }
}

/** Minimal shape of the incremental hasher we keep alive across pause/resume for
 *  the streaming path (chunks are hashed in write-order as they hit disk, so the
 *  hasher state must survive between runs). */
interface IncrementalHasher {
  update(data: Uint8Array): IncrementalHasher;
  digest(): Uint8Array;
}

/**
 * Caller-owned, mutable state that lets a download continue across pause/retry.
 * Create one empty object per download and pass the SAME reference to every
 * `downloadAndDecryptFile` call for that download; the pipeline fills it in and
 * reads it back to skip work already done.
 */
export interface DownloadResumeState {
  meta?: FileMetaResponse;
  keyBytes?: ArrayBuffer;
  // ── in-memory mode (files under the stream-to-disk threshold) ──
  /** Sparse, index-addressed accumulator of decrypted chunks. */
  decryptedChunks?: Uint8Array[];
  /** Indices already decrypted into `decryptedChunks`. */
  done?: Set<number>;
  // ── streaming-to-disk mode ──
  /** The open disk writable — kept OPEN across pause/failure so a resume can
   *  keep appending; closed only on success, aborted only on explicit cancel. */
  saveToDisk?: DiskWritable;
  /** Write-order hasher, alive across runs (streaming hashes as it writes). */
  hasher?: IncrementalHasher;
  /** Contiguous chunks already written to disk (the resume high-water mark). */
  writtenCount?: number;
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
   * corrupt/partial file is never committed. On PAUSE the writable is left open.
   *
   * Ignored when `resume.saveToDisk` is already set (a resumed streaming run
   * keeps appending to the writable the first run opened).
   */
  saveToDisk?: DiskWritable;
  /**
   * Caller-owned resume state (see DownloadResumeState). Pass the same object to
   * every attempt of one download so pause/retry continue instead of restart.
   */
  resume?: DownloadResumeState;
  /**
   * Returns true when the current abort is a PAUSE (keep state, throw
   * DownloadPausedError) rather than a CANCEL (discard the disk file, throw
   * AbortError). Omitted ⇒ every abort is a cancel (legacy behavior).
   */
  pausing?: () => boolean;
}

/**
 * Download, decrypt, and save a file.
 * Throws on wrong passphrase, integrity failure, cancel (AbortError), or pause
 * (DownloadPausedError). A paused/failed run leaves `options.resume` populated
 * so a subsequent call continues from where it stopped.
 */
export async function downloadAndDecryptFile(
  fileId: string,
  passphrase: string,
  options?: DownloadOptions
): Promise<void> {
  const { onProgress, signal, resolvePassword, resolveKey, pausing } = options ?? {};
  const resume: DownloadResumeState = options?.resume ?? {};
  // A resumed streaming run keeps the writable the first run opened; a fresh run
  // adopts the one the caller just picked.
  const saveToDisk = resume.saveToDisk ?? options?.saveToDisk;
  if (options?.saveToDisk && !resume.saveToDisk) resume.saveToDisk = options.saveToDisk;

  const abortErr = () => new DOMException("Download cancelled", "AbortError");
  // On abort, decide pause-vs-cancel: pause preserves state (resume later),
  // cancel discards it (the finally aborts the disk file).
  const stopError = () => (pausing?.() ? new DownloadPausedError() : abortErr());
  if (signal?.aborted) throw stopError();

  // Step 1: metadata (cached across resumes).
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: resume.meta?.chunk_count ?? 0 });
  const meta = resume.meta ?? (await getFileMeta(fileId));
  resume.meta = meta;

  if (signal?.aborted) throw stopError();

  // Step 2: file key (cached across resumes). Envelope files unwrap the per-file
  // CEK; a per-file resolver (folder-protected) or resolveKey (shared space)
  // overrides the vault passphrase.
  onProgress?.({ stage: "Deriving key...", percent: 1, chunksDone: resume.done?.size ?? resume.writtenCount ?? 0, chunksTotal: meta.chunk_count });
  let keyBytes: ArrayBuffer;
  if (resume.keyBytes) {
    keyBytes = resume.keyBytes;
  } else if (resolveKey) {
    keyBytes = await resolveKey(meta);
  } else {
    const filePassphrase = resolvePassword ? await resolvePassword(fileId) : passphrase;
    const salt = fromBase64(meta.salt);
    keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);
  }
  resume.keyBytes = keyBytes;

  if (signal?.aborted) throw stopError();

  const hex = (bytes: Uint8Array) =>
    Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { sha256: nobleSha256 } = await import("@noble/hashes/sha2.js");

  const streaming = !!saveToDisk;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;
  const pool = new WorkerPool();

  // STREAMING: hash + writer persist across runs so the already-on-disk prefix
  // stays accounted for; a fresh OrderedWriter resumes at the high-water mark.
  // IN-MEMORY: the decrypted-chunk array persists; we hash it at finalize.
  let writer: OrderedWriter | null = null;
  if (streaming) {
    resume.hasher ??= nobleSha256.create() as unknown as IncrementalHasher;
    resume.writtenCount ??= 0;
    const hasher = resume.hasher;
    let written = resume.writtenCount;
    writer = new OrderedWriter(
      {
        async write(d: Uint8Array) {
          hasher.update(d);
          await saveToDisk!.write(d);
          written++;
          resume.writtenCount = written; // persist high-water on every disk write
        },
      },
      Math.max(4, MAX_CONCURRENT * 2),
      resume.writtenCount
    );
  } else {
    resume.decryptedChunks ??= new Array(meta.chunk_count);
    resume.done ??= new Set<number>();
  }

  // Progress is measured by chunks DECRYPTED (network + CPU work actually done),
  // not by the in-order disk-write cursor. On the streaming path a slow early
  // chunk holds the write cursor (writtenCount) back while later chunks are
  // already downloaded + decrypted — driving the bar off writtenCount made it
  // freeze ("stuck at ~4%") then jump when the laggard landed. Counting decrypts
  // reflects true download progress; writtenCount stays the resume high-water
  // mark. Seeded from writtenCount so a resumed run continues the count.
  let decryptedCount = streaming ? (resume.writtenCount ?? 0) : (resume.done?.size ?? 0);

  try {
    const processChunk = async (index: number) => {
      if (signal?.aborted) throw stopError();

      const { data, compressed } = await fetchChunkWithRetry(fileId, index, signal);

      if (signal?.aborted) throw stopError();

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
        await writer.put(index, plain, signal); // streamed to disk in order + hashed
      } else {
        resume.decryptedChunks![index] = plain;
        resume.done!.add(index);
      }

      // Count this chunk as done for the PROGRESS display the moment it's
      // decrypted (and, streaming, handed to the reorder buffer) — independent
      // of when it's flushed to disk in order.
      decryptedCount++;
      const percent = 2 + Math.round((decryptedCount / meta.chunk_count) * 90);
      onProgress?.({
        stage: `Downloading ${decryptedCount}/${meta.chunk_count}`,
        percent,
        chunksDone: decryptedCount,
        chunksTotal: meta.chunk_count,
      });
    };

    // Only fetch what's still missing: streaming resumes at the write high-water
    // mark; in-memory skips indices already decrypted.
    const queue = streaming
      ? Array.from({ length: meta.chunk_count }, (_, i) => i).filter((i) => i >= (resume.writtenCount ?? 0))
      : Array.from({ length: meta.chunk_count }, (_, i) => i).filter((i) => !resume.done!.has(i));

    // Fan out fetchers up to the concurrency limit. Use allSettled (not
    // Promise.all's fail-fast) so EVERY fetcher finishes before we read the
    // high-water mark — otherwise a straggler could still advance it after we
    // sampled, corrupting the resume point.
    const fetchers: Promise<void>[] = [];
    for (let w = 0; w < Math.min(MAX_CONCURRENT, queue.length); w++) {
      fetchers.push(
        (async () => {
          while (queue.length > 0) {
            if (signal?.aborted) throw stopError();
            const idx = queue.shift()!;
            await processChunk(idx);
          }
        })()
      );
    }

    const settled = await Promise.allSettled(fetchers);
    // An abort wins over whatever a fetcher happened to reject with. A paused
    // run aborts its in-flight chunk fetches, which reject with a RAW AbortError
    // (fetchChunkWithRetry re-throws it verbatim). If we surfaced that rejection
    // we'd throw AbortError → the store reads it as "cancelled". Re-deriving the
    // stop reason from the signal here yields DownloadPausedError while pausing,
    // so a pause stays a pause (and a real cancel stays a cancel).
    if (signal?.aborted) throw stopError();
    const rejection = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (rejection) throw rejection.reason;

    // Every chunk is in hand — verify integrity. Streaming has been hashing in
    // write-order as chunks landed; in-memory hashes the full array now. No
    // second full-file buffer either way (the old concat doubled peak memory).
    onProgress?.({ stage: "Verifying integrity...", percent: 93, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

    let actualHash: string;
    if (streaming && writer) {
      await writer.close(meta.chunk_count); // drain + assert every chunk written
      actualHash = hex(resume.hasher!.digest());
    } else {
      const hasher = nobleSha256.create();
      for (const chunk of resume.decryptedChunks!) hasher.update(chunk);
      actualHash = hex(hasher.digest());
    }
    if (actualHash !== meta.sha256) {
      throw new Error("File integrity check failed — SHA-256 mismatch");
    }

    // Finalize. Streaming commits the on-disk file; in-memory triggers a Blob
    // download (the browser backs a large Blob with a temp file).
    onProgress?.({ stage: "Saving file...", percent: 97, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

    if (streaming) {
      await saveToDisk!.close(); // commit — the file is already on disk
      resume.saveToDisk = undefined; // committed; nothing left to abort
    } else {
      const blob = new Blob(resume.decryptedChunks as BlobPart[], { type: "application/octet-stream" });
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
    // Decide the disk file's fate:
    //  • CANCEL (AbortError) or an INTEGRITY mismatch → discard it. Cancel is an
    //    explicit stop; an integrity failure means every chunk was written but
    //    the whole-file hash is wrong (corrupt) and re-fetching the same chunks
    //    can't fix it — never leave a corrupt/truncated file committed.
    //  • PAUSE or a transient/network FAILURE (chunks still missing) → keep the
    //    writable OPEN so resume/retry can keep appending from the high-water
    //    mark. The store aborts it on explicit dismiss/cancel instead.
    const isCancel = err instanceof DOMException && err.name === "AbortError";
    const isIntegrity = err instanceof Error && err.message.includes("integrity check failed");
    if ((isCancel || isIntegrity) && resume.saveToDisk?.abort) {
      try { await resume.saveToDisk.abort(); } catch { /* already closed/aborted */ }
      resume.saveToDisk = undefined;
    }
    throw err;
  } finally {
    pool.terminate();
  }
}
