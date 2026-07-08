"use client";

import { useCallback, useRef, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Lock, Upload } from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { sendInit, sendChunkUpload, sendComplete } from "@/lib/api";
import { SelectedFileCard } from "./shared/selected-file-card";
import { ExpirySelector } from "./shared/expiry-selector";
import { BurnAfterReadToggle } from "./shared/burn-after-read-toggle";
import { ProgressBar } from "./shared/progress-bar";
import { ShareResult } from "./shared/share-result";
import { ToolErrorState } from "./shared/tool-states";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type SendState = "idle" | "uploading" | "done" | "error";

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
    await copyToClipboard(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <SelectedFileCard
            name={selectedFile.name}
            size={selectedFile.size}
            onRemove={() => setSelectedFile(null)}
          />
          <div className="space-y-3">
            <ExpirySelector value={expiryHours} onChange={setExpiryHours} />
            <BurnAfterReadToggle
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
              description="File is deleted after first download"
            />
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
            <ProgressBar
              stage={progress.stage}
              percent={easeProgress(progress.percent)}
              transitionClassName="transition-all duration-500 ease-in-out"
            />
          </div>
        </>
      )}

      {state === "done" && (
        <ShareResult
          title="File Encrypted &amp; Uploaded"
          subtitle="Share this link. The recipient can download and decrypt in their browser."
          shareUrl={shareUrl}
          copied={copied}
          onCopy={handleCopy}
          expiryHours={expiryHours}
          burnAfterRead={burnAfterRead}
          resetIcon={Upload}
          resetLabel="Send Another File"
          onReset={handleReset}
        />
      )}

      {state === "error" && (
        <ToolErrorState title="Upload Failed" message={errorMsg} onAction={handleReset} wrapped />
      )}
    </div>
  );
}
