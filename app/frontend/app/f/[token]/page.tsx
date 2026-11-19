"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { linkAllowanceKey } from "@/lib/web-transfer-limit";
import {
  getFolderShareInfo,
  getFolderShareFileMeta,
  getFolderShareChunk,
  completeFolderShareDownload,
  type FolderShareInfo,
  type FolderShareFileEntry,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  FolderOpen,
  File as FileIcon,
  Download,
  Lock,
  AlertTriangle,
  Loader2,
  Shield,
} from "@/lib/icons";
import { formatBytes, saveBlob } from "@/lib/utils";
import { tr } from "@/store/translate";
import { chooseDiskWriter, ZIP_IN_MEMORY_MAX_BYTES, type DiskChoice } from "@/lib/disk-save";
import { confirmLinkDownload, createLinkVerifier } from "@/lib/link-download";
import { downloadChunks } from "@/components/tokens/chunk-download";
import { runWithConcurrency } from "@/lib/concurrent";
import { isAbortError } from "@/lib/transport";
import { ZIP_ENTRY_MAX_BYTES, zipEntryName, zipRefusal } from "@/lib/bulk-download";
import type { DiskWritable } from "@/lib/download-session";
import { keyFromFragment, pathManifestFromFragment } from "@/lib/share-link";
import { isSealed, openText, keyFromBytes, LOCKED } from "@/lib/sealed";
import { fromBase64 } from "@/lib/crypto";
import { resolveDownloadName, sniffFileType } from "@/lib/mime-sniff";

// Names are sealed (enc1:) under the folder-share key from the URL fragment. An
// unopenable name reads as empty so downloads fall back to a sniffed one.
async function openName(raw: string | undefined, key: CryptoKey | null): Promise<string> {
  if (!raw) return "";
  if (!isSealed(raw)) return raw;
  const name = await openText(raw, key);
  return name === LOCKED ? "" : name;
}

// Opens the share name and every listed file name, then sorts by the real name
// (the server can only order by ciphertext).
async function openShareName<T extends { name: string; files?: FolderShareFileEntry[] }>(
  info: T,
  key: string | null,
): Promise<T> {
  const ck = key ? await keyFromBytes(fromBase64(key)) : null;
  const files = info.files
    ? await Promise.all(info.files.map(async (f) => ({ ...f, name: await openName(f.name, ck) })))
    : undefined;
  files?.sort((a, b) => a.name.localeCompare(b.name));
  return { ...info, name: isSealed(info.name) ? await openName(info.name, ck) : info.name, files };
}

type PageState = "loading" | "password" | "ready" | "error";

function mimeForFile(filename: string, bytes: Uint8Array): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    zip: "application/zip",
  };
  return map[ext] || sniffFileType(bytes)?.mime || "application/octet-stream";
}

const CHUNK_CONCURRENCY = 4;
const ZIP_FILE_CONCURRENCY = 3;

export default function FolderSharePage() {
  const t = useTranslations("tools");
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [info, setInfo] = useState<FolderShareInfo | null>(null);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // file_id currently downloading, or "all"
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);
  const [noticeMsg, setNoticeMsg] = useState("");

  // Initial load: needs the key from the fragment.
  useEffect(() => {
    if (!token) return;
    const k = keyFromFragment();
    if (!k) {
      // oxlint-disable-next-line react/set-state-in-effect
      setErrorMsg(t("pub.folder.missingKey"));
      setState("error");
      return;
    }
    setFolderKey(k);
    getFolderShareInfo(token)
      .then((data) => openShareName(data, k))
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setErrorMsg(data.reason || t("pub.folder.unavailable"));
          setState("error");
        } else if (data.has_password && !data.files) {
          setState("password");
        } else {
          setState("ready");
        }
      })
      .catch(() => {
        setErrorMsg(t("pub.folder.notFound"));
        setState("error");
      });
  }, [token, t]);

  const submitPassword = useCallback(async () => {
    if (!token || !password) return;
    setErrorMsg("");
    try {
      const data = await openShareName(await getFolderShareInfo(token, password), folderKey);
      if (data.files) {
        setInfo(data);
        setState("ready");
      } else {
        setErrorMsg(t("pub.folder.wrongPassword"));
      }
    } catch {
      setErrorMsg(t("pub.folder.wrongPassword"));
    }
  }, [token, password, folderKey, t]);

  const abortRef = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Download + decrypt one file (no save). The plaintext comes back as the parts
   * in order, with no joined copy, or is streamed to `disk` and comes back empty.
   */
  const fetchDecryptFile = useCallback(
    async (
      file: FolderShareFileEntry,
      signal: AbortSignal,
      disk?: DiskWritable,
    ): Promise<{ name: string; parts: Uint8Array[] }> => {
      if (!token || !folderKey) throw new Error(t("pub.folder.keyMissingShort"));
      const { unwrapKey, decryptChunk, fromBase64 } = await import("@/lib/crypto");
      const { getZstdCodec } = await import("@/lib/zstd");
      const zstd = await getZstdCodec();

      const meta = await getFolderShareFileMeta(token, file.file_id, password || undefined, signal);
      if (!meta.wrapped_cek) throw new Error(t("pub.folder.fileMissingKey"));

      // Unwrap this file's CEK with the folder-share key from the URL fragment.
      const fk = fromBase64(folderKey);
      const cek = await unwrapKey(fk.buffer.slice(0) as ArrayBuffer, fromBase64(meta.wrapped_cek));
      const keyBytes = cek.buffer.slice(0) as ArrayBuffer;
      const verifier = await createLinkVerifier(meta, keyBytes);

      let head: Uint8Array | undefined;
      const parts = await downloadChunks({
        count: meta.chunk_count,
        concurrency: CHUNK_CONCURRENCY,
        setProgress: () => {},
        stageLabel: () => "",
        signal,
        sink: disk
          ? async (d) => {
              head ??= d;
              verifier.update(d);
              await disk.write(d);
            }
          : undefined,
        fetchChunk: async (index, chunkSignal) => {
          const { data, compressed } = await getFolderShareChunk(
            token,
            file.file_id,
            index,
            password || undefined,
            meta.download_ticket,
            chunkSignal,
          );
          const plain = await decryptChunk(keyBytes, new Uint8Array(data));
          return compressed && zstd ? zstd.ZstdStream.decompress(plain) : plain;
        },
      });
      if (!disk) for (const p of parts) verifier.update(p);
      const sniff = head ?? parts[0] ?? new Uint8Array();

      const opened = await openName(meta.original_name, await keyFromBytes(fk));
      const name = resolveDownloadName(opened || file.name || "", sniff, "file");
      if (!verifier.ok()) throw new Error(t("pub.folder.integrityFailed", { name }));
      if (meta.download_ticket) {
        const ticket = meta.download_ticket;
        await confirmLinkDownload(
          (s) => completeFolderShareDownload(token, file.file_id, ticket, password || undefined, s),
          signal,
        );
      }
      return { name, parts };
    },
    [token, folderKey, password, t],
  );

  const handleDownloadOne = useCallback(
    async (file: FolderShareFileEntry) => {
      setErrorMsg("");
      const choice = await chooseDiskWriter(file.name || "download", file.size ?? 0);
      if (choice.kind === "cancelled") return;
      if (choice.kind === "unsupported") {
        setErrorMsg(tr("toasts.tooLargeDownload", { name: file.name || "" }));
        return;
      }
      const disk = choice.kind === "disk" ? choice.writer : undefined;
      const ctl = new AbortController();
      abortRef.current = ctl;
      setBusy(file.file_id);
      try {
        const { name, parts } = await fetchDecryptFile(file, ctl.signal, disk);
        if (disk) await disk.close();
        else saveBlob(name, new Blob(parts as BlobPart[], { type: mimeForFile(name, parts[0]) }));
      } catch (err) {
        await disk?.abort?.().catch(() => {});
        if (!isAbortError(err)) {
          const allowance = linkAllowanceKey(err);
          setErrorMsg(
            allowance ? t(allowance) : err instanceof Error ? err.message : t("pub.downloadFailed"),
          );
        }
      } finally {
        abortRef.current = null;
        setBusy(null);
      }
    },
    [fetchDecryptFile, t],
  );

  const handleDownloadAll = useCallback(async () => {
    if (!info?.files) return;
    setErrorMsg("");
    setNoticeMsg("");
    const manifest = await pathManifestFromFragment();
    const entriesIn = info.files.map((f) => ({
      fileId: f.file_id,
      filename: f.name || f.file_id,
      fileSize: f.size ?? 0,
      path: manifest[f.file_id] || "",
    }));
    const refusal = zipRefusal(entriesIn);
    if (refusal) {
      setErrorMsg(refusal);
      return;
    }
    const totalSize = entriesIn.reduce((sum, f) => sum + f.fileSize, 0);
    const zipName = `${(info.name || "shared-folder").replace(/[/\\]/g, "_")}.zip`;
    const choice: DiskChoice = await chooseDiskWriter(zipName, totalSize);
    if (choice.kind === "cancelled") return;
    if (
      choice.kind === "unsupported" ||
      (choice.kind === "memory" && totalSize > ZIP_IN_MEMORY_MAX_BYTES)
    ) {
      setErrorMsg(tr("toasts.zipTooLarge"));
      return;
    }
    const disk = choice.kind === "disk" ? choice.writer : undefined;
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy("all");
    setZipProgress({ done: 0, total: info.files.length });

    const { Zip, ZipPassThrough } = await import("fflate");
    const outParts: Uint8Array[] = [];
    let pending: Promise<void> = Promise.resolve();
    let zipError: Error | null = null;
    const zip = new Zip((err, chunk) => {
      if (err) zipError ??= err;
      else if (disk) pending = pending.then(() => disk.write(chunk));
      else outParts.push(chunk);
    });
    const used = new Set<string>();
    const failed: string[] = [];
    let added = 0;

    const uniqueEntry = (entry: string) => {
      if (!used.has(entry)) return entry;
      const slash = entry.lastIndexOf("/") + 1;
      const dot = entry.lastIndexOf(".");
      const hasExt = dot > slash;
      const stem = hasExt ? entry.slice(0, dot) : entry;
      const ext = hasExt ? entry.slice(dot) : "";
      let n = 1;
      while (used.has(`${stem} (${n})${ext}`)) n++;
      return `${stem} (${n})${ext}`;
    };

    try {
      await runWithConcurrency(
        info.files.length,
        ZIP_FILE_CONCURRENCY,
        async (i) => {
          const f = info.files![i];
          try {
            if ((f.size ?? 0) > ZIP_ENTRY_MAX_BYTES) throw new Error(tr("l10n.zip.overLimit"));
            const { name, parts } = await fetchDecryptFile(f, ctl.signal);
            const entry = uniqueEntry(
              zipEntryName({ filename: name || f.file_id, path: manifest[f.file_id] }),
            );
            used.add(entry);
            const zf = new ZipPassThrough(entry);
            zip.add(zf);
            if (parts.length === 0) zf.push(new Uint8Array(), true);
            parts.forEach((p, k) => zf.push(p, k === parts.length - 1));
            await pending;
            added++;
          } catch (err) {
            if (isAbortError(err)) throw err;
            failed.push(f.name || f.file_id);
          } finally {
            setZipProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        },
        ctl.signal,
      );

      if (ctl.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (added === 0) {
        throw new Error(t("pub.folder.noneDownloaded", { count: info.files.length }));
      }
      zip.end();
      await pending;
      if (zipError) throw zipError;
      if (disk) await disk.close();
      else saveBlob(zipName, new Blob(outParts as BlobPart[], { type: "application/zip" }));

      if (failed.length > 0) {
        const shown = failed.slice(0, 4).join(", ");
        const more =
          failed.length > 4 ? ` ${t("pub.folder.andMore", { count: failed.length - 4 })}` : "";
        setNoticeMsg(
          t("pub.folder.partial", {
            ok: added,
            total: info.files.length,
            names: `${shown}${more}`,
          }),
        );
      }
    } catch (err) {
      zip.terminate();
      await disk?.abort?.().catch(() => {});
      if (!isAbortError(err)) {
        setErrorMsg(err instanceof Error ? err.message : t("pub.downloadFailed"));
      }
    } finally {
      abortRef.current = null;
      setBusy(null);
      setZipProgress(null);
    }
  }, [info, fetchDecryptFile, t]);

  return (
    <div className="w-full max-w-lg animate-fade-in">
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
          <Shield className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <span className="font-heading text-xl font-bold tracking-tight text-[var(--color-text)]">
          zcrypt
        </span>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <LogoSpinner />
            <p className="text-sm text-[var(--color-text-secondary)]">{t("pub.folder.loading")}</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {t("pub.folder.cantOpen")}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">{errorMsg}</p>
          </div>
        )}

        {state === "password" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {t("pub.folder.protected")}
              </p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              placeholder={t("pub.folder.passwordPlaceholder")}
              autoFocus
            />
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <Button onClick={submitPassword} disabled={!password} className="w-full">
              {t("pub.folder.unlock")}
            </Button>
          </div>
        )}

        {state === "ready" && info && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-[var(--color-text)]">
                  {info.name || t("pub.folder.sharedFolder")}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t("pub.folder.summary", { count: info.files?.length ?? 0 })}
                </p>
              </div>
            </div>

            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {info.files?.map((f) => (
                <li
                  key={f.file_id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--color-surface-1)]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                    <span className="truncate text-sm text-[var(--color-text)]">
                      {f.name || t("pub.folder.unnamedFile")}
                    </span>
                    {typeof f.size === "number" && (
                      <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                        {formatBytes(f.size)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownloadOne(f)}
                    disabled={busy !== null}
                    aria-label={t("pub.folder.downloadFile")}
                  >
                    {busy === f.file_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>

            {busy !== null && (
              <Button variant="secondary" size="sm" onClick={cancel} className="w-full">
                {t("common.cancel")}
              </Button>
            )}

            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            {noticeMsg && (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                {noticeMsg}
              </p>
            )}

            {info.files?.some((f) => !f.name) && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {t("pub.folder.namesGuessed")}
              </p>
            )}

            {(info.files?.length ?? 0) > 1 && (
              <Button onClick={handleDownloadAll} disabled={busy !== null} className="w-full">
                {busy === "all" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                    {zipProgress
                      ? t("pub.folder.preparingZipN", {
                          done: zipProgress.done,
                          total: zipProgress.total,
                        })
                      : t("pub.folder.preparingZip")}
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> {t("pub.folder.downloadAll")}
                  </>
                )}
              </Button>
            )}

            <p className="text-center text-[11px] text-[var(--color-text-muted)]">
              {t("pub.folder.decryptNote")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
