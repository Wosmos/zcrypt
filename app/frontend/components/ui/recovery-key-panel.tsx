"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/http-error";
import { getRecoveryKit } from "@/lib/api";
import { openRecoveryBlob, parseRecoveryKey, RecoveryKeyError } from "@/lib/recovery-kit";
import { Check, Copy, Eye, EyeOff, Loader2 } from "@/lib/icons";

interface RecoveryKeyPanelProps {
  /** Runs the same unlock path a typed passphrase takes. */
  onUnlock: (passphrase: string) => void | Promise<void>;
  onBack: () => void;
  /** True while the modal is already busy with a check. */
  busy: boolean;
}

const FIELD =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 transition-all";
const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]";
const PRIMARY =
  "flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a1f36] dark:bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-[#252b45] dark:hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/** Unlock with a recovery key: enter it, then unlock and optionally reveal the passphrase. */
export function RecoveryKeyPanel({ onUnlock, onBack, busy }: RecoveryKeyPanelProps) {
  const t = useTranslations("passphrase");
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!input.trim() || checking) return;
    setError(null);
    setChecking(true);
    try {
      const key = await parseRecoveryKey(input);
      const kit = await getRecoveryKit();
      if (!kit) {
        setError(t("recoveryNone"));
        return;
      }
      setRecovered(await openRecoveryBlob(key, kit.blob));
    } catch (err) {
      if (err instanceof RecoveryKeyError) {
        const messages = {
          typo: t("recoveryTypo"),
          length: t("recoveryLength"),
          chars: t("recoveryChars"),
          wrong: t("recoveryWrong"),
          blob: t("recoveryFailed"),
        };
        setError(messages[err.code]);
      } else if (err instanceof ApiError && err.status === 429) {
        setError(t("recoveryRateLimited"));
      } else {
        setError(t("recoveryFailed"));
      }
    } finally {
      setChecking(false);
    }
  };

  const copy = async () => {
    if (!recovered) return;
    try {
      await navigator.clipboard.writeText(recovered);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (recovered !== null) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
          <p className="text-sm font-medium text-[var(--color-text)]">{t("recoveredTitle")}</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{t("recoveredBody")}</p>
        </div>

        {revealed ? (
          <div className="space-y-2">
            <div
              dir="ltr"
              data-testid="recovered-passphrase"
              className="select-all break-all rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 font-mono text-sm"
            >
              {recovered}
            </div>
            <div className="flex gap-2">
              <button type="button" className={SECONDARY} onClick={() => void copy()}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("copied") : t("copyPassphrase")}
              </button>
              <button type="button" className={SECONDARY} onClick={() => setRevealed(false)}>
                <EyeOff className="h-3.5 w-3.5" />
                {t("hidePassphrase")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={SECONDARY} onClick={() => setRevealed(true)}>
            <Eye className="h-3.5 w-3.5" />
            {t("showPassphrase")}
          </button>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            className={PRIMARY}
            disabled={busy}
            onClick={() => void onUnlock(recovered)}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("unlockWithRecovered")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label
        htmlFor="recovery-key-input"
        className="block text-xs font-medium text-[var(--color-text-secondary)]"
      >
        {t("recoveryLabel")}
      </label>
      <input
        id="recovery-key-input"
        dir="ltr"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError(null);
        }}
        placeholder="ZCRYPT-XXXX-XXXX-XXXX-..."
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className={`${FIELD} font-mono uppercase placeholder:normal-case placeholder:text-[var(--color-text-muted)]`}
      />
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={checking}
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-40"
        >
          {t("recoveryBack")}
        </button>
        <button type="submit" className={PRIMARY} disabled={!input.trim() || checking}>
          {checking && <Loader2 className="h-4 w-4 animate-spin" />}
          {checking ? t("recoveryChecking") : t("recoveryAction")}
        </button>
      </div>
    </form>
  );
}
