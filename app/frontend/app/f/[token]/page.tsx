"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getFolderShareInfo,
  getFolderShareFileMeta,
  getFolderShareChunk,
  type FolderShareInfo,
  type FolderShareFileEntry,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { FolderOpen, File as FileIcon, Download, Lock, AlertTriangle, Loader2, Shield } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";

type PageState = "loading" | "password" | "ready" | "error";

/** Extract the base64 folder-share key from the URL fragment (#key=...). */
function keyFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/key=([A-Za-z0-9+/=]+)/);
  return match ? match[1] : null;
}

function mimeForFile(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf", txt: "text/plain", mp4: "video/mp4", mp3: "audio/mpeg", zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

export default function FolderSharePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [info, setInfo] = useState<FolderShareInfo | null>(null);
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // file_id currently downloading, or "all"

  // Initial load: needs the key from the fragment.
  useEffect(() => {
    if (!token) return;
    const k = keyFromFragment();
    if (!k) {
      setErrorMsg("This link is missing its decryption key. Make sure you copied the whole URL.");
      setState("error");
      return;
    }
    setFolderKey(k);
    getFolderShareInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setErrorMsg(data.reason || "This link is no longer available.");
          setState("error");
        } else if (data.has_password && !data.files) {
          setState("password");
        } else {
          setState("ready");
        }
      })
      .catch(() => {
        setErrorMsg("Folder link not found.");
        setState("error");
      });
  }, [token]);

  const submitPassword = useCallback(async () => {
    if (!token || !password) return;
    setErrorMsg("");
    try {
      const data = await getFolderShareInfo(token, password);
      if (data.files) {
        setInfo(data);
        setState("ready");
      } else {
        setErrorMsg("Incorrect password.");
      }
    } catch {
      setErrorMsg("Incorrect password.");
    }
  }, [token, password]);

  /** Download + decrypt one file, then save it to disk. */
  const downloadFile = useCallback(
    async (file: FolderShareFileEntry) => {
      if (!token || !folderKey) return;
      const { unwrapKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
      const { getZstdCodec } = await import("@/lib/zstd");
      const zstd = await getZstdCodec();

      const meta = await getFolderShareFileMeta(token, file.file_id, password || undefined);
      if (!meta.wrapped_cek) throw new Error("This file is missing its key.");

      // Unwrap this file's CEK with the folder-share key from the URL fragment.
      const fk = fromBase64(folderKey);
      const cek = await unwrapKey(fk.buffer.slice(0) as ArrayBuffer, fromBase64(meta.wrapped_cek));
      const keyBytes = cek.buffer.slice(0) as ArrayBuffer;

      const parts: Uint8Array[] = new Array(meta.chunk_count);
      for (let i = 0; i < meta.chunk_count; i++) {
        const { data, compressed } = await getFolderShareChunk(token, file.file_id, i, password || undefined);
        let plain = await decryptChunk(keyBytes, new Uint8Array(data));
        if (compressed && zstd) plain = zstd.ZstdStream.decompress(plain);
        parts[i] = plain;
      }

      const total = parts.reduce((s, c) => s + c.byteLength, 0);
      const full = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        full.set(p, off);
        off += p.byteLength;
      }
      if ((await sha256Hex(full)) !== meta.sha256) {
        throw new Error("Integrity check failed for " + meta.original_name);
      }

      const blob = new Blob([full], { type: mimeForFile(meta.original_name) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [token, folderKey, password]
  );

  const handleDownloadOne = useCallback(
    async (file: FolderShareFileEntry) => {
      setErrorMsg("");
      setBusy(file.file_id);
      try {
        await downloadFile(file);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Download failed");
      } finally {
        setBusy(null);
      }
    },
    [downloadFile]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!info?.files) return;
    setErrorMsg("");
    setBusy("all");
    try {
      for (const f of info.files) {
        await downloadFile(f);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }, [info, downloadFile]);

  return (
    <div className="w-full max-w-lg animate-fade-in">
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)]/10">
          <Shield className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <span className="font-heading text-xl font-bold tracking-tight text-[var(--color-text)]">zcrypt</span>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        {state === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <LogoSpinner />
            <p className="text-sm text-[var(--color-text-secondary)]">Loading shared folder…</p>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-[var(--color-text)]">Can’t open this folder</p>
            <p className="text-sm text-[var(--color-text-secondary)]">{errorMsg}</p>
          </div>
        )}

        {state === "password" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <Lock className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-[var(--color-text)]">This folder is password-protected</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
              placeholder="Enter password"
              autoFocus
            />
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
            <Button onClick={submitPassword} disabled={!password} className="w-full">
              Unlock
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
                  {info.name || "Shared folder"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {info.files?.length ?? 0} file{(info.files?.length ?? 0) === 1 ? "" : "s"} · end-to-end encrypted
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
                    <span className="truncate text-sm text-[var(--color-text)]">{f.name || f.file_id}</span>
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

            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

            {(info.files?.length ?? 0) > 1 && (
              <Button onClick={handleDownloadAll} disabled={busy !== null} className="w-full">
                {busy === "all" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> Download all
                  </>
                )}
              </Button>
            )}

            <p className="text-center text-[11px] text-[var(--color-text-muted)]">
              Decryption happens in your browser. The key never leaves this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
