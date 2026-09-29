import type { Metadata } from "next";
import {
  ChevronRight,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  Lock,
  Search,
  Settings,
  Shield,
  Terminal,
  Upload,
} from "@/lib/icons";
import { tuiFeatures, tuiShortcuts, tuiCommands, tuiProfiles } from "@/lib/data";
import { TUIApplicationJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/lib/site";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, MarketingCard } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";

export const metadata: Metadata = {
  title: "zcrypt TUI. Encrypted Cloud Storage from the Terminal | CLI for Linux, macOS, Windows",
  description:
    "Open-source terminal app for zcrypt. Upload, download, and manage your zero-knowledge encrypted vault with real-time progress, 2FA, and four performance profiles. Single binary, zero dependencies.",
  keywords: [
    "zcrypt",
    "terminal",
    "TUI",
    "CLI",
    "encrypted storage",
    "zero-knowledge",
    "AES-256",
    "Go",
    "Bubble Tea",
    "command line",
    "file encryption",
    "cloud storage CLI",
    "SSH",
    "headless server",
    "open source",
  ],
  alternates: {
    canonical: `${SITE_URL}/tui`,
  },
  openGraph: {
    title: "zcrypt TUI. Your Encrypted Vault, from the Terminal",
    description:
      "Upload, download, and manage your zero-knowledge encrypted vault from the command line. Real-time progress, 2FA, performance profiles. Single Go binary.",
    url: `${SITE_URL}/tui`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "zcrypt TUI. Encrypted Cloud Storage from the Terminal",
    description:
      "Single binary terminal app. AES-256-GCM encryption, real-time progress tracking. Open source.",
  },
};

const featureIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Upload,
  Search,
  HardDrive,
  Lock,
  Settings,
  Shield,
  Terminal,
  Gauge,
  Cpu,
};

const profileBars: Record<string, string> = {
  Light: "w-1/4 bg-emerald-500",
  Normal: "w-2/4 bg-cyan-500",
  Intense: "w-3/4 bg-amber-500",
  Ludicrous: "w-full bg-rose-500",
};

const installMethods = [
  { label: "Homebrew", note: "macOS / Linux", cmd: "brew install Wosmos/zcrypt/zcrypt" },
  { label: "npm", note: "All platforms", cmd: "npm i -g @zcrypt/cli" },
  {
    label: "Scoop",
    note: "Windows",
    cmd: "scoop bucket add zcrypt https://github.com/Wosmos/scoop-zcrypt && scoop install zcrypt",
  },
  { label: "Shell", note: "macOS / Linux", cmd: `curl -fsSL ${SITE_URL}/install.sh | sh` },
];

const mockKeys = [
  { key: "u", label: "upload" },
  { key: "d", label: "download" },
  { key: "space", label: "select" },
  { key: "/", label: "search" },
  { key: ":", label: "command" },
  { key: "?", label: "help" },
];

const terminalShell =
  "overflow-hidden rounded-[var(--pv2-r-tile)] corner-squircle border border-white/10 bg-[#09090b] shadow-2xl shadow-black/30";

function TerminalBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-mono text-xs text-white/40">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function TUIPage() {
  return (
    <>
      <TUIApplicationJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: SITE_URL },
          { name: "Terminal App", url: `${SITE_URL}/tui` },
        ]}
      />

      <PageHero
        eyebrow="Terminal app"
        title="Your encrypted vault, from the terminal"
        lede="A full-featured terminal app built with Go. Upload, download, and manage your zero-knowledge encrypted vault without leaving the command line."
        actions={
          <>
            <PillLink href="/register">Get started free</PillLink>
            <PillLink href="#install" variant="secondary">
              Install instructions
            </PillLink>
          </>
        }
        note="Open source. Single binary. Works over SSH. Linux, macOS and Windows."
      >
        <div className={`${terminalShell} mx-auto mt-12 max-w-3xl text-left`}>
          <TerminalBar title="zcrypt">
            <span className="font-mono text-[10px] text-emerald-400/60">normal</span>
          </TerminalBar>
          <div className="p-5 font-mono text-sm leading-relaxed">
            <div className="text-white/40">
              <span className="text-cyan-400">$</span> zcrypt
            </div>
            <pre className="mt-4 overflow-x-auto whitespace-pre text-[13px] leading-6 text-white/70">{`  zcrypt vault                    14 files   3.2 GB / 10 GB  FREE
  ─────────────────────────────────────────────────────────────
   Name                         Size      Type    Chunks  Date
  ─────────────────────────────────────────────────────────────
   quarterly-report.pdf         12.4 MB   doc        2   Mar 20
   vacation-photos.zip         847.2 MB   archive   85   Mar 18
 > project-backup.tar.gz        2.1 GB   archive  210   Mar 15
   tax-documents-2025.pdf        4.8 MB   doc        1   Mar 12
   playlist-export.zip          96.3 MB   archive   10   Mar 10`}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {mockKeys.map((k) => (
                <span key={k.key} className="text-white/40">
                  <span className="font-medium text-cyan-400/70">{k.key}</span> {k.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </PageHero>

      <section id="install" aria-labelledby="tui-install" className="pv2-sec">
        <div className="pv2-wrap [--pv2-container:48rem]">
          <SectionHead
            id="tui-install"
            eyebrow="Install"
            title="One command to install"
            lede={
              <>
                Pick your platform. They all install the same{" "}
                <code className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[0.85em]">
                  zcrypt
                </code>{" "}
                binary.
              </>
            }
          />

          <div className={terminalShell}>
            <TerminalBar title="install" />
            <div className="divide-y divide-white/5 font-mono text-sm">
              {installMethods.map((m) => (
                <div key={m.label} className="flex items-start gap-3 px-5 py-3">
                  <span className="select-none pt-px text-cyan-500/60">$</span>
                  <code className="min-w-0 flex-1 break-all text-cyan-400">{m.cmd}</code>
                  <span className="hidden flex-shrink-0 items-center gap-1.5 pt-1 text-[10px] sm:flex">
                    <span className="font-sans font-medium text-white/50">{m.label}</span>
                    <span className="font-sans text-white/30">{m.note}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <PillLink href="/download" variant="secondary" icon={Download}>
              Download binaries
            </PillLink>
            <p className="text-center text-sm text-[var(--color-text-secondary)]">
              Linux, macOS and Windows on amd64 and arm64. Single binary, zero dependencies.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="tui-features" className="pv2-sec">
        <div className="pv2-wrap">
          <SectionHead
            id="tui-features"
            eyebrow="Features"
            title="Everything you need, nothing you don't"
            lede="Built with Go for a fast, native terminal experience."
          />
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tuiFeatures.map((f) => {
              const Icon = featureIconMap[f.icon];
              return (
                <MarketingCard key={f.title} as="li" size="sm" className="p-6">
                  {Icon ? <IconWell icon={Icon} /> : null}
                  <h3 className="pv2-h3 mt-5">{f.title}</h3>
                  <p className="pv2-body mt-2">{f.desc}</p>
                </MarketingCard>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="shortcuts" aria-labelledby="tui-shortcuts" className="pv2-sec">
        <div className="pv2-wrap [--pv2-container:56rem]">
          <SectionHead
            id="tui-shortcuts"
            eyebrow="Keyboard"
            title="Shortcuts and commands"
            lede="Navigate, search, upload and download, all from the keyboard."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={terminalShell}>
              <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                <Terminal className="h-3.5 w-3.5 text-cyan-500" />
                <span className="text-xs font-medium text-white/60">Dashboard keys</span>
              </div>
              <ul className="list-none divide-y divide-white/5">
                {tuiShortcuts.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-white/50">{s.action}</span>
                    <kbd className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-cyan-400/80">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>

            <div className={terminalShell}>
              <div className="flex items-center gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                <ChevronRight className="h-3.5 w-3.5 text-cyan-500" />
                <span className="text-xs font-medium text-white/60">Command mode</span>
                <kbd className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400/80">
                  :
                </kbd>
              </div>
              <ul className="list-none divide-y divide-white/5">
                {tuiCommands.map((c) => (
                  <li key={c.cmd} className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-white/50">{c.desc}</span>
                    <code className="font-mono text-[11px] text-cyan-400/80">{c.cmd}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="tui-profiles" className="pv2-sec">
        <div className="pv2-wrap">
          <SectionHead
            id="tui-profiles"
            eyebrow="Performance profiles"
            title="Four speeds. You pick"
            lede="Control how aggressively the TUI uses your machine."
          />
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tuiProfiles.map((p) => (
              <MarketingCard key={p.name} as="li" size="sm" className="p-6">
                <div className="flex items-center gap-2">
                  <h3 className="pv2-h3">{p.name}</h3>
                  {p.name === "Normal" && (
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-[var(--pv2-accent-ink)]">
                      Default
                    </span>
                  )}
                </div>
                <div className="my-4 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className={`h-full rounded-full ${profileBars[p.name] ?? "w-1/2 bg-cyan-500"}`}
                  />
                </div>
                <dl className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                  {[
                    ["Workers", p.workers],
                    ["Chunks", p.chunkSize],
                    ["Compression", p.compression],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt>{k}</dt>
                      <dd className="font-mono text-[var(--color-text)]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="pv2-body mt-4 text-[13px]!">{p.desc}</p>
              </MarketingCard>
            ))}
          </ul>
        </div>
      </section>

      <ClosingCta id="tui-cta" label="Create free account" />
    </>
  );
}
