import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  ArrowRight,
  Check,
  ShieldCheck,
  Github,
  Terminal,
  Globe,
  ExternalLink,
} from "@/lib/icons";
import { tuiInstallMethods, GITHUB_REPO } from "@/lib/data";
import {
  SoftwareApplicationJsonLd,
  BreadcrumbJsonLd,
} from "@/components/seo/json-ld";
import { DownloadCta } from "@/components/marketing/download/download-cta";
import { InstallCommands } from "@/components/marketing/download/install-commands";
import { DesktopGrid } from "@/components/marketing/download/desktop-grid";
import { CliBinaries } from "@/components/marketing/download/cli-binaries";

export const metadata: Metadata = {
  title: "Download zcrypt — Desktop Apps for macOS, Windows & Linux, plus the CLI",
  description:
    "Get the zcrypt encrypted drive on every device. Native desktop apps for macOS, Windows, and Linux, a single-binary terminal client, and a web app that needs no install. Free, open source, zero-knowledge.",
  keywords: [
    "download zcrypt",
    "encrypted cloud storage download",
    "zcrypt desktop app",
    "zcrypt for macOS",
    "zcrypt for Windows",
    "zcrypt for Linux",
    "encrypted drive download",
    "zero-knowledge storage app",
    "zcrypt CLI",
    "AppImage",
    "dmg",
    "open source",
  ],
  alternates: { canonical: "https://zcrypt.cloud/download" },
  openGraph: {
    title: "Download zcrypt — Apps for macOS, Windows, Linux & the Terminal",
    description:
      "Native desktop apps, a single-binary CLI, and a no-install web app. Free, open source, zero-knowledge encrypted storage on every device.",
    url: "https://zcrypt.cloud/download",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Download zcrypt — Encrypted storage for every device",
    description:
      "Desktop apps for macOS, Windows, Linux, a single-binary CLI, and a web app. Free and open source.",
  },
};

export default function DownloadPage() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: "https://zcrypt.cloud" },
          { name: "Download", url: "https://zcrypt.cloud/download" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative flex min-h-[64dvh] flex-col items-center justify-center overflow-hidden px-6 py-24 md:py-32">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[var(--color-bg)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px] dark:bg-cyan-500/8" />
          <div className="absolute right-1/4 top-1/4 h-[300px] w-[300px] rounded-full bg-violet-500/8 blur-[100px]" />
        </div>

        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-sm font-medium text-cyan-600 backdrop-blur-sm dark:text-cyan-400">
            <Download className="h-3.5 w-3.5" />
            <span className="tracking-wide">Apps for every device</span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
          </div>

          <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            Your encrypted drive,{" "}
            <span className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-blue-500">
              everywhere you work.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            Native desktop apps, a single-binary terminal client, and a web app
            that needs no install. Same zero-knowledge vault, every platform.
          </p>

          <div className="mt-10">
            <DownloadCta />
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[var(--color-text-muted)]">
            {["Free & open source", "Zero-knowledge", "No telemetry", "macOS · Windows · Linux"].map(
              (t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ═══ DESKTOP APPS ═══ */}
      <section id="desktop" className="scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Desktop apps
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
              A native app built with Tauri — small, fast, and sandboxed. Your
              files are encrypted on your device before they ever leave it.
            </p>
          </div>

          <DesktopGrid />

          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-[var(--color-text-muted)]">
            Looking for a specific build or an older version? Browse{" "}
            <a
              href={`${GITHUB_REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
            >
              all releases on GitHub
            </a>
            .
          </p>
        </div>
      </section>

      {/* ═══ TERMINAL / CLI ═══ */}
      <section id="cli" className="scroll-mt-20 bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
              <Terminal className="h-3.5 w-3.5 text-cyan-500" />
              Terminal app
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Live in the terminal?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
              A single Go binary with zero dependencies — works great over SSH
              and on headless servers. Pick a package manager:
            </p>
          </div>

          <InstallCommands methods={tuiInstallMethods} />

          <CliBinaries />
        </div>
      </section>

      {/* ═══ WEB APP ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="card relative overflow-hidden p-8 sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
            />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-md">
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
                  <Globe className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Prefer no install?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  The full encrypted drive runs in any modern browser — folders,
                  previews, sharing, and transfers. Everything is still encrypted
                  on your device. Nothing to download.
                </p>
              </div>
              <Link
                href="/register"
                className="group inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-cyan-500 px-7 py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-500/20 transition-colors hover:bg-cyan-400"
              >
                Open the web app
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ OPEN SOURCE / TRUST ═══ */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            Every build is open source
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Desktop, terminal, and web — all built in the open from the same
            repository. Read the code, check the checksums, or build it yourself.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]"
            >
              <Github className="h-4 w-4" />
              Source on GitHub
            </a>
            <Link
              href="/docs/self-hosting"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              Self-host zcrypt
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
