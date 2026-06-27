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
  ChevronRight,
} from "@/lib/icons";
import {
  desktopPlatforms,
  cliBinaries,
  tuiInstallMethods,
  DESKTOP_VERSION,
  CLI_VERSION,
  CHECKSUMS_URL,
  LATEST_RELEASE_URL,
  GITHUB_REPO,
  type PlatformId,
  type CliBinary,
} from "@/lib/data";
import {
  SoftwareApplicationJsonLd,
  BreadcrumbJsonLd,
} from "@/components/seo/json-ld";
import { OS_GLYPHS } from "@/components/marketing/download/os-glyphs";
import { DownloadCta } from "@/components/marketing/download/download-cta";
import { InstallCommands } from "@/components/marketing/download/install-commands";

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

const platformGlyphCls: Record<PlatformId, string> = {
  macos: "text-[var(--color-text)]",
  windows: "text-[#3b82f6]",
  linux: "text-[var(--color-text)]",
};

// Subtle platform-tinted glow revealed on card hover.
const platformGlow: Record<PlatformId, string> = {
  macos: "bg-cyan-400/15",
  windows: "bg-blue-500/15",
  linux: "bg-amber-400/15",
};

function groupCli(binaries: CliBinary[]) {
  const order: CliBinary["os"][] = ["macOS", "Linux", "Windows"];
  return order.map((os) => ({
    os,
    items: binaries.filter((b) => b.os === os),
  }));
}

export default function DownloadPage() {
  const cliGroups = groupCli(cliBinaries);

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

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {desktopPlatforms.map((platform) => {
              const Glyph = OS_GLYPHS[platform.id];
              const primary =
                platform.options.find((o) => o.recommended) ?? platform.options[0];
              const others = platform.options.filter((o) => o !== primary);
              return (
                <div
                  key={platform.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-border-hover)] hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/30"
                >
                  {/* platform-tinted glow on hover */}
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 ${platformGlow[platform.id]}`}
                  />

                  <div className="relative flex items-start justify-between">
                    <Glyph
                      className={`h-12 w-12 transition-transform duration-300 group-hover:scale-105 ${platformGlyphCls[platform.id]}`}
                    />
                    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                      v{DESKTOP_VERSION}
                    </span>
                  </div>

                  <h3 className="relative mt-6 text-xl font-bold tracking-tight">
                    {platform.name}
                  </h3>
                  <p className="relative mt-1.5 min-h-[2.5rem] text-[13px] leading-relaxed text-[var(--color-text-muted)]">
                    {platform.blurb}
                  </p>

                  <div className="relative mt-6 flex flex-1 flex-col justify-end">
                    <a
                      href={primary.href}
                      className="group/dl flex items-center justify-center gap-2 rounded-xl bg-[var(--color-text)] px-4 py-3 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
                    >
                      <Download className="h-4 w-4 transition-transform group-hover/dl:translate-y-0.5" />
                      Download for {platform.name}
                    </a>
                    <p className="mt-2.5 text-center text-[11px] text-[var(--color-text-muted)]">
                      {primary.sublabel}
                      {others.length > 0 && (
                        <>
                          {" · also "}
                          {others.map((o, i) => (
                            <span key={o.label}>
                              {i > 0 && ", "}
                              <a
                                href={o.href}
                                className="font-medium text-[var(--color-text-secondary)] underline-offset-2 transition-colors hover:text-cyan-600 hover:underline dark:hover:text-cyan-400"
                              >
                                {o.sublabel.split("·").pop()?.trim()}
                              </a>
                            </span>
                          ))}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-[var(--color-text-muted)]">
            Looking for a specific build or an older version? Browse{" "}
            <a
              href={LATEST_RELEASE_URL}
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

          {/* Direct binaries */}
          <div className="mt-8">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Or grab a prebuilt binary &middot; v{CLI_VERSION}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {cliGroups.map((group) => (
                <div
                  key={group.os}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
                >
                  <p className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">
                    {group.os}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.items.map((b) => (
                      <a
                        key={b.arch}
                        href={b.href}
                        className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {b.arch}
                        <Download className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/tui"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]"
            >
              Explore the terminal app
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href={CHECKSUMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify checksums
            </a>
          </div>
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
