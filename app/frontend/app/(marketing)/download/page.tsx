import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  ArrowRight,
  ShieldCheck,
  Github,
  Terminal,
  Smartphone,
  Globe,
  ExternalLink,
} from "@/lib/icons";
import { tuiInstallMethods, GITHUB_REPO, downloadPageContent } from "@/lib/data";
import {
  SoftwareApplicationJsonLd,
  BreadcrumbJsonLd,
} from "@/components/seo/json-ld";
import { DownloadCta } from "@/components/marketing/download/download-cta";
import { InstallCommands } from "@/components/marketing/download/install-commands";
import { DesktopGrid } from "@/components/marketing/download/desktop-grid";
import { AndroidDownload } from "@/components/marketing/download/android-download";
import { CliBinaries } from "@/components/marketing/download/cli-binaries";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { getLatestRelease } from "@/lib/releases";

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

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const { hero, desktop, android, cli, web, openSource } = downloadPageContent;

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
      <MarketingHero
        badge={
          <div className="inline-flex items-center gap-2.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-sm font-medium text-cyan-600 backdrop-blur-sm dark:text-cyan-400">
            <Download className="h-3.5 w-3.5" />
            <span className="tracking-wide">{hero.badge}</span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
          </div>
        }
        headline={
          <h1 className="font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            Your encrypted drive,{" "}
            <span className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-blue-500">
              everywhere you work.
            </span>
          </h1>
        }
        subtext={hero.subtext}
        cta={<DownloadCta release={release} />}
        trustItems={[...hero.trustItems]}
      />

      {/* ═══ DESKTOP APPS ═══ */}
      <section id="desktop" className="scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {desktop.heading}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
              {desktop.subheading}
            </p>
          </div>

          <DesktopGrid release={release} />

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

      {/* ═══ ANDROID (SIDELOAD APK) ═══ */}
      <section id="android" className="scroll-mt-20 px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
              <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
              {android.badge}
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {android.heading}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
              {android.subheading}
            </p>
          </div>

          <AndroidDownload />
        </div>
      </section>

      {/* ═══ TERMINAL / CLI ═══ */}
      <section id="cli" className="scroll-mt-20 bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
              <Terminal className="h-3.5 w-3.5 text-cyan-500" />
              {cli.badge}
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {cli.heading}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-text-secondary)]">
              {cli.subheading}
            </p>
          </div>

          <InstallCommands methods={tuiInstallMethods} />

          <CliBinaries release={release} />
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
                  {web.heading}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {web.body}
                </p>
              </div>
              <Link
                href="/register"
                className="group inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-cyan-500 px-7 py-3.5 text-sm font-bold text-slate-900 shadow-lg shadow-cyan-500/20 transition-colors hover:bg-cyan-400"
              >
                {web.cta}
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
            {openSource.heading}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {openSource.body}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]"
            >
              <Github className="h-4 w-4" />
              {openSource.githubCta}
            </a>
            <Link
              href="/docs/self-hosting"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              {openSource.selfHostCta}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
