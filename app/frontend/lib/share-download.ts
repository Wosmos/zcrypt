/**
 * Share-specific download + decrypt pipeline.
 *
 * Same as download-session.ts but uses public share endpoints
 * (no auth required). The share token + optional share password
 * are used instead of the authenticated user's session.
 */

import { getShareFileMeta, getShareChunk } from "@/lib/api";
import { retryTransient } from "@/lib/retry";
import { runWithConcurrency } from "@/lib/concurrent";
import { unwrapKey, decryptChunk, sha256Hex, fromBase64 } from "@/lib/crypto";
import { getZstdCodec } from "@/lib/zstd";
import { getDeviceProfile } from "@/lib/device-profile";

// Route through the single app-wide codec (lib/zstd) — never call ZstdInit()
// directly, or it re-inits the shared wasm and corrupts other in-flight
// decompression ("ZSTD_ERROR -72").
let zstdCodec: Awaited<ReturnType<typeof getZstdCodec>> | null = null;
const zstdReady = getZstdCodec().then((codec) => {
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
 *
 * `shareKeyB64` is the base64 key from the share link's URL fragment. It unwraps
 * the file's Content Encryption Key (returned wrapped by the share meta
 * endpoint) — no passphrase is involved, so anyone with the link can decrypt.
 *
 * Throws on a bad/missing key, integrity failure, or abort.
 */
export async function downloadSharedFile(
  token: string,
  shareKeyB64: string,
  options?: ShareDownloadOptions
): Promise<void> {
  const { onProgress, signal, sharePassword } = options ?? {};

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  await zstdReady;

  // Step 1: Get file metadata via share endpoint
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: 0 });
  const meta = await getShareFileMeta(token, sharePassword);

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 2: Unwrap the file's CEK using the share key from the URL fragment.
  onProgress?.({ stage: "Unwrapping key...", percent: 1, chunksDone: 0, chunksTotal: meta.chunk_count });
  if (!meta.wrapped_cek) {
    throw new Error("This share is missing its encryption key and cannot be decrypted.");
  }
  let keyBytes: ArrayBuffer;
  try {
    const shareKey = fromBase64(shareKeyB64);
    const cek = await unwrapKey(shareKey.buffer.slice(0) as ArrayBuffer, fromBase64(meta.wrapped_cek));
    keyBytes = cek.buffer.slice(0) as ArrayBuffer;
  } catch {
    throw new Error("Invalid or corrupt share key — check that you copied the full link.");
  }

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 3: Download and decrypt chunks
  const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
  let chunksDone = 0;
  const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;

  const processChunk = async (index: number) => {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const { data, compressed } = await retryTransient(
      () => getShareChunk(token, index, sharePassword),
      { signal }
    );

    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    const encrypted = new Uint8Array(data);

    let plaintext: Uint8Array;
    try {
      plaintext = await decryptChunk(keyBytes, encrypted);
    } catch {
      throw new Error("Decryption failed — the share key may be wrong or the link incomplete.");
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

    const percent = 2 + Math.round((chunksDone / meta.chunk_count) * 90);
    onProgress?.({
      stage: `Downloading ${chunksDone}/${meta.chunk_count}`,
      percent,
      chunksDone,
      chunksTotal: meta.chunk_count,
    });
  };

  // Process with concurrency limit
  await runWithConcurrency(meta.chunk_count, MAX_CONCURRENT, processChunk, signal);

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

  // A recipient holds only the share key, never the owner's passphrase, so it
  // cannot recompute an 'hmac_v1' keyed MAC. Integrity for those files rests on
  // the per-chunk AES-GCM auth tags (every one of meta.chunk_count chunks was
  // fetched and decrypted above — a tampered or missing chunk already throws),
  // so there is no file-level hash to check. Legacy 'plain' files still verify
  // their SHA-256 end to end.
  if (meta.sha256_scheme !== "hmac_v1") {
    const actualHash = await sha256Hex(fullFile);
    if (actualHash !== meta.sha256) {
      throw new Error("File integrity check failed — SHA-256 mismatch");
    }
  }

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Step 5: Trigger browser download
  onProgress?.({ stage: "Saving file...", percent: 97, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });

  const blob = new Blob([fullFile], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // A recipient has only the share key, not the owner's vault passphrase, so a
  // zero-knowledge file's name (encrypted under the vault key) can't be resolved
  // here — fall back to a generic name. TODO: carry the name re-encrypted under
  // the share key (shares.enc_name) so recipients see the real filename.
  a.download = meta.original_name || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({ stage: "Done", percent: 100, chunksDone: meta.chunk_count, chunksTotal: meta.chunk_count });
}
