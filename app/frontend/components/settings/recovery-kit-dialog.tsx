"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, Loader2, Printer } from "@/lib/icons";
import { putRecoveryKit } from "@/lib/api";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  recoveryKeyTail,
  sealRecoveryBlob,
} from "@/lib/recovery-kit";
import {
  printRecoveryKit,
  recoveryKitText,
  type RecoveryKitSheet,
} from "@/lib/recovery-kit-export";
import { saveBlob } from "@/lib/utils";
import { toast } from "@/store/toast";

interface RecoveryKitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unlocked vault passphrase the kit seals. */
  passphrase: string;
  replacing: boolean;
  onSaved: (createdAt: string) => void;
}

function normalizeTail(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

interface BodyProps extends Omit<RecoveryKitDialogProps, "open"> {}

function RecoveryKitBody({ onOpenChange, passphrase, replacing, onSaved }: BodyProps) {
  const t = useTranslations("settings.recoveryKit");
  const locale = useLocale();
  const [keyBytes] = useState(generateRecoveryKey);
  const [formatted, setFormatted] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void formatRecoveryKey(keyBytes).then((text) => {
      if (!cancelled) setFormatted(text);
    });
    return () => {
      cancelled = true;
    };
  }, [keyBytes]);

  const tail = formatted ? recoveryKeyTail(formatted) : "";
  const matches = tail !== "" && normalizeTail(typed) === tail;
  const showMismatch = typed.length >= 4 && !matches;

  const sheet = (): RecoveryKitSheet => ({
    product: "zcrypt",
    title: t("sheet.title"),
    dateLabel: t("sheet.created", { date: new Date().toLocaleDateString(locale) }),
    keyLabel: t("keyLabel"),
    recoveryKey: formatted ?? "",
    instructions: [t("sheet.step1"), t("sheet.step2"), t("sheet.step3")],
    dir: locale === "ar" || locale === "ur" ? "rtl" : "ltr",
  });

  const copy = async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const save = async () => {
    if (!matches || saving) return;
    setSaving(true);
    try {
      const blob = await sealRecoveryBlob(keyBytes, passphrase);
      const { created_at } = await putRecoveryKit(blob);
      toast.success(t("saved"));
      onSaved(created_at);
      onOpenChange(false);
    } catch {
      toast.error(t("failed"));
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{replacing ? t("replaceTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{replacing ? t("replaceDesc") : t("createDesc")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {t("keyLabel")}
        </p>
        <div
          dir="ltr"
          data-testid="recovery-key"
          className="select-all break-all rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4 font-mono text-sm leading-relaxed tracking-wide text-[var(--color-text)]"
        >
          {formatted ?? <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!formatted}
            onClick={() => void copy()}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t("copied") : t("copy")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!formatted}
            onClick={() => saveBlob(t("fileName"), recoveryKitText(sheet()), "text/plain")}
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!formatted}
            onClick={() => printRecoveryKit(sheet())}
          >
            <Printer className="h-3.5 w-3.5" />
            {t("print")}
          </Button>
        </div>
      </div>

      <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">
        {t("warning")}
      </p>

      <div className="space-y-1.5">
        <label
          htmlFor="recovery-kit-confirm"
          className="text-xs font-medium text-[var(--color-text-secondary)]"
        >
          {t("confirmLabel")}
        </label>
        <input
          id="recovery-kit-confirm"
          dir="ltr"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("confirmPlaceholder")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={showMismatch || undefined}
          className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 font-mono text-sm uppercase text-[var(--color-text)] outline-none transition-all placeholder:normal-case placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
        />
        {showMismatch && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {t("confirmWrong")}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button type="button" disabled={!matches || saving} onClick={() => void save()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </>
  );
}

export function RecoveryKitDialog({ open, onOpenChange, ...rest }: RecoveryKitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <RecoveryKitBody onOpenChange={onOpenChange} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}
