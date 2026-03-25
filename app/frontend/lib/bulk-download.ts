/**
 * Client-side bulk download + ZIP creation.
 *
 * Downloads and decrypts multiple files, packs them into a ZIP archive,
 * and triggers a browser download. Uses fflate for fast ZIP creation.
 */

import { getFileMeta, getFileChunk } from "@/lib/api";
import { deriveKeyBytes, decryptChunk, sha256Hex, fromBase64 } from "@/lib/crypto";
import { ZstdInit } from "@oneidentity/zstd-js/wasm";
import { zipSync } from "fflate";
import { getDeviceProfile } from "@/lib/device-profile";

export interface BulkDownloadFile {
  fileId: string;
  filename: string;
  fileSize: number;
}

export interface BulkDownloadProgress {
  stage: string;
  percent: number;
  currentFile: string;
  filesDone: number;
  filesTotal: number;
}

export interface BulkDownloadOptions {
  onProgress?: (info: BulkDownloadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Download, decrypt multiple files and pack them into a ZIP.
 */
export async function downloadAsZip(
  files: BulkDownloadFile[],
  passphrase: string,
  options?: BulkDownloadOptions
): Promise<void> {
  const { onProgress, signal } = options ?? {};

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  const zstd = await ZstdInit();
  const totalFiles = files.length;
  let filesDone = 0;
  const zipEntries: Array<{ name: string; data: Uint8Array }> = [];

  for (const file of files) {
    if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

    onProgress?.({
      stage: `Downloading ${file.filename}`,
      percent: Math.round((filesDone / totalFiles) * 88),
      currentFile: file.filename,
      filesDone,
      filesTotal: totalFiles,
    });

    // Get metadata and derive key
    const meta = await getFileMeta(file.fileId);
    const salt = fromBase64(meta.salt);
    const keyBytes = await deriveKeyBytes(passphrase, salt);

    // Download and decrypt all chunks with concurrency
    const MAX_CONCURRENT = Math.min(getDeviceProfile().maxConcurrentDownloads, 3);
    const chunkResults: Uint8Array[] = new Array(meta.chunk_count);
    const queue = Array.from({ length: meta.chunk_count }, (_, i) => i);

    const processChunk = async (index: number) => {
      if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
      const { data, compressed } = await getFileChunk(file.fileId, index);

      let plain: Uint8Array;
      try {
        plain = await decryptChunk(keyBytes, new Uint8Array(data));
      } catch {
        throw new Error(`Decryption failed for ${file.filename} — wrong passphrase?`);
      }

      if (compressed && zstd) {
        plain = zstd.ZstdStream.decompress(plain);
      }
      chunkResults[index] = plain;
    };

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

    // Assemble and verify
    const totalSize = chunkResults.reduce((s, c) => s + c.byteLength, 0);
    const fullFile = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunkResults) {
      fullFile.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const hash = await sha256Hex(fullFile);
    if (hash !== meta.sha256) {
      throw new Error(`Integrity check failed for ${file.filename}`);
    }

    // Handle duplicate filenames
    let zipName = file.filename;
    const existingNames = new Set(zipEntries.map((e) => e.name));
    if (existingNames.has(zipName)) {
      const dot = zipName.lastIndexOf(".");
      const base = dot > 0 ? zipName.slice(0, dot) : zipName;
      const ext = dot > 0 ? zipName.slice(dot) : "";
      let n = 1;
      while (existingNames.has(`${base} (${n})${ext}`)) n++;
      zipName = `${base} (${n})${ext}`;
    }

    zipEntries.push({ name: zipName, data: fullFile });
    filesDone++;
  }

  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");

  // Build ZIP
  onProgress?.({
    stage: "Building ZIP...",
    percent: 90,
    currentFile: "",
    filesDone: totalFiles,
    filesTotal: totalFiles,
  });

  const zipData: Record<string, Uint8Array> = {};
  for (const entry of zipEntries) {
    zipData[entry.name] = entry.data;
  }
  const zipped = zipSync(zipData);

  // Trigger download
  onProgress?.({
    stage: "Saving ZIP...",
    percent: 96,
    currentFile: "",
    filesDone: totalFiles,
    filesTotal: totalFiles,
  });

  const zipBuffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(zipBuffer).set(zipped);
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zcrypt-${totalFiles}-files.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({
    stage: "Done",
    percent: 100,
    currentFile: "",
    filesDone: totalFiles,
    filesTotal: totalFiles,
  });
}
