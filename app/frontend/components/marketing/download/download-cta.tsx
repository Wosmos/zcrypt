"use client";

import { useEffect, useState } from "react";
import { Download, ChevronDown } from "@/lib/icons";
import { RELEASES_FALLBACK_URL, type PlatformId, type DownloadOption } from "@/lib/releases";
import { OS_GLYPHS } from "./os-glyphs";
import { useLatestRelease } from "./use-release";

const OS_LABEL: Record<PlatformId, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function detectOS(): PlatformId | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(ua) || platform.includes("mac")) return "macos";
  if (/win/.test(ua) || platform.includes("win")) return "windows";
  if (/linux|x11|cros|android/.test(ua) || platform.includes("linux")) return "linux";
  return null;
}

const PRIMARY_BTN =
  "group inline-flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-4 text-base font-bold text-slate-900 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/50 active:scale-[0.99]";

/**
 * Hero download button: auto-detects OS (and macOS arch where exposed) and
 * links to the matching asset from the latest release. Falls back to the
 * platform grid / releases page while loading or when detection fails.
 */
export function DownloadCta() {
  const release = useLatestRelease();
  const [os, setOs] = useState<PlatformId | null>(null);
  const [macIntel, setMacIntel] = useState(false);

  useEffect(() => {
    const detected = detectOS();
    setOs(detected);
    if (detected === "macos") {
      const uaData = (
        navigator as Navigator & {
          userAgentData?: {
            getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }>;
          };
        }
      ).userAgentData;
      uaData
        ?.getHighEntropyValues?.(["architecture"])
        .then((v) => {
          if (v?.architecture === "x86") setMacIntel(true);
        })
        .catch(() => {});
    }
  }, []);

  const platform = release && os ? release.desktop.find((p) => p.id === os) : null;
  let primary: DownloadOption | null = null;
  if (platform) {
    primary =
      os === "macos" && macIntel
        ? platform.options.find((o) => o.label === "Intel") ?? platform.options[0]
        : platform.options.find((o) => o.recommended) ?? platform.options[0];
  }

  const Glyph = os ? OS_GLYPHS[os] : null;

  // Resolved: OS detected and a matching build exists in the latest release.
  if (primary && platform && Glyph) {
    return (
      <div className="flex flex-col items-center gap-4">
        <a href={primary.href} className={PRIMARY_BTN}>
          <Glyph className="h-5 w-5" />
          Download for {OS_LABEL[platform.id]}
          <Download className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-0.5" />
        </a>
        <p className="text-xs text-[var(--color-text-muted)]">
          {primary.sublabel}
          <span aria-hidden> · </span>
          <a
            href="#desktop"
            className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
          >
            Other options
          </a>
        </p>
      </div>
    );
  }

  // Loading, unknown OS, or API unavailable → point at the grid (or releases).
  const href = release === null ? RELEASES_FALLBACK_URL : "#desktop";
  return (
    <div className="flex flex-col items-center gap-4">
      <a href={href} className={PRIMARY_BTN}>
        <Download className="h-5 w-5" />
        Download zcrypt
        <ChevronDown className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-0.5" />
      </a>
      <p className="text-xs text-[var(--color-text-muted)]">
        Pick your platform below — macOS, Windows, Linux &amp; the terminal app.
      </p>
    </div>
  );
}
