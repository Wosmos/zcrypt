/**
 * Client-side bulk download + ZIP creation.
 *
 * Downloads and decrypts multiple files and streams them into a ZIP (fflate's
 * streaming Zip, stored entries), one verified file at a time. With a disk
 * writable the archive goes straight to disk, so only the file being packed is
 * ever in memory; otherwise the archive parts become a single Blob. A file that
 * fails is skipped and reported instead of sinking the whole archive.
 */

import { getFileMeta, getFileChunk } from "@/lib/api";
import { retryTransient } from "@/lib/retry";
import { runWithConcurrency } from "@/lib/concurrent";
import {
  resolveFileKey,
  decryptChunk,
  sha256Hex,
  contentMacBytes,
  deriveDedupKeyBytes,
  fromBase64,
} from "@/lib/crypto";
import { zstdDecompress } from "@/lib/zstd";
import { Zip, ZipPassThrough } from "fflate";
import { getDeviceProfile } from "@/lib/device-profile";
import { concatChunks, saveBlob } from "@/lib/utils";
import type { DiskWritable } from "@/lib/download-session";
import type { DownloadPasswordResolver } from "@/store/download";

export interface BulkDownloadFile {
  fileId: string;
  filename: string;
  fileSize: number;
  /** Folder path inside the archive (e.g. "Photos/2024"); root when absent. */
  path?: string;
}

interface BulkDownloadProgress {
  stage: string;
  percent: number;
  currentFile: string;
  filesDone: number;
  filesTotal: number;
}

export interface BulkDownloadOptions {
  onProgress?: (info: BulkDownloadProgress) => void;
  signal?: AbortSignal;
  /**
   * Optional per-file password resolver. When provided, each file is decrypted
   * with its resolver result (the folder password for protected-folder files)
   * instead of the shared `passphrase`.
   */
  resolvePassword?: DownloadPasswordResolver;
  /** Stream the archive here instead of assembling it in memory. */
  saveToDisk?: DiskWritable;
}

export interface BulkDownloadReport {
  added: number;
  failed: { fileId: string; filename: string; error: string }[];
}

const RESERVED = new Set(["<", ">", ":", '"', "|", "?", "*", "\x7f"]);

function cleanSegment(seg: string): string {
  return Array.from(seg, (c) => (c < " " || RESERVED.has(c) ? "_" : c))
    .join("")
    .trim();
}

function safeSegments(raw: string): string[] {
  return raw
    .split(/[\\/]+/)
    .map(cleanSegment)
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** Archive path for a file: its folder path plus name, with traversal
 *  (`..`, absolute paths, backslashes) and reserved characters neutralised. */
export function zipEntryName(file: Pick<BulkDownloadFile, "filename" | "path">): string {
  const dir = safeSegments(file.path ?? "");
  const name = safeSegments(file.filename).join("_") || "file";
  return [...dir, name].join("/");
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const slash = name.lastIndexOf("/") + 1;
  const dot = name.lastIndexOf(".");
  const hasExt = dot > slash;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : "";
  let n = 1;
  while (taken.has(`${base} (${n})${ext}`)) n++;
  return `${base} (${n})${ext}`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
}

async function fetchVerifiedFile(
  file: BulkDownloadFile,
  passphrase: string,
  signal: AbortSignal | undefined,
  resolvePassword: DownloadPasswordResolver | undefined,
): Promise<Uint8Array> {
  // A per-file resolver (folder-protected files) overrides the shared passphrase.
  const meta = await getFileMeta(file.fileId);
  const filePassphrase = resolvePassword ? await resolvePassword(file.fileId) : passphrase;
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);

  const MAX_CONCURRENT = Math.min(getDeviceProfile().maxConcurrentDownloads, 3);
  const chunkResults: Uint8Array[] = new Array(meta.chunk_count);

  // No entry guard: runWithConcurrency re-checks the signal immediately before
  // every worker call, so a duplicate here can never be the one that fires.
  const processChunk = async (index: number) => {
    const { data, compressed } = await retryTransient(
      () => getFileChunk(file.fileId, index, signal),
      { signal },
    );

    let plain: Uint8Array;
    try {
      plain = await decryptChunk(keyBytes, new Uint8Array(data));
    } catch {
      throw new Error(`Decryption failed for ${file.filename}, wrong passphrase?`);
    }

    if (compressed) {
      plain = await zstdDecompress(plain);
    }
    chunkResults[index] = plain;
  };

  await runWithConcurrency(meta.chunk_count, MAX_CONCURRENT, processChunk, signal);

  const fullFile = concatChunks(chunkResults);

  // Integrity: 'hmac_v1' files verify against the per-user keyed MAC (recomputed
  // with the same passphrase that decrypted them); legacy files against SHA-256.
  let contentHash: string;
  if (meta.sha256_scheme === "hmac_v1") {
    // Lazy import so this module (and its tests) don't eagerly load the auth
    // store: only an actual hmac_v1 download needs the current user id.
    const { useAuthStore } = await import("@/store/auth");
    const uid = useAuthStore.getState().user?.id;
    if (!uid) throw new Error(`Integrity check failed for ${file.filename}, not signed in`);
    contentHash = await contentMacBytes(fullFile, await deriveDedupKeyBytes(filePassphrase, uid));
  } else {
    contentHash = await sha256Hex(fullFile);
  }
  if (contentHash !== meta.sha256) {
    throw new Error(`Integrity check failed for ${file.filename}`);
  }
  return fullFile;
}

/**
 * Download, decrypt multiple files and stream them into a ZIP. Resolves with
 * what made it in and what was skipped; rejects only on cancel, a sink failure,
 * or when no file at all could be added.
 */
export async function downloadAsZip(
  files: BulkDownloadFile[],
  passphrase: string,
  options?: BulkDownloadOptions,
): Promise<BulkDownloadReport> {
  const { onProgress, signal, resolvePassword, saveToDisk } = options ?? {};
  assertNotAborted(signal);

  const totalFiles = files.length;
  const report: BulkDownloadReport = { added: 0, failed: [] };
  const parts: Uint8Array[] = [];
  let firstError: unknown = null;
  let pending: Promise<void> = Promise.resolve();

  const zip = new Zip((_err, chunk) => {
    if (saveToDisk) {
      pending = pending.then(() => saveToDisk.write(chunk));
    } else {
      parts.push(chunk);
    }
  });

  try {
    const taken = new Set<string>();
    let filesDone = 0;
    for (const file of files) {
      assertNotAborted(signal);
      onProgress?.({
        stage: `Downloading ${file.filename}`,
        percent: Math.round((filesDone / totalFiles) * 95),
        currentFile: file.filename,
        filesDone,
        filesTotal: totalFiles,
      });
      filesDone++;

      let data: Uint8Array;
      try {
        data = await fetchVerifiedFile(file, passphrase, signal, resolvePassword);
      } catch (err) {
        if (isAbort(err)) throw err;
        firstError ??= err;
        report.failed.push({
          fileId: file.fileId,
          filename: file.filename,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const name = uniqueName(zipEntryName(file), taken);
      taken.add(name);
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(data, true);
      await pending;
      report.added++;
    }

    assertNotAborted(signal);
    if (report.added === 0 && firstError) throw firstError;

    onProgress?.({
      stage: "Saving ZIP...",
      percent: 96,
      currentFile: "",
      filesDone: totalFiles,
      filesTotal: totalFiles,
    });
    zip.end();
    await pending;
    if (saveToDisk) {
      await saveToDisk.close();
    } else {
      saveBlob(
        `zcrypt-${totalFiles}-files.zip`,
        new Blob(parts as BlobPart[], { type: "application/zip" }),
      );
    }
  } catch (err) {
    zip.terminate();
    if (saveToDisk?.abort) await saveToDisk.abort().catch(() => {});
    throw err;
  }

  onProgress?.({
    stage: "Done",
    percent: 100,
    currentFile: "",
    filesDone: totalFiles,
    filesTotal: totalFiles,
  });
  return report;
}
