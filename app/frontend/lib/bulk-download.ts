/**
 * Client-side bulk download + ZIP creation.
 *
 * Downloads and decrypts multiple files and streams them into a ZIP (fflate's
 * streaming Zip, stored entries), one verified file at a time. With a disk
 * writable the archive goes straight to disk, so only the file being packed is
 * ever in memory; otherwise the archive parts become a single Blob. A file that
 * fails is skipped and reported instead of sinking the whole archive.
 */

import { CEK_MAC_SCHEME, cekMacKey } from "@/lib/pk1";
import { getFileMeta } from "@/lib/api";
import { createChunkSource } from "@/lib/chunk-source";
import { retryTransient } from "@/lib/retry";
import { runWithConcurrency } from "@/lib/concurrent";
import {
  resolveFileKey,
  createContentHasher,
  bytesToHex,
  deriveDedupKeyBytes,
  fromBase64,
} from "@/lib/crypto";
import { Zip, ZipPassThrough } from "fflate";
import { getDeviceProfile } from "@/lib/device-profile";
import { WorkerPool } from "@/lib/worker-pool";
import { decryptChunkInPool } from "@/lib/decrypt-chunk";
import { saveBlob } from "@/lib/utils";
import { tr } from "@/store/translate";
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

/** fflate writes 32-bit ZIP fields only (no ZIP64), so an archive must stay
 *  under 4 GiB and 65535 entries or it is silently corrupt. */
const ZIP32_MAX_BYTES = 0xffffffff;
export const ZIP_MAX_ENTRIES = 0xffff;
/** Each file is verified whole in memory before it is packed, so a single
 *  entry is capped to keep the tab alive; larger files download individually. */
export const ZIP_ENTRY_MAX_BYTES = 1024 * 1024 * 1024;
const ZIP_ENTRY_OVERHEAD = 128;
const ZIP_END_RECORD = 22;

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

function packedBytes(files: BulkDownloadFile[]): number {
  const enc = new TextEncoder();
  return files.reduce(
    (sum, f) => sum + f.fileSize + ZIP_ENTRY_OVERHEAD + 2 * enc.encode(zipEntryName(f)).length,
    ZIP_END_RECORD,
  );
}

/** Why these files cannot be zipped in the browser, or null when they can.
 *  Files over the entry cap are skipped (reported) rather than refused. */
export function zipRefusal(files: BulkDownloadFile[]): string | null {
  if (files.length > ZIP_MAX_ENTRIES) {
    return tr("l10n.zip.tooMany", { max: ZIP_MAX_ENTRIES });
  }
  const packable = files.filter((f) => f.fileSize <= ZIP_ENTRY_MAX_BYTES);
  if (packable.length === 0) {
    return tr("l10n.zip.tooLarge");
  }
  if (packedBytes(packable) > ZIP32_MAX_BYTES) {
    return tr("l10n.zip.tooBig");
  }
  return null;
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

/** A file's plaintext as the chunks it arrived in: no joined copy is made. */
async function fetchVerifiedFile(
  file: BulkDownloadFile,
  passphrase: string,
  signal: AbortSignal | undefined,
  resolvePassword: DownloadPasswordResolver | undefined,
  pool: WorkerPool,
  fits: (size: number) => void,
): Promise<Uint8Array[]> {
  // A per-file resolver (folder-protected files) overrides the shared passphrase.
  const meta = await getFileMeta(file.fileId);
  // The caller's size is a hint; the server's is what decides the caps.
  fits(meta.original_size);
  const filePassphrase = resolvePassword ? await resolvePassword(file.fileId) : passphrase;
  const salt = fromBase64(meta.salt);
  const keyBytes = await resolveFileKey(filePassphrase, salt, meta.wrapped_cek);

  // Integrity: 'hmac_v1' files verify against the per-user keyed MAC (recomputed
  // with the same passphrase that decrypted them); legacy files against SHA-256.
  let macKey: Uint8Array | undefined;
  if (meta.sha256_scheme === CEK_MAC_SCHEME) {
    macKey = await cekMacKey(keyBytes);
  } else if (meta.sha256_scheme === "hmac_v1") {
    // Lazy import so this module (and its tests) don't eagerly load the auth
    // store: only an actual hmac_v1 download needs the current user id.
    const { useAuthStore } = await import("@/store/auth");
    const uid = useAuthStore.getState().user?.id;
    if (!uid) throw new Error(tr("l10n.zip.integritySignedOut", { name: file.filename }));
    macKey = await deriveDedupKeyBytes(filePassphrase, uid);
  }

  const MAX_CONCURRENT = Math.min(getDeviceProfile().maxConcurrentDownloads, 3);
  const chunkResults: Uint8Array[] = new Array(meta.chunk_count);
  const fetchChunk = createChunkSource(file.fileId);

  // No entry guard: runWithConcurrency re-checks the signal immediately before
  // every worker call, so a duplicate here can never be the one that fires.
  const processChunk = async (index: number) => {
    const { data, compressed } = await retryTransient(() => fetchChunk(index, signal), { signal });
    try {
      chunkResults[index] = await decryptChunkInPool(pool, index, data, keyBytes, compressed);
    } catch (cause) {
      throw new Error(tr("l10n.zip.decryptFailed", { name: file.filename }), { cause });
    }
  };

  await runWithConcurrency(meta.chunk_count, MAX_CONCURRENT, processChunk, signal);

  const hasher = await createContentHasher(macKey ? "hmac_v1" : "plain", macKey);
  for (const c of chunkResults) hasher.update(c);
  if (bytesToHex(hasher.digest()) !== meta.sha256) {
    throw new Error(tr("l10n.zip.integrityFailed", { name: file.filename }));
  }
  return chunkResults;
}

/** Thrown when a run is stopped to be paused: the archive and its disk writable stay open. */
export class ZipPausedError extends Error {
  constructor() {
    super("ZIP download paused");
    this.name = "ZipPausedError";
  }
}

/**
 * Everything a ZIP run builds up, kept outside the call so a paused run can be
 * continued: the open archive writer, the parts (when assembling in memory), the
 * files already packed and which file comes next. A file is added only once it
 * is fully fetched and verified, so stopping mid-file leaves no partial entry.
 */
export interface ZipRun {
  zip: Zip;
  parts: Uint8Array[];
  report: BulkDownloadReport;
  taken: Set<string>;
  next: number;
  packed: number;
  firstError: unknown;
  pending: Promise<void>;
  zipError: Error | null;
  saveToDisk?: DiskWritable;
}

export function createZipRun(saveToDisk?: DiskWritable): ZipRun {
  const run = {
    parts: [],
    report: { added: 0, failed: [] },
    taken: new Set<string>(),
    next: 0,
    packed: ZIP_END_RECORD,
    firstError: null,
    pending: Promise.resolve(),
    zipError: null,
    saveToDisk,
  } as unknown as ZipRun;
  run.zip = new Zip((err, chunk) => {
    if (err) {
      run.zipError ??= err;
    } else if (run.saveToDisk) {
      const sink = run.saveToDisk;
      run.pending = run.pending.then(() => sink.write(chunk));
    } else {
      run.parts.push(chunk);
    }
  });
  return run;
}

/**
 * Download, decrypt multiple files and stream them into a ZIP. Resolves with
 * what made it in and what was skipped; rejects only on cancel, a sink failure,
 * or when no file at all could be added. Pass a `run` and a `pausing` check to
 * make it pausable: a stop while `pausing()` is true throws ZipPausedError and
 * leaves the run (and any disk writable) intact for the next call to continue.
 */
export async function downloadAsZip(
  files: BulkDownloadFile[],
  passphrase: string,
  options?: BulkDownloadOptions & { run?: ZipRun; pausing?: () => boolean },
): Promise<BulkDownloadReport> {
  const { onProgress, signal, resolvePassword, saveToDisk, pausing } = options ?? {};
  assertNotAborted(signal);
  const refusal = zipRefusal(files);
  if (refusal) throw new Error(refusal);

  const totalFiles = files.length;
  const run = options?.run ?? createZipRun(saveToDisk);
  const { report, zip, taken } = run;
  const pool = new WorkerPool();

  try {
    for (; run.next < files.length; run.next++) {
      const file = files[run.next];
      assertNotAborted(signal);
      onProgress?.({
        stage: tr("l10n.zip.stageDownloading", { name: file.filename }),
        percent: Math.round((run.next / totalFiles) * 95),
        currentFile: file.filename,
        filesDone: run.next,
        filesTotal: totalFiles,
      });

      if (file.fileSize > ZIP_ENTRY_MAX_BYTES) {
        report.failed.push({
          fileId: file.fileId,
          filename: file.filename,
          error: tr("l10n.zip.overLimit"),
        });
        continue;
      }

      let data: Uint8Array[];
      let cost = 0;
      try {
        data = await fetchVerifiedFile(file, passphrase, signal, resolvePassword, pool, (size) => {
          if (size > ZIP_ENTRY_MAX_BYTES) throw new Error(tr("l10n.zip.overLimit"));
          cost =
            size + ZIP_ENTRY_OVERHEAD + 2 * new TextEncoder().encode(zipEntryName(file)).length;
          if (run.packed + cost > ZIP32_MAX_BYTES) throw new Error(tr("l10n.zip.tooBig"));
        });
        run.packed += cost;
      } catch (err) {
        if (isAbort(err)) throw err;
        run.firstError ??= err;
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
      if (data.length === 0) entry.push(new Uint8Array(), true);
      data.forEach((part, i) => entry.push(part, i === data.length - 1));
      await run.pending;
      report.added++;
    }

    assertNotAborted(signal);
    if (report.added === 0 && run.firstError) throw run.firstError;

    onProgress?.({
      stage: tr("l10n.zip.stageSaving"),
      percent: 96,
      currentFile: "",
      filesDone: totalFiles,
      filesTotal: totalFiles,
    });
    zip.end();
    await run.pending;
    if (run.zipError) throw run.zipError;
    if (run.saveToDisk) {
      await run.saveToDisk.close();
    } else {
      saveBlob(
        `zcrypt-${totalFiles}-files.zip`,
        new Blob(run.parts as BlobPart[], { type: "application/zip" }),
      );
      run.parts.length = 0;
    }
  } catch (err) {
    if (pausing?.() && isAbort(err)) throw new ZipPausedError();
    zip.terminate();
    if (run.saveToDisk?.abort) await run.saveToDisk.abort().catch(() => {});
    throw err;
  } finally {
    pool.terminate();
  }

  onProgress?.({
    stage: tr("l10n.zip.stageDone"),
    percent: 100,
    currentFile: "",
    filesDone: totalFiles,
    filesTotal: totalFiles,
  });
  return report;
}
