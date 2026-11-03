"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "@/lib/icons";
import { SITE_URL } from "@/lib/site";

export type Method = { shell: string; command: string };

/** The Windows one-liner: fetches the installer outside the browser, so SmartScreen never sees a download. */
export const POWERSHELL_INSTALL: Method = {
  shell: "PowerShell",
  command: `irm ${SITE_URL}/install.ps1 | iex`,
};

/** A shell command in a copyable monospace row. */
export function CommandLine({ method }: { method: Method }) {
  const t = useTranslations("site");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(method.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context): the command is still selectable.
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2 ps-4 pe-2">
      <span className="hidden shrink-0 text-[11px] font-medium text-[var(--color-text-muted)] sm:block">
        {method.shell}
      </span>
      <code className="min-w-0 flex-1 whitespace-pre-wrap py-1 [overflow-wrap:anywhere] font-mono text-[12px] leading-relaxed sm:text-[13px] text-[var(--color-text)]">
        {method.command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={
          copied
            ? t("download.install.copied")
            : t("download.install.copyCommand", { shell: method.shell })
        }
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[var(--pv2-accent-ink)]" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">
          {copied ? t("download.install.copied") : t("download.install.copy")}
        </span>
      </button>
    </div>
  );
}
