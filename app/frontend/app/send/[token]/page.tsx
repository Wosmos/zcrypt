"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSendInfo, getSendMeta, getSendChunk } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Shield, Send, Download, AlertTriangle, Eye, Clock,
} from "@/lib/icons";
import { formatBytes, saveBlob } from "@/lib/utils";
import { keyFromFragment } from "@/lib/share-link";
import {
  ViewerCard,
  ViewerLoading,
  ViewerError,
  ViewerIncompleteLink,
  TokenFileHeader,
  ViewerDecryptProgress,
  PreviewHeader,
  MediaPreview,
  DownloadCompletePanel,
} from "@/components/tokens/viewer";
import { formatShortExpiry as formatExpiry } from "@/components/tokens/token-layout";
import type { SendInfo } from "@/types";

type PageState =
  | "loading"
  | "ready"
  | "decrypting"
  | "preview"
  | "done"
  | "error";

function getPreviewType(filename: string): "image" | "video" | "audio" | "none" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov"].includes(ext)) return "video";
  if (["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "none";
}

function getMimeType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon",
    mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", m4a: "audio/mp4",
  };
  return map[ext];
}

export default function SendDownloadPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<SendInfo | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  // Extract key from fragment on mount
  useEffect(() => {
    setEncryptionKey(keyFromFragment());
  }, []);

  // Fetch send info
  useEffect(() => {
    if (!token) return;
    getSendInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setPageState("error");
          setErrorMsg(data.reason || "This link is no longer valid");
        } else {
          setPageState("ready");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg("Link not found");
      });
  }, [token]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const decryptFile = useCallback(async (): Promise<{ blob: Blob; originalName: string } | null> => {
    if (!token || !encryptionKey) return null;

    const { deriveKeyBytes, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
    const { getDeviceProfile } = await import("@/lib/device-profile");

    setProgress({ stage: "Fetching metadata...", percent: 0 });
    const meta = await getSendMeta(token);

    setProgress({ stage: "Deriving key...", percent: 1 });
    const salt = fromBase64(meta.salt);
    const keyBytes = await deriveKeyBytes(encryptionKey, salt);

    const decryptedChunks: Uint8Array[] = new Array(meta.chunk_count);
    let chunksDone = 0;
    const MAX_CONCURRENT = getDeviceProfile().maxConcurrentDownloads;

    const processChunk = async (index: number) => {
      const res = await getSendChunk(token, index);
      const encrypted = new Uint8Array(res.data);

      let plaintext: Uint8Array;
      try {
        plaintext = await decryptChunk(keyBytes, encrypted);
      } catch {
        throw new Error("Decryption failed — the link may be incomplete or corrupted");
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

    const originalName = info?.file_name || "download";
    const mime = getMimeType(originalName) || "application/octet-stream";
    const blob = new Blob([fullFile], { type: mime });
    return { blob, originalName };
  }, [token, encryptionKey, info]);

  // Shared entry-point wrapper for both actions below: guard the key, flip to
  // the decrypting state, run decryptFile(), and report any failure. Only what
  // happens with a successful result differs.
  const runDecrypt = useCallback(
    async (onSuccess: (blob: Blob, originalName: string) => void, fallbackMsg: string) => {
      if (!token || !encryptionKey) return;
      setPageState("decrypting");
      setErrorMsg("");

      try {
        const result = await decryptFile();
        if (!result) return;
        onSuccess(result.blob, result.originalName);
      } catch (err) {
        setPageState("error");
        setErrorMsg(err instanceof Error ? err.message : fallbackMsg);
      }
    },
    [token, encryptionKey, decryptFile]
  );

  const handleDecryptAndPreview = useCallback(
    () =>
      runDecrypt((blob, originalName) => {
        setDecryptedBlob(blob);
        setFileName(originalName);

        const pType = getPreviewType(originalName);
        if (pType !== "none") {
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
          const url = URL.createObjectURL(blob);
          prevUrlRef.current = url;
          setPreviewUrl(url);
        }

        setPageState("preview");
      }, "Decryption failed"),
    [runDecrypt]
  );

  const handleDirectDownload = useCallback(
    () =>
      runDecrypt((blob, originalName) => {
        saveBlob(originalName, blob);
        setPageState("done");
        setFileName(originalName);
      }, "Download failed"),
    [runDecrypt]
  );

  const handleSaveToDevice = useCallback(() => {
    if (!decryptedBlob) return;
    saveBlob(fileName || info?.file_name || "download", decryptedBlob);
  }, [decryptedBlob, fileName, info]);

  const previewType = info ? getPreviewType(info.file_name) : "none";
  const isPreviewable = previewType !== "none";
  const noKey = pageState === "ready" && !encryptionKey;

  return (
    <div className="w-full max-w-lg animate-fade-in">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
          <Send className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <span className="text-xl font-bold font-heading tracking-tight">zcrypt Send</span>
      </div>

      <ViewerCard>
        {pageState === "loading" && <ViewerLoading message="Loading..." />}

        {pageState === "error" && (
          <ViewerError title="Unavailable" message={errorMsg} />
        )}

        {pageState === "ready" && info && noKey && <ViewerIncompleteLink />}

        {pageState === "ready" && info && !noKey && (
          <>
            <TokenFileHeader fileName={info.file_name} fileSize={info.file_size} previewType={previewType} />

            <div className="p-6 space-y-4">
              {/* Info badges */}
              <div className="flex flex-wrap gap-2 text-[10px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Clock className="h-3 w-3" />
                  Expires in {formatExpiry(info.expires_at)}
                </span>
                {info.burn_after_read && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    Burns after download
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Shield className="h-3 w-3" />
                  E2E encrypted
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                {isPreviewable ? (
                  <>
                    <Button onClick={handleDecryptAndPreview} className="flex-1">
                      <Eye className="h-4 w-4 mr-2" />
                      Decrypt &amp; Preview
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleDirectDownload}
                      className="flex-shrink-0"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleDirectDownload} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download &amp; Decrypt
                  </Button>
                )}
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  This file is end-to-end encrypted. Decryption happens entirely in your browser — the server never sees your data.
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
            <PreviewHeader name={fileName || info.file_name} onSave={handleSaveToDevice} />

            {/* Preview content */}
            <MediaPreview
              previewType={previewType}
              previewUrl={previewUrl}
              name={fileName || info.file_name}
              onSave={handleSaveToDevice}
            />

            {/* Bottom bar */}
            <div className="px-5 py-3 border-t border-[var(--color-border)]">
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {formatBytes(info.file_size)} &middot; Decrypted in browser
              </p>
            </div>
          </>
        )}

        {pageState === "done" && <DownloadCompletePanel fileName={fileName} />}
      </ViewerCard>

      {/* Footer */}
      <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-6">
        Sent via <span className="font-semibold">zcrypt</span> &middot; Private encrypted file sharing
      </p>
    </div>
  );
}
