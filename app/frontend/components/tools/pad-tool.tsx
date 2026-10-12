"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Lock, FileText } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { createPad } from "@/lib/api";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { ExpirySelector } from "./shared/expiry-selector";
import { BurnAfterReadToggle } from "./shared/burn-after-read-toggle";
import { ShareResult } from "./shared/share-result";
import { ToolErrorState } from "./shared/tool-states";

const MAX_PAD_SIZE = 1024 * 1024;

type PadState = "editing" | "encrypting" | "done" | "error";

export function PadTool() {
  const t = useTranslations("tools");
  const [state, setState] = useState<PadState>("editing");
  const [text, setText] = useState("");
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [shareUrl, setShareUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { copied, handleCopy, reset } = useCopyFeedback(shareUrl);

  const textSize = new TextEncoder().encode(text).length;
  const isOverLimit = textSize > MAX_PAD_SIZE;

  const handleEncryptAndShare = useCallback(async () => {
    if (!text.trim() || isOverLimit) return;
    setState("encrypting");
    setErrorMsg("");

    try {
      const { encryptChunk, toBase64 } = await import("@/lib/crypto");

      const randomKey = crypto.getRandomValues(new Uint8Array(32));
      const keyB64 = toBase64(randomKey);

      const plaintext = new TextEncoder().encode(text);
      const encrypted = await encryptChunk(randomKey.buffer as ArrayBuffer, plaintext);

      const { token } = await createPad({
        encrypted_blob: toBase64(encrypted),
        content_size: plaintext.byteLength,
        burn_after_read: burnAfterRead,
        expires_hours: expiryHours,
      });

      const url = `${window.location.origin}/pad/${token}#key=${keyB64}`;
      setShareUrl(url);
      setState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("pad.createFailed");
      setErrorMsg(msg);
      setState("error");
    }
  }, [text, isOverLimit, burnAfterRead, expiryHours, t]);

  const handleReset = useCallback(() => {
    setState("editing");
    setText("");
    setShareUrl("");
    setErrorMsg("");
    reset();
  }, [reset]);

  const handleRetry = useCallback(() => {
    setState("editing");
    setErrorMsg("");
  }, []);

  return (
    <div className="panel overflow-hidden">
      {state === "editing" && (
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("pad.placeholder")}
              className="h-56 p-4 bg-[var(--color-surface-1)]/50 font-mono resize-none focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/50"
            />
            <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
              <span>{t("pad.characters", { count: text.length })}</span>
              <span className={isOverLimit ? "text-red-500 font-medium" : ""}>
                {formatBytes(textSize)} / {formatBytes(MAX_PAD_SIZE)}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <ExpirySelector value={expiryHours} onChange={setExpiryHours} />
            <BurnAfterReadToggle
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
              description={t("pad.burnDesc")}
            />
          </div>
          <Button
            onClick={handleEncryptAndShare}
            disabled={!text.trim() || isOverLimit}
            className="w-full"
          >
            <Lock className="h-4 w-4 mr-2" /> {t("pad.submit")}
          </Button>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <p className="text-xs text-cyan-700 dark:text-cyan-300">{t("pad.info")}</p>
          </div>
        </div>
      )}

      {state === "encrypting" && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <LogoSpinner size={32} speed="fast" />
          <p className="text-sm text-[var(--color-text-muted)]">{t("pad.encrypting")}</p>
        </div>
      )}

      {state === "done" && (
        <ShareResult
          title={t("pad.doneTitle")}
          subtitle={t("pad.doneSubtitle")}
          shareUrl={shareUrl}
          copied={copied}
          onCopy={handleCopy}
          expiryHours={expiryHours}
          burnAfterRead={burnAfterRead}
          resetIcon={FileText}
          resetLabel={t("pad.another")}
          onReset={handleReset}
        />
      )}

      {state === "error" && (
        <ToolErrorState
          title={t("pad.failedTitle")}
          message={errorMsg}
          onAction={handleRetry}
          wrapped
        />
      )}
    </div>
  );
}
