import type { Metadata } from "next";
import Link from "next/link";
import {
  Terminal,
  ArrowRight,
  Upload,
  Search,
  HardDrive,
  Lock,
  Settings,
  Shield,
  Check,
  ChevronRight,
  Gauge,
  Cpu,
  Download,
} from "@/lib/icons";
import { tuiFeatures, tuiShortcuts, tuiCommands, tuiProfiles } from "@/lib/data";
import {
  TUIApplicationJsonLd,
  BreadcrumbJsonLd,
} from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title:
    "zcrypt TUI — Encrypted Cloud Storage from the Terminal | CLI for Linux, macOS, Windows",
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
    canonical: "https://zcrypt.cloud/tui",
  },
  openGraph: {
    title: "zcrypt TUI — Your Encrypted Vault, from the Terminal",
    description:
      "Upload, download, and manage your zero-knowledge encrypted vault from the command line. Real-time progress, 2FA, performance profiles. Single Go binary.",
    url: "https://zcrypt.cloud/tui",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "zcrypt TUI — Encrypted Cloud Storage from the Terminal",
    description:
      "Single binary terminal app. AES-256-GCM encryption, real-time progress tracking. Open source.",
  },
};

const featureIconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = { Upload, Search, HardDrive, Lock, Settings, Shield, Terminal, Gauge, Cpu };

const featureAccents = [
  "from-cyan-500/15 to-cyan-500/5",
  "from-violet-500/15 to-violet-500/5",
  "from-blue-500/15 to-blue-500/5",
  "from-amber-500/15 to-amber-500/5",
  "from-rose-500/15 to-rose-500/5",
  "from-emerald-500/15 to-emerald-500/5",
  "from-indigo-500/15 to-indigo-500/5",
  "from-teal-500/15 to-teal-500/5",
];
const featureIconColors = [
  "text-cyan-500",
  "text-violet-500",
  "text-blue-500",
  "text-amber-500",
  "text-rose-500",
  "text-emerald-500",
  "text-indigo-500",
  "text-teal-500",
];

const profileColors: Record<string, string> = {
  Light: "text-emerald-400",
  Normal: "text-cyan-400",
  Intense: "text-amber-400",
  Ludicrous: "text-rose-400",
};

const profileBarWidths: Record<string, string> = {
  Light: "w-1/4",
  Normal: "w-2/4",
  Intense: "w-3/4",
  Ludicrous: "w-full",
};

const profileBarColors: Record<string, string> = {
  Light: "bg-emerald-500",
  Normal: "bg-cyan-500",
  Intense: "bg-amber-500",
  Ludicrous: "bg-gradient-to-r from-rose-500 to-orange-500",
};

export default function TUIPage() {
  return (
    <>
      <TUIApplicationJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: "https://zcrypt.cloud" },
          { name: "Terminal App", url: "https://zcrypt.cloud/tui" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[70dvh] flex flex-col items-center justify-center px-6 py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[var(--color-bg)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 dark:bg-cyan-500/8 rounded-full blur-[120px]" />
          <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-violet-500/8 rounded-full blur-[100px]" />
        </div>

        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-sm font-medium text-cyan-600 dark:text-cyan-400 mb-8 backdrop-blur-sm">
            <Terminal className="h-3.5 w-3.5" />
            <span className="tracking-wide">Terminal Interface</span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight font-heading leading-[1.08]">
            Your encrypted vault,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-500">
              from the terminal.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed">
            A full-featured terminal app built with Go. Upload, download, and
            manage your zero-knowledge encrypted vault without leaving the
            command line.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-bold text-slate-900 hover:scale-[1.02] active:scale-[0.98] transition-all hover:shadow-xl hover:shadow-cyan-500/25"
            >
              Get started free
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#install"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Install instructions
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-[var(--color-text-muted)]">
            {["Open source", "Single binary", "Works over SSH", "Linux, macOS, Windows"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TERMINAL MOCKUP ═══ */}
      <section className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-b from-cyan-500/10 via-blue-500/5 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="relative rounded-xl border border-[var(--color-border)] bg-[#09090b] overflow-hidden shadow-2xl shadow-black/30">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-xs text-white/30 font-mono">
                    zcrypt &mdash; terminal
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400/50">
                  normal
                </span>
              </div>
              <div className="p-5 font-mono text-sm leading-relaxed">
                <div className="text-white/40">
                  <span className="text-cyan-400">$</span> zcrypt
                </div>
                <div className="mt-4 text-white/70">
                  <pre className="whitespace-pre text-[13px] leading-6 overflow-x-auto">{`  zcrypt vault                    14 files   3.2 GB / 10 GB  FREE
  ─────────────────────────────────────────────────────────────
   Name                         Size      Type    Chunks  Date
  ─────────────────────────────────────────────────────────────
   quarterly-report.pdf         12.4 MB   doc        2   Mar 20
   vacation-photos.zip         847.2 MB   archive   85   Mar 18
 > project-backup.tar.gz        2.1 GB   archive  210   Mar 15
   tax-documents-2025.pdf        4.8 MB   doc        1   Mar 12
   playlist-export.zip          96.3 MB   archive   10   Mar 10`}</pre>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {[
                    { key: "u", label: "upload" },
                    { key: "d", label: "download" },
                    { key: "space", label: "select" },
                    { key: "/", label: "search" },
                    { key: ":", label: "command" },
                    { key: "?", label: "help" },
                  ].map((k) => (
                    <span key={k.key} className="text-white/40">
                      <span className="text-cyan-400/60 font-medium">
                        {k.key}
                      </span>{" "}
                      {k.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ INSTALL ═══ */}
      <section id="install" className="py-20 px-4 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              One command to install
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Pick your platform. All install to the same{" "}
              <code className="font-mono text-xs bg-[var(--color-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                zcrypt
              </code>{" "}
              binary.
            </p>
          </div>

          {/* Terminal with all commands */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[#09090b] overflow-hidden shadow-2xl shadow-black/30">
            <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="text-xs text-white/30 font-mono">
                  install &mdash; zcrypt
                </span>
              </div>
            </div>
            <div className="divide-y divide-white/5 font-mono text-sm">
              {[
                { label: "Homebrew", note: "macOS / Linux", cmd: "brew install Wosmos/zcrypt/zcrypt" },
                { label: "npm", note: "All platforms", cmd: "npm i -g @zcrypt/cli" },
                { label: "Scoop", note: "Windows", cmd: "scoop bucket add zcrypt https://github.com/Wosmos/scoop-zcrypt && scoop install zcrypt" },
                { label: "Shell", note: "macOS / Linux", cmd: "curl -fsSL https://zcrypt.cloud/install.sh | sh" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="group flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-cyan-500/60 select-none pt-px">$</span>
                  <code className="flex-1 min-w-0 text-cyan-400 break-all">
                    {m.cmd}
                  </code>
                  <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0 text-[10px] pt-1">
                    <span className="text-white/40 font-sans font-medium">
                      {m.label}
                    </span>
                    <span className="text-white/20 font-sans">{m.note}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center mt-6">
            <a
              href="https://github.com/Wosmos/zcrypt/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-surface)] text-[var(--color-text)] font-medium transition-colors"
            >
              <Download className="h-4 w-4" />
              Download binaries
            </a>
          </div>

          <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">
            Linux, macOS, Windows &mdash; amd64 &amp; arm64. Single binary,
            zero dependencies.
          </p>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="py-20 px-4 bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)] max-w-lg mx-auto">
              Built with Go for a fast, native terminal experience.
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
            {tuiFeatures.map((f, i) => {
              const Icon = featureIconMap[f.icon];
              return (
                <li
                  key={i}
                  className="relative card p-6 group hover:border-[var(--color-border-hover)] transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 overflow-hidden"
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${featureAccents[i]} opacity-0 group-hover:opacity-100 transition-opacity`}
                  />
                  <div
                    className={`mb-4 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br ${featureAccents[i]} ${featureIconColors[i]} group-hover:scale-110 transition-transform`}
                  >
                    {Icon && <Icon size={20} />}
                  </div>
                  <h3 className="text-sm font-bold mb-1.5">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {f.desc}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ═══ KEYBOARD REFERENCE — terminal style ═══ */}
      <section id="shortcuts" className="py-20 px-4 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Shortcuts &amp; commands
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Navigate, search, upload, download &mdash; all from the keyboard.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Keys */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[#09090b] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <Terminal className="h-3.5 w-3.5 text-cyan-500" />
                <span className="text-xs font-medium text-white/50">
                  Dashboard keys
                </span>
              </div>
              <ul className="divide-y divide-white/5 list-none">
                {tuiShortcuts.map((s) => (
                  <li
                    key={s.keys}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <span className="text-xs text-white/40">{s.action}</span>
                    <kbd className="text-[11px] font-mono text-cyan-400/80 bg-white/5 rounded px-2 py-0.5">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>

            {/* Commands */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[#09090b] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
                <ChevronRight className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-medium text-white/50">
                  Command mode
                </span>
                <kbd className="text-[10px] font-mono text-violet-400/80 bg-violet-500/10 rounded px-1.5 py-0.5">
                  :
                </kbd>
              </div>
              <ul className="divide-y divide-white/5 list-none">
                {tuiCommands.map((c) => (
                  <li
                    key={c.cmd}
                    className="flex items-center justify-between px-4 py-2"
                  >
                    <span className="text-xs text-white/40">{c.desc}</span>
                    <code className="text-[11px] font-mono text-cyan-400/80">
                      {c.cmd}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PERFORMANCE PROFILES ═══ */}
      <section className="py-20 px-4 bg-[var(--color-surface)]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Four speeds. You pick.
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Control how aggressively the TUI uses your machine.
            </p>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
            {tuiProfiles.map((p) => (
              <li
                key={p.name}
                className="card p-5 group hover:border-[var(--color-border-hover)] transition-all"
              >
                <div className="flex items-center gap-2 mb-3">
                  <h3
                    className={`text-sm font-bold ${profileColors[p.name] || "text-[var(--color-text)]"}`}
                  >
                    {p.name}
                  </h3>
                  {p.name === "Normal" && (
                    <span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>

                {/* Speed bar */}
                <div className="h-1.5 rounded-full bg-[var(--color-border)] mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${profileBarWidths[p.name]} ${profileBarColors[p.name]}`}
                  />
                </div>

                <div className="space-y-1 text-xs text-[var(--color-text-secondary)] mb-3">
                  <div className="flex justify-between">
                    <span>Workers</span>
                    <span className="font-mono text-[var(--color-text)]">
                      {p.workers}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chunks</span>
                    <span className="font-mono text-[var(--color-text)]">
                      {p.chunkSize}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Compression</span>
                    <span className="font-mono text-[var(--color-text)]">
                      {p.compression}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {p.desc}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
        </div>
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to try it?
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
            Create a free account, install the TUI, and encrypt your first file
            in under a minute.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-bold text-slate-900 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              Create free account
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="https://github.com/Wosmos/zcrypt/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Download binaries
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
