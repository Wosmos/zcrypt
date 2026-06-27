"use client";

import { useEffect, useState } from "react";
import { Download, ChevronDown } from "@/lib/icons";
import { desktopPlatforms, type PlatformId, type DownloadOption } from "@/lib/data";
import { OS_GLYPHS } from "./os-glyphs";

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

/**
 * Primary download button that auto-detects the visitor's OS (and, on macOS,
 * their CPU architecture where the browser exposes it). Falls back to a neutral
 * "see all platforms" state when the OS can't be determined or before hydration.
 */
export function DownloadCta() {
  const [os, setOs] = useState<PlatformId | null>(null);
  const [macIntel, setMacIntel] = useState(false);

  useEffect(() => {
    const detected = detectOS();
    setOs(detected);

    if (detected === "macos") {
      // Apple Silicon is the right default for most modern Macs; only flip to
      // Intel when the browser actually reports an x86 architecture.
      const uaData = (
        navigator as Navigator & {
          userAgentData?: {
            getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string }>;
          };
        }
      ).userAgentData;
      uaData?.getHighEntropyValues?.(["architecture"]).then((v) => {
        if (v?.architecture === "x86") setMacIntel(true);
      }).catch(() => {});
    }
  }, []);

  const platform = os ? desktopPlatforms.find((p) => p.id === os) ?? null : null;

  let primary: DownloadOption | null = null;
  if (platform) {
    primary =
      os === "macos" && macIntel
        ? platform.options.find((o) => o.label === "Intel") ?? platform.options[0]
        : platform.options.find((o) => o.recommended) ?? platform.options[0];
  }

  const Glyph = os ? OS_GLYPHS[os] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {primary && platform && Glyph ? (
        <>
          <a
            href={primary.href}
            className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-4 text-base font-bold text-slate-900 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/50 active:scale-[0.99]"
          >
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
        </>
      ) : (
        // Unknown OS or pre-hydration: send people to the full platform grid.
        <>
          <a
            href="#desktop"
            className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-4 text-base font-bold text-slate-900 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/50 active:scale-[0.99]"
          >
            <Download className="h-5 w-5" />
            Download zcrypt
            <ChevronDown className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-0.5" />
          </a>
          <p className="text-xs text-[var(--color-text-muted)]">
            Pick your platform below — macOS, Windows, Linux &amp; the terminal app.
          </p>
        </>
      )}
    </div>
  );
}
