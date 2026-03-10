/**
 * Client-side download + decrypt pipeline.
 *
 * Downloads encrypted chunks from server, decrypts in browser,
 * decompresses if needed, verifies SHA-256, and triggers browser download.
 */

import { getFileMeta, getFileChunk } from "@/lib/api";
import { deriveKeyBytes, decryptChunk, sha256Hex, fromBase64 } from "@/lib/crypto";
import { ZstdInit } from "@oneidentity/zstd-js/wasm";

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

/**
 * Download, decrypt, and save a file.
 * Throws on wrong passphrase or integrity failure.
 */
export async function downloadAndDecryptFile(
  fileId: string,
  passphrase: string,
  onProgress?: DownloadProgressCallback
): Promise<void> {
  // Ensure zstd is ready
  await zstdReady;

  // Step 1: Get file metadata
  onProgress?.({ stage: "Fetching metadata...", percent: 0, chunksDone: 0, chunksTotal: 0 });
  const meta = await getFileMeta(fileId);

  // Step 2: Derive key from passphrase + salt
  onProgress?.({ stage: "Deriving key...", percent: 5, chunksDone: 0, chunksTotal: meta.chunk_count });
  const salt = fromBase64(meta.salt);
  const keyBytes = await deriveKeyBytes(passphrase, salt);

  // Step 3: Download and decrypt chunks (4 concurrent)
  const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
  let chunksDone = 0;
  const MAX_CONCURRENT = 4;

  const processChunk = async (index: number) => {
    const { data, compressed } = await getFileChunk(fileId, index);
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
      plaintext = zstdCodec.ZstdSimple.decompress(plaintext);
    }

    decryptedChunks[index] = plaintext;
    chunksDone++;

    const percent = 10 + Math.round((chunksDone / meta.chunk_count) * 80);
    onProgress?.({
      stage: `Decrypting chunk ${chunksDone}/${meta.chunk_count}`,
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
          const idx = queue.shift()!;
          await processChunk(idx);
        }
      })()
    );
  }

  await Promise.all(workers);

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
