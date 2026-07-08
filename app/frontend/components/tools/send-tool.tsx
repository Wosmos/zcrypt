"use client";

import { useCallback, useRef, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Lock, Copy, Check, Clock, Link2, File,
  AlertTriangle, CheckCircle2, Upload,
} from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";
import { sendInit, sendChunkUpload, sendComplete } from "@/lib/api";
import { QRShare } from "@/components/ui/qr-code";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type SendState = "idle" | "uploading" | "done" | "error";

interface ExpiryOption { label: string; hours: number }

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
];

export function SendTool() {
  const [state, setState] = useState<SendState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(false);

  const handleFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg(`File too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_FILE_SIZE)} for anonymous sends.`);
      setState("error");
      return;
    }
    setSelectedFile(file);
    setErrorMsg("");
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    abortRef.current = false;
    setState("uploading");
    setErrorMsg("");

    try {
      const { generateSalt, deriveKeyBytes, encryptChunk, sha256File, sha256Hex, toBase64, CHUNK_SIZE: CS } = await import("@/lib/crypto");

      setProgress({ stage: "Hashing file...", percent: 1 });
      const fileHash = await sha256File(selectedFile);

      setProgress({ stage: "Generating encryption key...", percent: 2 });
      const randomKey = crypto.getRandomValues(new Uint8Array(32));
      const keyPassphrase = toBase64(randomKey);
      const salt = generateSalt();
      const keyBytes = await deriveKeyBytes(keyPassphrase, salt);

      const chunkCount = Math.ceil(selectedFile.size / CS);

      setProgress({ stage: "Starting upload session...", percent: 3 });
      const session = await sendInit({
        filename: selectedFile.name,
        original_size: selectedFile.size,
        sha256: fileHash,
        salt: toBase64(salt),
        chunk_count: chunkCount,
        burn_after_read: burnAfterRead,
        expires_hours: expiryHours,
      });

      if (abortRef.current) return;

      for (let i = 0; i < chunkCount; i++) {
        if (abortRef.current) return;
        const start = i * CS;
        const end = Math.min(start + CS, selectedFile.size);
        const slice = selectedFile.slice(start, end);
        const plaintext = new Uint8Array(await slice.arrayBuffer());

        setProgress({ stage: `Encrypting chunk ${i + 1}/${chunkCount}...`, percent: 3 + Math.round((i / chunkCount) * 42) });
        const encrypted = await encryptChunk(keyBytes, plaintext);
        const chunkHash = await sha256Hex(encrypted);

        setProgress({ stage: `Uploading chunk ${i + 1}/${chunkCount}...`, percent: 45 + Math.round((i / chunkCount) * 47) });
        await sendChunkUpload(session.session_id, i, encrypted, chunkHash, false);
      }

      if (abortRef.current) return;

      setProgress({ stage: "Finalizing...", percent: 95 });
      await sendComplete(session.session_id);

      const url = `${window.location.origin}/send/${session.token}#key=${keyPassphrase}`;
      setShareUrl(url);
      setProgress({ stage: "Done!", percent: 100 });
      setState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setErrorMsg(msg);
      setState("error");
    }
  }, [selectedFile, burnAfterRead, expiryHours]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleReset = useCallback(() => {
    abortRef.current = true;
    setState("idle");
    setSelectedFile(null);
    setShareUrl("");
    setProgress({ stage: "", percent: 0 });
    setErrorMsg("");
    setCopied(false);
  }, []);

  return (
    <div className="panel overflow-hidden">
      {state === "idle" && !selectedFile && (
        <div className="p-6">
          <UploadZone
            onFiles={handleFiles}
            hint={`Up to ${formatBytes(MAX_FILE_SIZE)}. Files are encrypted in your browser before upload.`}
          />
        </div>
      )}

      {state === "idle" && selectedFile && (
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-1)]">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[var(--color-accent)]/10 flex-shrink-0">
              <File className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(selectedFile.size)}</p>
            </div>
            <button onClick={() => setSelectedFile(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
              Change
            </button>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                <Clock className="h-3.5 w-3.5" /> Expires after
              </label>
              <div className="flex gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button key={opt.hours} onClick={() => setExpiryHours(opt.hours)}
                    className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                      expiryHours === opt.hours
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] text-[var(--color-text-muted)]"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-pointer transition-colors">
              <Switch checked={burnAfterRead} onCheckedChange={setBurnAfterRead} />
              <div>
                <p className="text-sm font-medium">Burn after read</p>
                <p className="text-xs text-[var(--color-text-muted)]">File is deleted after first download</p>
              </div>
            </label>
          </div>
          <Button onClick={handleUpload} className="w-full">
            <Lock className="h-4 w-4 mr-2" /> Encrypt &amp; Send
          </Button>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-cyan-700 dark:text-cyan-300">
              Your file is encrypted in your browser before upload. The encryption key is embedded in the share link — the server never sees your data.
            </p>
          </div>
        </div>
      )}

      {state === "uploading" && selectedFile && (
        <>
          <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 flex-shrink-0">
                <LogoSpinner size={24} speed="fast" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedFile.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(selectedFile.size)}</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)]">{progress.stage}</span>
                <span className="font-medium tabular-nums">{easeProgress(progress.percent)}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-in-out" style={{ width: `${easeProgress(progress.percent)}%` }} />
              </div>
            </div>
          </div>
        </>
      )}

      {state === "done" && (
        <div className="p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
              <CheckCircle2 className="h-6 w-6 text-cyan-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">File Encrypted &amp; Uploaded</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Share this link. The recipient can download and decrypt in their browser.</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              <Link2 className="h-3.5 w-3.5" /> Share Link
            </label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-mono break-all select-all leading-relaxed">{shareUrl}</div>
              <IconButton
                icon={copied ? Check : Copy}
                label={copied ? "Copied" : "Copy link"}
                variant="secondary"
                onClick={handleCopy}
                className="flex-shrink-0 self-start"
                iconClassName={copied ? "h-4 w-4 text-cyan-500" : "h-4 w-4"}
              />
            </div>
          </div>
          <QRShare url={shareUrl} />
          <div className="flex gap-2 text-[10px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
              <Clock className="h-3 w-3" /> Expires in {EXPIRY_OPTIONS.find(o => o.hours === expiryHours)?.label || `${expiryHours}h`}
            </span>
            {burnAfterRead && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                <AlertTriangle className="h-3 w-3" /> Burns after read
              </span>
            )}
            <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
              <Shield className="h-3 w-3" /> E2E encrypted
            </span>
          </div>
          <Button variant="secondary" onClick={handleReset} className="w-full">
            <Upload className="h-4 w-4 mr-2" /> Send Another File
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="p-6">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Upload Failed</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs">{errorMsg}</p>
            </div>
            <Button variant="secondary" onClick={handleReset} className="mt-2">Try Again</Button>
          </div>
        </div>
      )}
    </div>
  );
}
