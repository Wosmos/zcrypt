"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Smartphone } from "@/lib/icons";
import { GITHUB_REPO } from "@/lib/data";

// Published by .github/workflows/android.yml on every push to main/tags: a
// rolling prerelease (tag `android-latest`) whose `zcrypt.apk` asset is
// overwritten with the newest build. This URL never changes, so — unlike the
// desktop/CLI sections above, which resolve a versioned asset from the latest
// release at request time — it's safe to link and QR-encode as a constant.
const ANDROID_APK_URL = `${GITHUB_REPO}/releases/download/android-latest/zcrypt.apk`;
const ANDROID_RELEASE_PAGE = `${GITHUB_REPO}/releases/tag/android-latest`;

function isAndroidUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

const STEPS = [
  "Scan the QR code, or tap the button, to pull zcrypt.apk onto your phone.",
  "Open the downloaded file to start installing.",
  'Android will ask to allow installs from this source once — approve it, then finish installing.',
];

const PRIMARY_BTN =
  "group mt-6 inline-flex items-center gap-3 rounded-xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-7 py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-500/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/50 active:scale-[0.99]";
const SECONDARY_BTN =
  "group mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--color-text)] px-6 py-3.5 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90";

/**
 * Android sideload card: a stable APK link (see ANDROID_APK_URL) rendered
 * both as a button and as a self-contained QR code (qrcode.react → inline
 * SVG, no network request) so a desktop visitor can scan it with their
 * phone. Detects an Android user agent client-side to promote the button to
 * the same gradient treatment the hero CTA uses elsewhere on this page.
 */
export function AndroidDownload() {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidUA());
  }, []);

  return (
    <div className="card relative overflow-hidden p-8 sm:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div className="relative grid gap-10 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <Smartphone className="h-5 w-5" />
          </div>

          {isAndroid && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Recommended for your device
            </div>
          )}

          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            zcrypt for Android
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)]">
            A sideloaded APK, built straight from this repository on every
            push. Same zero-knowledge vault as everywhere else — nothing
            waiting on a Play Store review.
          </p>

          <a href={ANDROID_APK_URL} className={isAndroid ? PRIMARY_BTN : SECONDARY_BTN}>
            <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
            Download for Android (.apk)
          </a>

          <ol className="mt-6 max-w-md space-y-2 text-xs text-[var(--color-text-muted)]">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-[10px] font-semibold text-[var(--color-text-secondary)]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-4 max-w-md text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            Android will warn that this is from an &quot;unknown developer&quot;
            — expected for anything installed outside the Play Store. It's
            built by{" "}
            <a
              href={ANDROID_RELEASE_PAGE}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
            >
              the same public CI
            </a>{" "}
            as everything else on this page.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 justify-self-center">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-3">
            <QRCodeSVG value={ANDROID_APK_URL} size={168} level="M" marginSize={2} />
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Scan to install on your phone
          </p>
        </div>
      </div>
    </div>
  );
}
