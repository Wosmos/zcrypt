"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Smartphone, Copy, Check } from "@/lib/icons";
import { ANDROID_APK_URL, ANDROID_RELEASE_PAGE } from "@/lib/releases";
import { cn } from "@/lib/utils";
import { IconWell, cardSurface } from "@/components/marketing/ui/card";
import { pillClass } from "@/components/marketing/ui/pill-link";

/**
 * Android sideload card: QR-forward: a big self-contained QR (qrcode.react →
 * inline SVG, no network) plus a Download + Copy-link action pair.
 */
export function AndroidDownload() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(ANDROID_APK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: the Download button still works */
    }
  };

  return (
    <div className={cn("overflow-hidden p-8 sm:p-10", cardSurface)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
        {/* Left: identity + actions */}
        <div>
          <IconWell icon={Smartphone} className="mb-4" />

          <h3 className="pv2-h3 flex items-center gap-2 text-2xl">
            zcrypt for Android
            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Beta
            </span>
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Sideload the APK: the same drive, no Play Store wait.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a href={ANDROID_APK_URL} className={cn("group", pillClass("primary"))}>
              <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
              Download APK
            </a>
            <button type="button" onClick={copyLink} className={pillClass("secondary")}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <p className="mt-4 max-w-md text-xs leading-relaxed text-[var(--color-text-muted)]">
            Open the file, allow installs from this source once, install. Android flags
            &quot;unknown developer&quot; for anything outside Play, it&apos;s the{" "}
            <a
              href={ANDROID_RELEASE_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
            >
              same public CI
            </a>{" "}
            as everything else here.
          </p>
        </div>

        {/* Right: big scan-to-install QR */}
        <div className="flex flex-col items-center gap-3 justify-self-center">
          <div className="rounded-3xl corner-squircle border border-[var(--color-border)] bg-white p-4 shadow-xl shadow-cyan-500/10">
            <QRCodeSVG value={ANDROID_APK_URL} size={264} level="M" marginSize={2} />
          </div>
          <p className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Scan to install on your phone
          </p>
        </div>
      </div>
    </div>
  );
}
