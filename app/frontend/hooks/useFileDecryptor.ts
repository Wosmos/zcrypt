"use client";

import { useCallback } from "react";
import { IncorrectPassphraseError } from "@/lib/crypto";
import {
  cachedDecrypt,
  isWarmOrInflight,
} from "@/lib/decrypt-cache";
import { getZstdCodec, resetZstdCodec } from "@/lib/zstd";
import {
  resolveFilePasswordGlobal,
  FolderUnlockCancelled,
  type UseFolderProtection,
} from "@/hooks/useFolderProtection";
import type { FileMetadata } from "@/types";

/**
 * ── useFileDecryptor — PUBLIC INTERFACE ──────────────────────────────────────
 *
 *   const { decryptToBlob, prefetch } = useFileDecryptor(folderProtection);
 *   const blob = await decryptToBlob(file);   // typed MIME, ready for a viewer
 *   prefetch(neighbourFile);                  // warm the cache, fire-and-forget
 *
 * `decryptToBlob(file: FileMetadata): Promise<Blob>`
 *   Faithfully replays the decrypt pipeline entirely in the browser (zero-
 *   knowledge — no plaintext or passphrase ever leaves the page or is logged):
 *     1. password = await folderProtection.passwordForFile(file)
 *        (vault pass for unprotected files; cached/prompted+verified folder pass
 *        for protected-folder files — routes through the existing unlock flow).
 *     2. meta  = getFileMeta(file.id)
 *     3. key   = resolveFileKey(password, fromBase64(meta.salt), meta.wrapped_cek)
 *     4. per chunk: getFileChunk → decryptChunk → ZstdStream.decompress (if the
 *        chunk's `compressed` flag is set) → push
 *     5. concat → sha256Hex must equal meta.sha256 (else integrity error)
 *     6. new Blob([full], { type: <mime derived from extension> })
 *   The decrypted blob is cached in memory (see lib/decrypt-cache) keyed by
 *   file id, so re-opening / navigating back to a file is instant. The whole
 *   pipeline — including the password prompt — is skipped on a cache hit, and
 *   concurrent callers for the same file are de-duplicated.
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
  /** Decrypt a file fully in-browser and return a typed Blob (correct MIME). */
  decryptToBlob: (file: FileMetadata) => Promise<Blob>;
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
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
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
 */
async function runDecryptPipeline(file: FileMetadata, password: string): Promise<Blob> {
  const { getFileMeta, getFileChunk } = await import("@/lib/api");
  const { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
  const zstd = await getZstdCodec();

  const meta = await getFileMeta(file.id);
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(password, salt, meta.wrapped_cek);

  // Fetch + AES-GCM-decrypt every chunk first. Both are safe to interleave with
  // other in-flight decrypts (network + WebCrypto hold no shared mutable state),
  // so neighbour prefetches and the foreground view can overlap here.
  const decrypted: { plain: Uint8Array; compressed: boolean }[] = [];
  for (let i = 0; i < meta.chunk_count; i++) {
    const { data, compressed } = await getFileChunk(file.id, i);
    const plain = await decryptChunk(keyBytes, new Uint8Array(data));
    decrypted.push({ plain, compressed });
  }

  // Decompress in ONE synchronous pass — NO awaits between calls. The zstd wasm
  // codec is a single shared instance with internal streaming state; if two
  // files' decompress() calls interleave at await points (e.g. a view + its
  // neighbour prefetches running at once) that state is corrupted and throws
  // "ZSTD_ERROR: Src size is incorrect". A synchronous burst is atomic w.r.t. the
  // event loop, so concurrent pipelines can never interleave their decompression.
  // (ZstdStream, not ZstdSimple: no embedded frame content size needed.)
  let chunks: Uint8Array[];
  try {
    chunks = decrypted.map(({ plain, compressed }) =>
      compressed && zstd ? zstd.ZstdStream.decompress(plain) : plain
    );
  } catch (err) {
    // If the shared codec was somehow corrupted, reset it so the user's Retry
    // re-inits a clean codec instead of failing forever until a page reload.
    resetZstdCodec();
    throw err;
  }

  const totalSize = chunks.reduce((s, c) => s + c.byteLength, 0);
  const full = new Uint8Array(totalSize);
  let offset = 0;
  for (const c of chunks) {
    full.set(c, offset);
    offset += c.byteLength;
  }

  const hash = await sha256Hex(full);
  if (hash !== meta.sha256) throw new IntegrityError();

  // Stamp the real MIME so viewers can render/play directly.
  return new Blob([full as BlobPart], { type: mimeForFilename(file.original_name) });
}

/**
 * Reusable in-browser decryptor. Pass the page's `useFolderProtection` instance
 * so password routing (and the unlock prompt) match every other vault action.
 */
export function useFileDecryptor(folderProtection: UseFolderProtection): UseFileDecryptor {
  const decryptToBlob = useCallback(
    async (file: FileMetadata): Promise<Blob> => {
      try {
        // Cache hit → returns instantly, skipping the prompt and the pipeline.
        // Concurrent callers for the same id share one decrypt.
        return await cachedDecrypt(file.id, file.folder_id ?? null, async () => {
          // Resolve the right password (vault, or folder pass for a protected
          // folder — prompting/verifying through the existing unlock flow). Can
          // reject with FolderUnlockCancelled if the user cancels.
          const password = await folderProtection.passwordForFile(file);
          return runDecryptPipeline(file, password);
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

  const prefetch = useCallback((file: FileMetadata): void => {
    if (isWarmOrInflight(file.id)) return;
    // Best-effort and NON-prompting: resolve a password only if one is already
    // known (vault/folder unlocked); resolveFilePasswordGlobal throws otherwise,
    // which we swallow. Prefetch must never pop an unlock modal for a neighbour.
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
  }, []);

  return { decryptToBlob, prefetch };
}
