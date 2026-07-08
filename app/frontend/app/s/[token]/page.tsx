"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getShareInfo, getShareFileMeta, getShareChunk } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Lock, Download, File, CheckCircle2, Eye } from "@/lib/icons";
import { formatBytes, saveBlob, concatChunks, extOf } from "@/lib/utils";
import { keyFromFragment } from "@/lib/share-link";
import {
  ViewerCard,
  ViewerLoading,
  ViewerError,
  ViewerDecryptProgress,
  MediaPreview,
} from "@/components/tokens/viewer";
import type { ShareInfo } from "@/types";

type PageState =
  | "loading"
  | "ready"        // show credential form
  | "decrypting"   // decrypting the file
  | "preview"      // showing preview + download button
  | "downloading"  // saving to disk (already decrypted)
  | "done"
  | "error";

function getPreviewType(filename: string): "image" | "video" | "audio" | "none" {
  const ext = extOf(filename);
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "none";
}

function getMimeType(filename: string): string | undefined {
  const ext = extOf(filename);
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon",
    mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", m4a: "audio/mp4",
  };
  return map[ext];
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  // The decryption key comes from the URL fragment, never typed by the user.
  const [shareKey, setShareKey] = useState<string | null>(null);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // The share key lives in the URL fragment; without it the file can't be
    // decrypted no matter what, so surface that immediately.
    const key = keyFromFragment();
    setShareKey(key);

    getShareInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setPageState("error");
          setErrorMsg(data.reason || "This share link is no longer valid");
        } else if (!key) {
          setPageState("error");
          setErrorMsg("This link is missing its decryption key. Make sure you copied the full URL, including the part after #.");
        } else {
          setPageState("ready");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg("Share link not found");
      });
  }, [token]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const decryptFile = useCallback(async (): Promise<{ blob: Blob; originalName: string } | null> => {
    if (!token || !shareKey) return null;

    const { unwrapKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
    const { getZstdCodec } = await import("@/lib/zstd");
    const { getDeviceProfile } = await import("@/lib/device-profile");
    const zstd = await getZstdCodec();

    setProgress({ stage: "Fetching metadata...", percent: 0 });
    const meta = await getShareFileMeta(token, sharePassword || undefined);

    // Unwrap the file's CEK using the share key from the URL fragment.
    setProgress({ stage: "Unwrapping key...", percent: 1 });
    if (!meta.wrapped_cek) {
      throw new Error("This share is missing its encryption key and cannot be decrypted.");
    }
    let keyBytes: ArrayBuffer;
    try {
      const sk = fromBase64(shareKey);
      const cek = await unwrapKey(sk.buffer.slice(0) as ArrayBuffer, fromBase64(meta.wrapped_cek));
      keyBytes = cek.buffer.slice(0) as ArrayBuffer;
    } catch {
      throw new Error("Invalid share key — the link may be incomplete or corrupt.");
    }

    const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
    let chunksDone = 0;
    const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;

    const processChunk = async (index: number) => {
      const { data, compressed } = await getShareChunk(token, index, sharePassword || undefined);
      const encrypted = new Uint8Array(data);

      let plaintext: Uint8Array;
      try {
        plaintext = await decryptChunk(keyBytes, encrypted);
      } catch {
        throw new Error("Decryption failed — the share link may be incomplete.");
      }

      if (compressed && zstd) {
        plaintext = zstd.ZstdStream.decompress(plaintext);
      }

      decryptedChunks[index] = plaintext;
      chunksDone++;
      const percent = 2 + Math.round((chunksDone / meta.chunk_count) * 90);
      setProgress({ stage: `Decrypting ${chunksDone}/${meta.chunk_count}`, percent });
    };

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

    setProgress({ stage: "Verifying integrity...", percent: 93 });
    const fullFile = concatChunks(decryptedChunks);

    // 'hmac_v1' files store a per-user KEYED MAC that only the owner (who holds
    // the vault passphrase) can recompute. A public share recipient has no
    // passphrase, so the file-level compare is impossible — skip it and rely on
    // the per-chunk AES-GCM auth tags. Legacy 'plain'/undefined files still verify.
    if (meta.sha256_scheme !== "hmac_v1") {
      const actualHash = await sha256Hex(fullFile);
      if (actualHash !== meta.sha256) {
        throw new Error("File integrity check failed — SHA-256 mismatch");
      }
    }

    const mime = getMimeType(meta.original_name) || "application/octet-stream";
    const blob = new Blob([fullFile as BlobPart], { type: mime });
    return { blob, originalName: meta.original_name };
  }, [token, shareKey, sharePassword]);

  const handleDecryptAndPreview = useCallback(async () => {
    if (!token || !shareKey) return;
    setPageState("decrypting");
    setErrorMsg("");

    try {
      const result = await decryptFile();
      if (!result) return;

      const { blob, originalName } = result;
      setDecryptedBlob(blob);
      setFileName(originalName);

      // Create preview URL for previewable types
      const pType = getPreviewType(originalName);
      if (pType !== "none") {
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setPreviewUrl(url);
      }

      setPageState("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Decryption failed";
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("unauthorized")) {
        setPageState("ready");
        setErrorMsg("Incorrect share password.");
        setSharePassword("");
      } else {
        setPageState("error");
        setErrorMsg(msg);
      }
    }
  }, [token, shareKey, decryptFile]);

  const handleSaveToDevice = useCallback(() => {
    if (!decryptedBlob) return;
    saveBlob(fileName || info?.file_name || "download", decryptedBlob);
  }, [decryptedBlob, fileName, info]);

  // Direct download (for non-previewable files, or from the ready state)
  const handleDirectDownload = useCallback(async () => {
    if (!token || !shareKey) return;
    setPageState("decrypting");
    setErrorMsg("");

    try {
      const result = await decryptFile();
      if (!result) return;

      const { blob, originalName } = result;
      saveBlob(originalName, blob);

      setPageState("done");
      setFileName(originalName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      if (msg.toLowerCase().includes("password") || msg.toLowerCase().includes("unauthorized")) {
        setPageState("ready");
        setErrorMsg("Incorrect share password.");
        setSharePassword("");
      } else {
        setPageState("error");
        setErrorMsg(msg);
      }
    }
  }, [token, shareKey, decryptFile]);

  const previewType = info ? getPreviewType(info.file_name) : "none";
  const isPreviewable = previewType !== "none";

  return (
    <div className="w-full max-w-lg animate-fade-in">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
          <Shield className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <span className="text-xl font-bold font-heading tracking-tight">zcrypt</span>
      </div>

      <ViewerCard>
        {pageState === "loading" && (
          <ViewerLoading message="Loading share info..." />
        )}

        {pageState === "error" && (
          <ViewerError title="Link Unavailable" message={errorMsg} />
        )}

        {pageState === "ready" && info && (
          <>
            {/* File info header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 flex-shrink-0">
                  <File className="h-6 w-6 text-[var(--color-accent)]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{info.file_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {formatBytes(info.file_size)}
                    {isPreviewable && (
                      <span className="ml-1.5 text-[var(--color-accent)]">
                        &middot; {previewType === "image" ? "Image" : previewType === "video" ? "Video" : "Audio"} preview available
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Share password (only if required) */}
              {info.has_password && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-secondary)]">Share Password</label>
                  <Input
                    type="password"
                    placeholder="Enter share password"
                    value={sharePassword}
                    onChange={(e) => { setSharePassword(e.target.value); setErrorMsg(""); }}
                    icon={<Lock className="h-4 w-4" />}
                  />
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-500 font-medium">{errorMsg}</p>
              )}

              {/* Action buttons. The decryption key comes from the link
                  fragment, so no passphrase is needed — only the optional
                  share password gates these. */}
              <div className="flex gap-2">
                {isPreviewable ? (
                  <>
                    <Button
                      onClick={handleDecryptAndPreview}
                      disabled={info.has_password && !sharePassword}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Decrypt &amp; Preview
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleDirectDownload}
                      disabled={info.has_password && !sharePassword}
                      className="flex-shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleDirectDownload}
                    disabled={info.has_password && !sharePassword}
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download &amp; Decrypt
                  </Button>
                )}
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  This file is end-to-end encrypted. The decryption key is in this link and never reaches our servers — decryption happens entirely in your browser.
                </p>
              </div>
            </div>
          </>
        )}

        {pageState === "decrypting" && info && (
          <ViewerDecryptProgress
            fileName={info.file_name}
            fileSize={info.file_size}
            stage={progress.stage}
            percent={progress.percent}
          />
        )}

        {pageState === "preview" && info && (
          <>
            {/* Preview header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
                <p className="text-sm font-semibold truncate">{fileName || info.file_name}</p>
              </div>
              <button
                onClick={handleSaveToDevice}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors flex-shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                Save
              </button>
            </div>

            {/* Preview content */}
            <MediaPreview
              previewType={previewType}
              previewUrl={previewUrl}
              name={fileName || info.file_name}
              onSave={handleSaveToDevice}
            />

            {/* Bottom bar */}
            <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {formatBytes(info.file_size)} &middot; Decrypted in browser
              </p>
              <button
                onClick={() => {
                  if (prevUrlRef.current) {
                    URL.revokeObjectURL(prevUrlRef.current);
                    prevUrlRef.current = null;
                  }
                  setPreviewUrl(null);
                  setDecryptedBlob(null);
                  setPageState("ready");
                }}
                className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
              >
                Close preview
              </button>
            </div>
          </>
        )}

        {pageState === "done" && (
          <div className="p-6">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
                <CheckCircle2 className="h-6 w-6 text-cyan-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Download Complete</h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {fileName || "File"} decrypted and saved to your device.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setPageState("ready");
                }}
                className="mt-2"
              >
                Download Again
              </Button>
            </div>
          </div>
        )}
      </ViewerCard>

      {/* Footer */}
      <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-6">
        Powered by <span className="font-semibold">zcrypt</span> &middot; Zero-knowledge encrypted storage
      </p>
    </div>
  );
}
