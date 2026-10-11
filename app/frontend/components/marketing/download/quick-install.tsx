"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "@/lib/icons";
import { type PlatformId } from "@/lib/releases";
import { cn } from "@/lib/utils";
import { cardSurface } from "@/components/marketing/ui/card";
import { detectDevice } from "./download-cta";
import { OS_GLYPHS } from "./os-glyphs";

type Method = { shell: string; command: string };

const METHODS: Record<PlatformId, { name: string; primary: Method; alt?: Method }> = {
  macos: {
    name: "macOS",
    primary: { shell: "Terminal", command: "curl -fsSL https://zcrypt.cloud/install.sh | sh" },
    alt: {
      shell: "Homebrew",
      command: "brew tap wosmos/zcrypt\nbrew trust wosmos/zcrypt\nbrew install --cask zcrypt",
    },
  },
  windows: {
    name: "Windows",
    primary: { shell: "PowerShell", command: "irm https://zcrypt.cloud/install.ps1 | iex" },
  },
  linux: {
    name: "Linux",
    primary: { shell: "Terminal", command: "curl -fsSL https://zcrypt.cloud/install.sh | sh" },
  },
};

const ORDER: PlatformId[] = ["macos", "windows", "linux"];

const noopSubscribe = () => () => {};

function detectPlatform(): PlatformId | null {
  const d = detectDevice();
  return d === "macos" || d === "windows" || d === "linux" ? d : null;
}

function CommandLine({ method }: { method: Method }) {
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

/**
 * One-line installers. They fetch the app outside the browser, so macOS and
 * Windows never attach the "downloaded from the internet" mark that makes
 * Gatekeeper and SmartScreen stop an unsigned app.
 */
export function QuickInstall() {
  const t = useTranslations("site");
  const detected = useSyncExternalStore(noopSubscribe, detectPlatform, () => null);
  const [picked, setPicked] = useState<PlatformId | null>(null);
  const active = picked ?? detected ?? "macos";
  const method = METHODS[active];

  return (
    <div className={cn("mx-auto max-w-3xl p-6 sm:p-7", cardSurface)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="pv2-h3 text-lg">{t("download.install.title")}</h3>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
            {method.primary.shell === "PowerShell"
              ? t("download.install.skipsPowerShell")
              : t("download.install.skipsTerminal")}
          </p>
        </div>
        <div
          role="tablist"
          aria-label={t("download.install.osLabel")}
          className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1"
        >
          {ORDER.map((id) => {
            const Glyph = OS_GLYPHS[id];
            const selected = id === active;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setPicked(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  selected
                    ? "bg-[var(--color-surface-1)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                <Glyph className="h-3.5 w-3.5" />
                {METHODS[id].name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-2.5" role="tabpanel" aria-label={method.name}>
        <CommandLine method={method.primary} />
        <p className="px-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          {t(`download.install.hint.${active}`)}
        </p>
        {method.alt ? (
          <>
            <p className="px-1 pt-2 text-[12px] font-medium text-[var(--color-text-secondary)]">
              {t("download.install.homebrew")}
            </p>
            <CommandLine method={method.alt} />
          </>
        ) : null}
      </div>
    </div>
  );
}
