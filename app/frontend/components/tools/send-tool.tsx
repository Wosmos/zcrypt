"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Lock, Upload } from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";
import { sendInit, SendInitError, sendChunkUpload, sendComplete } from "@/lib/api";
import { sealText, keyFromBytes } from "@/lib/sealed";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { SelectedFileCard } from "./shared/selected-file-card";
import { ExpirySelector } from "./shared/expiry-selector";
import { BurnAfterReadToggle } from "./shared/burn-after-read-toggle";
import { ProgressBar } from "./shared/progress-bar";
import { ShareResult } from "./shared/share-result";
import { ToolErrorState } from "./shared/tool-states";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type SendState = "idle" | "uploading" | "done" | "error";

export function SendTool() {
  const t = useTranslations("tools");
  const [state, setState] = useState<SendState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [shareUrl, setShareUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const { copied, handleCopy, reset } = useCopyFeedback(shareUrl);
  const abortRef = useRef(false);

  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) {
        setErrorMsg(
          t("send.sizeError", { size: formatBytes(file.size), max: formatBytes(MAX_FILE_SIZE) }),
        );
        setState("error");
        return;
      }
      setSelectedFile(file);
      setErrorMsg("");
    },
    [t],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    abortRef.current = false;
    setState("uploading");
    setErrorMsg("");

    try {
      const {
        generateSalt,
        deriveKeyBytes,
        encryptChunk,
        sha256File,
        sha256Hex,
        toBase64,
        CHUNK_SIZE: CS,
      } = await import("@/lib/crypto");

      setProgress({ stage: t("send.hashing"), percent: 1 });
      const fileHash = await sha256File(selectedFile);

      setProgress({ stage: t("send.keygen"), percent: 2 });
      const randomKey = crypto.getRandomValues(new Uint8Array(32));
      const keyPassphrase = toBase64(randomKey);
      const salt = generateSalt();
      const keyBytes = await deriveKeyBytes(keyPassphrase, salt);

      const chunkCount = Math.ceil(selectedFile.size / CS);

      setProgress({ stage: t("send.session"), percent: 3 });
      // The filename rides sealed under the same link key as the bytes, the
      // server never learns what was sent, only that something was.
      const nameKey = await keyFromBytes(keyBytes);
      const session = await sendInit({
        filename: await sealText(selectedFile.name, nameKey),
        original_size: selectedFile.size,
        sha256: await sealText(fileHash, nameKey),
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

        setProgress({
          stage: t("send.encryptingChunk", { n: i + 1, total: chunkCount }),
          percent: 3 + Math.round((i / chunkCount) * 42),
        });
        const encrypted = await encryptChunk(keyBytes, plaintext);
        const chunkHash = await sha256Hex(encrypted);

        setProgress({
          stage: t("send.uploadingChunk", { n: i + 1, total: chunkCount }),
          percent: 45 + Math.round((i / chunkCount) * 47),
        });
        await sendChunkUpload(session.session_id, i, encrypted, chunkHash, false);
      }

      if (abortRef.current) return;

      setProgress({ stage: t("send.finalizing"), percent: 95 });
      await sendComplete(session.session_id);

      const url = `${window.location.origin}/send/${session.token}#key=${keyPassphrase}`;
      setShareUrl(url);
      setProgress({ stage: t("send.done"), percent: 100 });
      setState("done");
    } catch (err) {
      let msg = t("send.failed");
      if (err instanceof SendInitError && (err as any).status === 429) {
        if ((err as any).loginRequired) {
          setErrorMsg(t("send.dailyLoginRequired"));
          setLoginRequired(true);
        } else {
          setErrorMsg(t("send.dailyLimit"));
          setLoginRequired(false);
        }
        setState("error");
        return;
      }
      if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMsg(msg);
      setLoginRequired(false);
      setState("error");
    }
  }, [selectedFile, burnAfterRead, expiryHours, t]);

  const handleReset = useCallback(() => {
    abortRef.current = true;
    setState("idle");
    setSelectedFile(null);
    setShareUrl("");
    setProgress({ stage: "", percent: 0 });
    setErrorMsg("");
    setLoginRequired(false);
    reset();
  }, [reset]);

  const handleRetry = useCallback(() => {
    setState("idle");
    setErrorMsg("");
    setLoginRequired(false);
    setProgress({ stage: "", percent: 0 });
  }, []);

  return (
    <div className="panel overflow-hidden">
      {state === "idle" && !selectedFile && (
        <div className="p-6">
          <UploadZone
            onFiles={handleFiles}
            hint={t("send.hint", { max: formatBytes(MAX_FILE_SIZE) })}
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
              description={t("send.burnDesc")}
            />
          </div>
          <Button onClick={handleUpload} className="w-full">
            <Lock className="h-4 w-4 mr-2" /> {t("send.submit")}
          </Button>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-cyan-700 dark:text-cyan-300">{t("send.info")}</p>
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
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatBytes(selectedFile.size)}
                </p>
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
          title={t("send.doneTitle")}
          subtitle={t("send.doneSubtitle")}
          shareUrl={shareUrl}
          copied={copied}
          onCopy={handleCopy}
          expiryHours={expiryHours}
          burnAfterRead={burnAfterRead}
          resetIcon={Upload}
          resetLabel={t("send.another")}
          onReset={handleReset}
        />
      )}

      {state === "error" && (
        <ToolErrorState
          title={t("send.failedTitle")}
          message={
            loginRequired ? (
              <div className="space-y-2">
                <div>{errorMsg}</div>
                <Link
                  href="/login"
                  className="inline-block text-cyan-600 dark:text-cyan-400 hover:underline text-xs font-medium"
                >
                  {t("send.login")}
                </Link>
              </div>
            ) : (
              errorMsg
            )
          }
          onAction={handleRetry}
          wrapped
        />
      )}
    </div>
  );
}
