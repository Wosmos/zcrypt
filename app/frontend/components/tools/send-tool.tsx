"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UploadZone } from "@/components/upload/upload-zone";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Lock, Upload } from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";
import { sendInit, SendInitError, sendChunkUpload, sendComplete, sendCancel } from "@/lib/api";
import { sealText, keyFromBytes } from "@/lib/sealed";
import { runWithConcurrency } from "@/lib/concurrent";
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
  const abortRef = useRef<AbortController | null>(null);
  const openSessionRef = useRef<string | null>(null);
  const dropOpenSession = useCallback(() => {
    const id = openSessionRef.current;
    openSessionRef.current = null;
    if (id) void sendCancel(id);
  }, []);

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
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
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

      openSessionRef.current = session.session_id;
      if (ctl.signal.aborted) return;

      const { getDeviceProfile } = await import("@/lib/device-profile");
      const depth = Math.min(getDeviceProfile().workers * 3, 12);
      const failCtl = new AbortController();
      const runSignal = AbortSignal.any([ctl.signal, failCtl.signal]);
      const sent = new Array<number>(chunkCount).fill(0);
      const sizes = new Array<number>(chunkCount).fill(0);
      let finished = 0;
      const report = () => {
        const total = sizes.reduce((a, b) => a + b, 0) || 1;
        const moved = sent.reduce((a, b) => a + b, 0);
        setProgress({
          stage: t("send.uploadingChunk", {
            n: Math.min(finished + 1, chunkCount),
            total: chunkCount,
          }),
          percent: 3 + Math.round((moved / total) * 89),
        });
      };
      for (let i = 0; i < chunkCount; i++) {
        sizes[i] = Math.min(CS, selectedFile.size - i * CS);
      }
      report();

      try {
        await runWithConcurrency(
          chunkCount,
          depth,
          async (i) => {
            const slice = selectedFile.slice(i * CS, Math.min(i * CS + CS, selectedFile.size));
            const plaintext = new Uint8Array(await slice.arrayBuffer());
            const encrypted = await encryptChunk(keyBytes, plaintext);
            const chunkHash = await sha256Hex(encrypted);
            await sendChunkUpload(session.session_id, i, encrypted, chunkHash, false, {
              signal: runSignal,
              onProgress: (n) => {
                sent[i] = Math.min(n, sizes[i]);
                report();
              },
            });
            sent[i] = sizes[i];
            finished++;
            report();
          },
          runSignal,
        );
      } catch (err) {
        failCtl.abort();
        throw err;
      }

      if (ctl.signal.aborted) return;

      setProgress({ stage: t("send.finalizing"), percent: 95 });
      await sendComplete(session.session_id, ctl.signal);
      openSessionRef.current = null;

      const url = `${window.location.origin}/send/${session.token}#key=${keyPassphrase}`;
      setShareUrl(url);
      setProgress({ stage: t("send.done"), percent: 100 });
      setState("done");
    } catch (err) {
      if (ctl.signal.aborted) return;
      dropOpenSession();
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
  }, [selectedFile, burnAfterRead, expiryHours, t, dropOpenSession]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dropOpenSession();
    setState("idle");
    setProgress({ stage: "", percent: 0 });
    setErrorMsg("");
  }, [dropOpenSession]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    dropOpenSession();
    setState("idle");
    setSelectedFile(null);
    setShareUrl("");
    setProgress({ stage: "", percent: 0 });
    setErrorMsg("");
    setLoginRequired(false);
    reset();
  }, [reset, dropOpenSession]);

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
            <div className="flex justify-end pt-3">
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                {t("common.cancel")}
              </Button>
            </div>
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
