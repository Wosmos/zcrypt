"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ChevronDown, ArrowRight } from "@/lib/icons";
import {
  RELEASES_FALLBACK_URL,
  ANDROID_APK_URL,
  type PlatformId,
  type DetectedDevice,
  type DownloadOption,
  type ReleaseData,
} from "@/lib/releases";
import { OS_GLYPHS, MOBILE_GLYPHS } from "./os-glyphs";

const OS_LABEL: Record<PlatformId, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function detectDevice(): DetectedDevice | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  const touchPoints = navigator.maxTouchPoints || 0;

  // Android's UA also contains "linux", so it has to be checked before that
  // fallback below.
  if (/android/.test(ua)) return "android";
  // A phone/tablet always says so somewhere in its UA on older iOS/iPadOS.
  if (/iphone|ipod|ipad/.test(ua)) return "ios";
  // iPadOS 13+ defaults to a desktop-class UA that's byte-for-byte the same
  // as macOS Safari's ("Macintosh" / platform "MacIntel") — the only
  // remaining tell is that a real Mac reports zero touch points.
  if (platform === "macintel" && touchPoints > 1) return "ios";
  if (/mac/.test(ua) || platform.includes("mac")) return "macos";
  if (/win/.test(ua) || platform.includes("win")) return "windows";
  if (/linux|x11|cros/.test(ua) || platform.includes("linux")) return "linux";
  return null;
}

const PRIMARY_BTN =
  "group inline-flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-4 text-base font-bold text-slate-900 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/50 active:scale-[0.99]";

/**
 * Hero download button: auto-detects OS (and macOS arch where exposed) and
 * links to the matching asset from the latest release. Falls back to the
 * platform grid / releases page while loading or when detection fails.
 */
export function DownloadCta({ release }: { release: ReleaseData | null }) {
  const [device, setDevice] = useState<DetectedDevice | null>(null);
  const [macIntel, setMacIntel] = useState(false);

  useEffect(() => {
    const detected = detectDevice();
    setDevice(detected);
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

  // iOS/iPadOS: there's no native app yet — the web app is the real answer,
  // and a Mac installer would just fail silently with no explanation.
  if (device === "ios") {
    const IosGlyph = MOBILE_GLYPHS.ios;
    return (
      <div className="flex flex-col items-center gap-4">
        <Link href="/register" className={PRIMARY_BTN}>
          <IosGlyph className="h-5 w-5" />
          Use the web app
          <ArrowRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <p className="max-w-xs text-center text-xs text-[var(--color-text-muted)]">
          There&apos;s no iOS app yet. The web app works fully in Safari — no install needed.
        </p>
      </div>
    );
  }

  // Android: one universal APK, so — unlike Linux below — this is a
  // confident direct download rather than a guess.
  if (device === "android") {
    const AndroidGlyph = MOBILE_GLYPHS.android;
    return (
      <div className="flex flex-col items-center gap-4">
        <a href={ANDROID_APK_URL} className={PRIMARY_BTN}>
          <AndroidGlyph className="h-5 w-5" />
          Download APK for Android
          <Download className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-0.5" />
        </a>
        <p className="text-xs text-[var(--color-text-muted)]">
          Sideloaded, not Play Store
          <span aria-hidden> · </span>
          <a
            href="#android"
            className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
          >
            install steps &amp; QR code
          </a>
        </p>
      </div>
    );
  }

  // Linux: we can tell it's Linux but never which distro, so a single
  // confident download is exactly the wrong move — route to the picker
  // instead of guessing (that guess is what put AppImage in Android's and
  // iOS's hands too).
  if (device === "linux") {
    const LinuxGlyph = OS_GLYPHS.linux;
    return (
      <div className="flex flex-col items-center gap-4">
        <a href="#desktop" className={PRIMARY_BTN}>
          <LinuxGlyph className="h-5 w-5" />
          Download for Linux
          <ChevronDown className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-0.5" />
        </a>
        <p className="text-xs text-[var(--color-text-muted)]">
          Fedora, Debian/Ubuntu, or a portable build — pick yours below.
        </p>
      </div>
    );
  }

  // macOS / Windows / undetected from here on — device is narrowed to
  // "macos" | "windows" | null by the returns above.
  const platform = release && device ? release.desktop.find((p) => p.id === device) : null;
  let primary: DownloadOption | null = null;
  if (platform) {
    primary =
      device === "macos" && macIntel
        ? (platform.options.find((o) => o.label === "Intel") ?? platform.options[0])
        : (platform.options.find((o) => o.recommended) ?? platform.options[0]);
  }

  const Glyph = device ? OS_GLYPHS[device] : null;

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
