"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "@/lib/icons";
import { CommandLine, POWERSHELL_INSTALL } from "./command-line";

/**
 * The recommended Windows path in the download hero: the one-line PowerShell
 * install, which never raises a SmartScreen prompt.
 */
export function WindowsInstall() {
  const t = useTranslations("site");
  return (
    <div className="w-full max-w-xl text-center">
      <p className="mb-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--pv2-accent-ink)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        {t("download.windows.recommended")}
      </p>
      <div className="text-start">
        <CommandLine method={POWERSHELL_INSTALL} />
      </div>
      <p className="pv2-micro mt-2.5">{t("download.install.hint.windows")}</p>
    </div>
  );
}

/**
 * A small, aria-hidden picture of the SmartScreen prompt, so nobody has to
 * wonder which button to press. Strings follow the visitor's language the way
 * Windows itself would show them.
 */
export function SmartScreenMock() {
  const t = useTranslations("site");
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-[260px] select-none overflow-hidden rounded-md border border-black/15 bg-[#0f5ea8] text-start text-white shadow-[0_12px_28px_-14px_rgba(0,0,0,0.5)]"
    >
      <div className="px-4 pb-3 pt-4">
        <p className="text-[13px] font-semibold leading-tight">
          {t("download.windows.mock.title")}
        </p>
        <p className="mt-2 text-[10px] leading-snug text-white/80">
          {t("download.windows.mock.body")}
        </p>
        <p className="mt-2 text-[10px] font-semibold underline decoration-2 underline-offset-2 [text-decoration-color:#ffd54a]">
          {t("download.windows.mock.moreInfo")}
        </p>
      </div>
      <div className="flex justify-end gap-2 border-t border-white/15 bg-[#0b4f8e] px-3 py-2">
        <span className="rounded-sm bg-white px-3 py-1 text-[10px] font-semibold text-[#0b4f8e] ring-2 ring-[#ffd54a]">
          {t("download.windows.mock.runAnyway")}
        </span>
        <span className="rounded-sm border border-white/60 px-3 py-1 text-[10px] font-semibold text-white">
          {t("download.windows.mock.dontRun")}
        </span>
      </div>
    </div>
  );
}
