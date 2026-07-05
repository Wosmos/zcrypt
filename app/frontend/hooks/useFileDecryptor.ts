"use client";

import { useCallback } from "react";
import { IncorrectPassphraseError } from "@/lib/crypto";
import {
  cachedDecrypt,
  isWarmOrInflight,
} from "@/lib/decrypt-cache";
import { getDeviceProfile } from "@/lib/device-profile";
import { WorkerPool } from "@/lib/worker-pool";
import { mediaMimeFor } from "@/lib/media-formats";
import { viewerKindFor } from "@/components/viewers/viewer-kind";
import {
  resolveFilePasswordGlobal,
  FolderUnlockCancelled,
  type UseFolderProtection,
} from "@/hooks/useFolderProtection";
import type { DecryptOutput } from "@/workers/crypto-worker";
import type { FileMetadata } from "@/types";

/**
 * ── useFileDecryptor — PUBLIC INTERFACE ──────────────────────────────────────
 *
 *   const { decryptToBlob, prefetch } = useFileDecryptor(folderProtection);
 *   const blob = await decryptToBlob(file);   // typed MIME, ready for a viewer
 *   prefetch(neighbourFile);                  // warm the cache, fire-and-forget
 *
 * `decryptToBlob(file: FileMetadata, onProgress?): Promise<Blob>`
 *   Faithfully replays the decrypt pipeline entirely in the browser (zero-
 *   knowledge — no plaintext or passphrase ever leaves the page or is logged):
 *     1. password = await folderProtection.passwordForFile(file)
 *        (vault pass for unprotected files; cached/prompted+verified folder pass
 *        for protected-folder files — routes through the existing unlock flow).
 *     2. meta  = getFileMeta(file.id)
 *     3. key   = resolveFileKey(password, fromBase64(meta.salt), meta.wrapped_cek)
 *     4. chunks: N parallel fetchers (device profile's download concurrency)
 *        pull getFileChunk, each fanning out to a WorkerPool whose 'decrypt'
 *        mode does AES-GCM + zstd-decompress off the main thread — mirroring
 *        lib/download-session.ts. `onProgress(done, total)` fires per chunk.
 *     5. concat → sha256Hex must equal meta.sha256 (else integrity error)
 *     6. new Blob([full], { type: <mime derived from extension> })
 *   The decrypted blob is cached in memory (see lib/decrypt-cache) keyed by
 *   file id, so re-opening / navigating back to a file is instant. The whole
 *   pipeline — including the password prompt — is skipped on a cache hit, and
 *   concurrent callers for the same file are de-duplicated (onProgress does not
 *   fire on a cache hit or when joining another caller's in-flight decrypt).
 *
 * `prefetch(file: FileMetadata): void`
 *   Best-effort, fire-and-forget cache warm-up used to decrypt a viewer's
 *   neighbours ahead of time. It NEVER prompts: it resolves a password only if
 *   one is already available (vault unlocked / folder unlocked) and otherwise
 *   silently does nothing. Errors are swallowed — prefetch is purely an
 *   optimisation.
 *
 * Errors from `decryptToBlob` (so callers — e.g. <FileViewer> — can react):
 *   - `WrongPasswordError`  → a wrong vault/folder password. Carries `folderId`
 *     (null for the vault). The caller may clear the cache + re-prompt + retry.
 *   - `IntegrityError`      → SHA-256 mismatch (corruption / tampering).
 *   - `FolderUnlockCancelled` → the user cancelled an unlock prompt; callers
 *     treat it as a clean no-op, not an error.
 *   - any other Error       → network / decode failure (show retry + download).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A wrong vault/folder password (CEK unwrap or chunk auth failed). */
export class WrongPasswordError extends Error {
  /** The protected folder whose password was wrong, or null for the vault. */
  readonly folderId: string | null;
  constructor(folderId: string | null) {
    super("Incorrect password");
    this.name = "WrongPasswordError";
    this.folderId = folderId;
  }
}

/** Decrypted bytes failed the SHA-256 integrity check (corruption/tampering). */
export class IntegrityError extends Error {
  constructor() {
    super("File integrity check failed");
    this.name = "IntegrityError";
  }
}

export interface UseFileDecryptor {
  /**
   * Decrypt a file fully in-browser and return a typed Blob (correct MIME).
   * `onProgress(done, total)` reports chunk-level progress (skipped on cache
   * hits / joined in-flight decrypts, which resolve immediately anyway).
   */
  decryptToBlob: (
    file: FileMetadata,
    onProgress?: (done: number, total: number) => void
  ) => Promise<Blob>;
  /**
   * Best-effort, non-prompting cache warm-up for a file (e.g. a viewer
   * neighbour). Fire-and-forget; resolves nothing and never throws.
   */
  prefetch: (file: FileMetadata) => void;
}

/**
 * Best-effort MIME for a decrypted blob, keyed by lowercased extension. Covers
 * everything the viewers dispatch on so <video>/<audio>/<img>/<iframe> get a
 * src/type they can actually render. Unknown → application/octet-stream.
 */
const MIME_BY_EXT: Record<string, string> = {
  // image
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  // video
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime",
  webm: "video/webm", mkv: "video/x-matroska", ogv: "video/ogg", avi: "video/x-msvideo",
  // audio
  mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac",
  m4a: "audio/mp4", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  // documents
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // text / markup / code
  txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
  html: "text/html", htm: "text/html",
  csv: "text/csv", tsv: "text/tab-separated-values",
  json: "application/json", xml: "application/xml",
  yaml: "text/yaml", yml: "text/yaml",
  js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript",
  ts: "text/plain", tsx: "text/plain", jsx: "text/javascript",
  py: "text/x-python", go: "text/x-go", rs: "text/x-rustsrc",
  java: "text/x-java", c: "text/x-csrc", cpp: "text/x-c++src", h: "text/x-chdr",
  css: "text/css", sh: "text/x-shellscript", sql: "text/x-sql",
  toml: "text/plain", ini: "text/plain", cfg: "text/plain", log: "text/plain",
};

/** Derive a MIME type from a filename's extension (octet-stream fallback). */
export function mimeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  // Prefer the local table, then the shared media table (broad audio/video
  // coverage — mpeg/wma/mkv/etc.), then octet-stream.
  return MIME_BY_EXT[ext] ?? mediaMimeFor(filename) ?? "application/octet-stream";
}

/** Heuristic: does this thrown error look like a wrong-key failure? */
function looksLikeWrongKey(err: unknown): boolean {
  if (err instanceof IncorrectPassphraseError) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("decrypt") ||
    msg.includes("passphrase") ||
    msg.includes("cipher") ||
    msg.includes("operationerror") // WebCrypto AES-GCM auth failure
  );
}

/**
 * The pure decrypt pipeline (no React, no password prompting). Given a file and
 * its already-resolved password, fetch every chunk, decrypt + decompress, verify
 * the SHA-256, and return a MIME-typed Blob. Shared by decryptToBlob and prefetch
 * and always invoked through the in-memory blob cache.
 *
 * Chunk stage mirrors lib/download-session.ts: fetchers run at the device
 * profile's download concurrency, and each fetched chunk fans out to a
 * WorkerPool whose 'decrypt' mode does AES-GCM + zstd-decompress off the main
 * thread. Each worker owns an ISOLATED zstd wasm instance, so concurrent
 * pipelines can't corrupt a shared codec's streaming state (the failure the old
 * synchronous main-thread pass existed to prevent).
 */
export async function runDecryptPipeline(
  file: FileMetadata,
  password: string,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const { getFileMeta, getFileChunk } = await import("@/lib/api");
  const { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");

  const meta = await getFileMeta(file.id);
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(password, salt, meta.wrapped_cek);

  // Legacy files (no wrapped CEK) have no key verifier: a wrong passphrase only
  // surfaces as an AES-GCM auth failure on the first chunk. Verify against
  // chunk 0 on the MAIN thread before fanning out, so a wrong password still
  // throws the same DOMException("OperationError") the sequential pipeline
  // threw — a worker's async decrypt rejection never reaches its 'error' event,
  // which would leave the pool (and the viewer) waiting forever instead of
  // re-prompting. Envelope files already fail fast inside resolveFileKey.
  let chunk0: { data: ArrayBuffer; compressed: boolean } | null = null;
  if (!meta.wrapped_cek && meta.chunk_count > 0) {
    chunk0 = await getFileChunk(file.id, 0);
    await decryptChunk(keyBytes, new Uint8Array(chunk0.data)); // throws on wrong key
  }

  const decrypted: Uint8Array[] = new Array(meta.chunk_count);
  let done = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;
  const pool = new WorkerPool();

  try {
    const processChunk = async (index: number) => {
      // Chunk 0 may already be fetched by the legacy key check above.
      const { data, compressed } =
        index === 0 && chunk0 ? chunk0 : await getFileChunk(file.id, index);

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

      decrypted[index] = new Uint8Array(out.plaintext);
      done++;
      onProgress?.(done, meta.chunk_count);
    };

    // Fetch with a concurrency limit; each fetched chunk fans out to the pool.
    const queue = Array.from({ length: meta.chunk_count }, (_, i) => i);
    const fetchers: Promise<void>[] = [];

    for (let w = 0; w < Math.min(MAX_CONCURRENT, meta.chunk_count); w++) {
      fetchers.push(
        (async () => {
          while (queue.length > 0) {
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

  const totalSize = decrypted.reduce((s, c) => s + c.byteLength, 0);
  const full = new Uint8Array(totalSize);
  let offset = 0;
  for (const c of decrypted) {
    full.set(c, offset);
    offset += c.byteLength;
  }

  const hash = await sha256Hex(full);
  if (hash !== meta.sha256) throw new IntegrityError();

  // Stamp the real MIME so viewers can render/play directly.
  return new Blob([full as BlobPart], { type: mimeForFilename(file.original_name) });
}

/**
 * Module-level, NON-prompting cache warm-up, usable outside React (e.g. grid
 * hover). It resolves a password only if one is already available (vault /
 * folder unlocked) and otherwise silently does nothing; errors are swallowed —
 * prefetch is purely an optimisation. Deduped via the decrypt cache.
 */
export function prefetchFileDecrypt(file: FileMetadata): void {
  if (isWarmOrInflight(file.id)) return;
  void (async () => {
    try {
      const password = await resolveFilePasswordGlobal(file.id);
      await cachedDecrypt(file.id, file.folder_id ?? null, () =>
        runDecryptPipeline(file, password)
      );
    } catch {
      // Locked / unavailable / network — prefetch is an optimisation, ignore.
    }
  })();
}

/** Hover sweeps many rows in a second, so cap what a stray pointer crossing can
 *  start pulling — a huge video prefetch would starve a deliberate open. */
const HOVER_PREFETCH_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Hover-driven prefetch for the explorer's rows/cards. Desktop only — guarded
 * by `(hover: hover)` so touch devices (where pointerenter fires on tap) never
 * kick off decrypts — and only for files a viewer can actually preview, capped
 * by size. Non-prompting + deduped via prefetchFileDecrypt.
 */
export function prefetchOnHover(file: FileMetadata): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(hover: hover)").matches) return;
  if (viewerKindFor(file.original_name) === "fallback") return; // not previewable
  if (file.original_size > HOVER_PREFETCH_MAX_BYTES) return;
  prefetchFileDecrypt(file);
}

/**
 * Reusable in-browser decryptor. Pass the page's `useFolderProtection` instance
 * so password routing (and the unlock prompt) match every other vault action.
 */
export function useFileDecryptor(folderProtection: UseFolderProtection): UseFileDecryptor {
  const decryptToBlob = useCallback(
    async (
      file: FileMetadata,
      onProgress?: (done: number, total: number) => void
    ): Promise<Blob> => {
      try {
        // Cache hit → returns instantly, skipping the prompt and the pipeline.
        // Concurrent callers for the same id share one decrypt.
        return await cachedDecrypt(file.id, file.folder_id ?? null, async () => {
          // Resolve the right password (vault, or folder pass for a protected
          // folder — prompting/verifying through the existing unlock flow). Can
          // reject with FolderUnlockCancelled if the user cancels.
          const password = await folderProtection.passwordForFile(file);
          return runDecryptPipeline(file, password, onProgress);
        });
      } catch (err) {
        if (err instanceof IntegrityError) throw err;
        // A cancelled unlock prompt is a clean no-op — let it propagate.
        if (err instanceof FolderUnlockCancelled) throw err;
        if (looksLikeWrongKey(err)) {
          const fid = file.folder_id ?? null;
          // Throw a typed wrong-password error so callers can clear the cache +
          // re-prompt + retry, exactly mirroring the previous recovery branch.
          throw new WrongPasswordError(
            fid && folderProtection.isFileProtected(file) ? fid : null
          );
        }
        throw err instanceof Error ? err : new Error("Decryption failed");
      }
    },
    [folderProtection]
  );

  // Best-effort and NON-prompting — see prefetchFileDecrypt above. Prefetch
  // must never pop an unlock modal for a neighbour.
  const prefetch = useCallback((file: FileMetadata): void => {
    prefetchFileDecrypt(file);
  }, []);

  return { decryptToBlob, prefetch };
}
