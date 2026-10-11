"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { detectDevice } from "@/components/marketing/download/download-cta";
import { MOBILE_GLYPHS, OS_GLYPHS } from "@/components/marketing/download/os-glyphs";
import type { DownloadTarget, PlatformId } from "@/lib/releases";
import { ChevronDown, Download, ExternalLink, MonitorSmartphone } from "@/lib/icons";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const OS_NAME: Record<PlatformId, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };

const DESKTOP_TARGETS: { os: PlatformId; target: DownloadTarget; label: string }[] = [
  { os: "macos", target: "macos-arm64", label: "Apple silicon (.dmg)" },
  { os: "macos", target: "macos-x64", label: "Intel (.dmg)" },
  { os: "windows", target: "windows-exe", label: "Installer (.exe)" },
  { os: "windows", target: "windows-msi", label: "MSI package (.msi)" },
  { os: "linux", target: "linux-appimage", label: "AppImage" },
  { os: "linux", target: "linux-deb", label: "Debian / Ubuntu (.deb)" },
  { os: "linux", target: "linux-rpm", label: "Fedora / RHEL (.rpm)" },
];

const PRIMARY: Record<PlatformId, DownloadTarget> = {
  macos: "macos-arm64",
  windows: "windows-exe",
  linux: "linux-appimage",
};

const dlUrl = (target: DownloadTarget) => `${SITE_URL}/dl/${target}`;
const noopSubscribe = () => () => {};

function LaptopMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[260px]">
      <div className="relative rounded-t-xl border border-white/10 bg-[#0b0e1a] p-1.5 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)]">
        <div
          className="relative aspect-[16/10] overflow-hidden rounded-md"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, color-mix(in oklab, var(--color-accent) 55%, transparent), transparent 60%), radial-gradient(90% 80% at 100% 100%, rgba(124, 58, 237, 0.55), transparent 62%), linear-gradient(160deg, #101a3a, #0b0f22)",
          }}
        >
          <div className="absolute inset-x-[12%] top-[14%] bottom-[16%] overflow-hidden rounded-md border border-white/10 bg-[#11152a]/90 shadow-xl backdrop-blur">
            <div className="flex h-3 items-center gap-0.5 border-b border-white/5 px-1.5">
              <span className="h-1 w-1 rounded-full bg-[#ff5f57]" />
              <span className="h-1 w-1 rounded-full bg-[#febc2e]" />
              <span className="h-1 w-1 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex h-[calc(100%-0.75rem)]">
              <div className="w-[28%] space-y-1 border-e border-white/5 p-1.5">
                <span className="block h-1 w-3/4 rounded-full bg-[var(--color-accent)]/70" />
                <span className="block h-1 w-full rounded-full bg-white/10" />
                <span className="block h-1 w-2/3 rounded-full bg-white/10" />
              </div>
              <div className="grid flex-1 grid-cols-3 gap-1 p-1.5">
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="rounded-sm bg-white/[0.06]" />
                ))}
              </div>
            </div>
          </div>
          <Image
            src="/brand/zcrypt-mark.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
            className="absolute bottom-[4%] left-1/2 h-[14%] w-auto -translate-x-1/2 drop-shadow"
          />
        </div>
      </div>
      <div className="relative -mx-[6%] h-2.5 rounded-b-xl bg-gradient-to-b from-[#c9ccd6] to-[#7d8191] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.7)]">
        <span className="absolute left-1/2 top-0 h-1 w-[14%] -translate-x-1/2 rounded-b-md bg-[#9a9eab]" />
      </div>
    </div>
  );
}

export const useGetAppsDialog = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

export function GetAppsButton({ className }: { className?: string }) {
  const t = useTranslations("ui.getApps");
  const device = useSyncExternalStore(noopSubscribe, detectDevice, () => null);
  const os: PlatformId =
    device === "macos" || device === "windows" || device === "linux" ? device : "macos";
  const OsGlyph = OS_GLYPHS[os];
  const AndroidGlyph = MOBILE_GLYPHS.android;
  const open = useGetAppsDialog((s) => s.open);
  const setOpen = useGetAppsDialog((s) => s.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        aria-label={t("open")}
        title={t("open")}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] data-[state=open]:bg-[var(--color-surface-1)] data-[state=open]:text-[var(--color-text)]",
          className,
        )}
      >
        <MonitorSmartphone className="h-5 w-5" />
      </DialogPrimitive.Trigger>
      <DialogContent className="max-w-[720px] gap-0 rounded-3xl [&>button:last-child]:end-5 [&>button:last-child]:top-5 border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)]">
        <div className="px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
          <DialogTitle className="font-[family-name:var(--font-heading)] text-2xl font-semibold tracking-tight">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t("subtitle")}
          </DialogDescription>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8 sm:pt-5">
          <section className="flex flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/60 p-6 text-center">
            <div className="rounded-2xl bg-white p-3 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
              <QRCodeSVG
                value={dlUrl("android")}
                size={148}
                level="M"
                marginSize={0}
                imageSettings={{
                  src: "/brand/zcrypt-mark.svg",
                  height: 30,
                  width: 30,
                  excavate: true,
                }}
              />
            </div>
            <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold">
              <AndroidGlyph className="h-4 w-4 text-[#3ddc84]" />
              {t("androidTitle")}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t("androidHint")}</p>
            <a
              href={dlUrl("android")}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:underline"
            >
              <Download className="h-3.5 w-3.5" />
              {t("androidDirect")}
            </a>
          </section>

          <section className="flex flex-col items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/60 p-6 text-center">
            <LaptopMock />
            <div className="mt-6 flex w-full flex-col items-center">
              <div className="flex w-full max-w-[260px] overflow-hidden rounded-xl bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-[0_10px_28px_-14px_var(--color-accent)]">
                <a
                  href={dlUrl(PRIMARY[os])}
                  className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-[filter] hover:brightness-110"
                >
                  <OsGlyph className="h-4 w-4" />
                  {t("downloadFor", { os: OS_NAME[os] })}
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={t("otherPlatforms")}
                    className="flex w-10 items-center justify-center border-s border-black/15 transition-[filter] hover:brightness-110 focus-visible:outline-none data-[state=open]:brightness-110"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {(["macos", "windows", "linux"] as const).map((group, gi) => {
                      const Glyph = OS_GLYPHS[group];
                      return (
                        <div key={group}>
                          {gi > 0 ? <DropdownMenuSeparator /> : null}
                          <div className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-xs font-medium text-[var(--color-text-muted)]">
                            <Glyph className="h-3.5 w-3.5" />
                            {OS_NAME[group]}
                          </div>
                          {DESKTOP_TARGETS.filter((d) => d.os === group).map((d) => (
                            <DropdownMenuItem key={d.target} asChild>
                              <a href={dlUrl(d.target)}>{d.label}</a>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <a
                href={`${SITE_URL}/download`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
              >
                {t("allDownloads")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </section>
        </div>
        <p className="border-t border-[var(--color-border)] px-6 py-3 text-center text-xs text-[var(--color-text-muted)] sm:px-8">
          {t("iosNote")}
        </p>
      </DialogContent>
    </Dialog>
  );
}
