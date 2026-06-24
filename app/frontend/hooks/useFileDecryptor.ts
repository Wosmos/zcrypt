"use client";

import { useCallback } from "react";
import { IncorrectPassphraseError } from "@/lib/crypto";
import type { UseFolderProtection } from "@/hooks/useFolderProtection";
import type { FileMetadata } from "@/types";

/**
 * ── useFileDecryptor — PUBLIC INTERFACE ──────────────────────────────────────
 *
 *   const { decryptToBlob } = useFileDecryptor(folderProtection);
 *   const blob = await decryptToBlob(file);   // typed MIME, ready for a viewer
 *
 * `decryptToBlob(file: FileMetadata): Promise<Blob>`
 *   Faithfully replays `useVaultActions.startPreview`'s decrypt pipeline entirely
 *   in the browser (zero-knowledge — no plaintext or passphrase ever leaves the
 *   page or is logged):
 *     1. password = await folderProtection.passwordForFile(file)
 *        (vault pass for unprotected files; cached/prompted+verified folder pass
 *        for protected-folder files — routes through the existing unlock flow).
 *     2. meta  = getFileMeta(file.id)
 *     3. key   = resolveFileKey(password, fromBase64(meta.salt), meta.wrapped_cek)
 *     4. per chunk: getFileChunk → decryptChunk → ZstdStream.decompress (if the
 *        chunk's `compressed` flag is set) → push
 *     5. concat → sha256Hex must equal meta.sha256 (else integrity error)
 *     6. new Blob([full], { type: <mime derived from extension> })
 *   Unlike `startPreview` (which returns a generic octet-stream and dispatches by
 *   filename later), this stamps the correct MIME up front so <video>/<audio>/
 *   <img>/<iframe> consumers play/render directly.
 *
 * Errors (so callers — e.g. <FileViewer> — can react precisely):
 *   - `WrongPasswordError`  → a wrong vault/folder password. Carries `folderId`
 *     (null for the vault). The caller may clear the cache + re-prompt + retry.
 *   - `IntegrityError`      → SHA-256 mismatch (corruption / tampering).
 *   - any other Error       → network / decode failure (show retry + download).
 * The user cancelling an unlock prompt rejects with the existing
 * `FolderUnlockCancelled` (from useFolderProtection) — callers treat it as a
 * clean no-op, not an error.
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

// Initialize the zstd wasm codec ONCE and reuse it across every decrypt. Calling
// ZstdInit() per decrypt — and especially while a previous decrypt is still
// decompressing (a re-fired effect, or React StrictMode's double-invoke in dev) —
// re-initializes the shared wasm mid-use and corrupts in-flight decompression
// ("ZSTD_ERROR: Src size is incorrect"). A single module-level init is safe and
// mirrors how lib/download-session.ts uses one shared codec.
type ZstdCodec = { ZstdStream: { decompress(d: Uint8Array): Uint8Array } };
let zstdPromise: Promise<ZstdCodec> | null = null;
function getZstd(): Promise<ZstdCodec> {
  if (!zstdPromise) {
    zstdPromise = import("@oneidentity/zstd-js/wasm").then(
      (m) => m.ZstdInit() as unknown as Promise<ZstdCodec>
    );
  }
  return zstdPromise;
}

/**
 * Reusable in-browser decryptor. Pass the page's `useFolderProtection` instance
 * so password routing (and the unlock prompt) match every other vault action.
 */
export function useFileDecryptor(folderProtection: UseFolderProtection): UseFileDecryptor {
  const decryptToBlob = useCallback(
    async (file: FileMetadata): Promise<Blob> => {
      // 1. Resolve the right password (vault, or folder pass for a protected
      //    folder — prompting/verifying through the existing unlock flow). This
      //    can reject with FolderUnlockCancelled if the user cancels — let it
      //    propagate so the caller treats it as a clean no-op.
      const password = await folderProtection.passwordForFile(file);

      // 2. Dynamic imports (same modules + path as startPreview).
      const { getFileMeta, getFileChunk } = await import("@/lib/api");
      const { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } = await import(
        "@/lib/crypto"
      );
      const zstd = await getZstd();

      try {
        const meta = await getFileMeta(file.id);
        const salt = fromBase64(meta.salt);
        const keyBytes = await resolveFileKey(password, salt, meta.wrapped_cek);

        const chunks: Uint8Array[] = [];
        for (let i = 0; i < meta.chunk_count; i++) {
          const { data, compressed } = await getFileChunk(file.id, i);
          let plain = await decryptChunk(keyBytes, new Uint8Array(data));
          if (compressed && zstd) {
            // ZstdStream (not ZstdSimple): no embedded frame content size needed.
            plain = zstd.ZstdStream.decompress(plain);
          }
          chunks.push(plain);
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
        return new Blob([full], { type: mimeForFilename(file.original_name) });
      } catch (err) {
        if (err instanceof IntegrityError) throw err;
        if (looksLikeWrongKey(err)) {
          const fid = file.folder_id ?? null;
          // Throw a typed wrong-password error so callers can clear the cache +
          // re-prompt + retry, exactly mirroring startPreview's recovery branch.
          throw new WrongPasswordError(
            fid && folderProtection.isFileProtected(file) ? fid : null
          );
        }
        throw err instanceof Error ? err : new Error("Decryption failed");
      }
    },
    [folderProtection]
  );

  return { decryptToBlob };
}
