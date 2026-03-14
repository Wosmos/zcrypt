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
} from "@/lib/icons";
import { tuiFeatures, tuiInstallMethods } from "@/lib/data";

export const metadata: Metadata = {
  title: "zcrypt TUI — Your Vault, From the Terminal",
  description:
    "A full terminal interface for zcrypt. Upload, download, browse, and manage your encrypted vault without leaving the command line.",
};

const featureIconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = { Upload, Search, HardDrive, Lock, Settings, Shield };

export default function TUIPage() {
  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[60dvh] flex flex-col items-center justify-center px-6 py-24 md:py-32 overflow-hidden">
        {/* Dark terminal-aesthetic background */}
        <div className="absolute inset-0 -z-10 bg-[var(--color-bg)]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/8 rounded-full blur-[120px]" />
        </div>

        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-sm font-medium text-cyan-600 dark:text-cyan-400 mb-8">
            <Terminal className="h-3.5 w-3.5" />
            <span className="tracking-wide">Terminal Interface</span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight font-heading leading-[1.08]">
            zcrypt, from your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              terminal.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed">
            A full-featured terminal app for your encrypted vault. Upload,
            download, browse — all without leaving the command line.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-bold text-slate-900 hover:scale-[1.02] active:scale-[0.98] transition-all hover:shadow-xl hover:shadow-cyan-500/25"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#install"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              View install instructions
            </a>
          </div>
        </div>
      </section>

      {/* ═══ TERMINAL MOCKUP ═══ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-xl border border-[var(--color-border)] bg-[#09090b] overflow-hidden shadow-2xl shadow-black/20">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="text-xs text-white/30 font-mono ml-2">
                zcrypt — terminal
              </span>
            </div>
            {/* Terminal content */}
            <div className="p-5 font-mono text-sm leading-relaxed">
              <div className="text-white/40">
                <span className="text-cyan-400">$</span> zcrypt
              </div>
              <div className="mt-4 text-white/70">
                <pre className="whitespace-pre text-[13px] leading-6">{`  ╭─────────────────────────────────────────╮
  │  zcrypt vault            ▸ 14 files    │
  ├─────────────────────────────────────────┤
  │  📄  quarterly-report.pdf     12.4 MB   │
  │  🖼️  vacation-photos.zip     847.2 MB   │
  │  📦  project-backup.tar.gz    2.1 GB   │
  │  📄  tax-documents-2025.pdf    4.8 MB   │
  │  🎵  playlist-export.zip      96.3 MB   │
  ╰─────────────────────────────────────────╯`}</pre>
              </div>
              <div className="mt-3 text-white/40 text-xs">
                <span className="text-cyan-400/60">j/k</span> navigate{" "}
                <span className="text-cyan-400/60 ml-3">u</span> upload{" "}
                <span className="text-cyan-400/60 ml-3">d</span> download{" "}
                <span className="text-cyan-400/60 ml-3">/</span> search{" "}
                <span className="text-cyan-400/60 ml-3">:</span> command
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need, in the terminal
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tuiFeatures.map((f, i) => {
              const Icon = featureIconMap[f.icon];
              return (
                <div
                  key={i}
                  className="card p-6 group hover:border-[var(--color-text-muted)] transition-colors"
                >
                  <div className="mb-4 inline-flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-500/10 text-cyan-500 group-hover:scale-110 transition-transform">
                    {Icon && <Icon size={20} />}
                  </div>
                  <h3 className="text-sm font-bold mb-1">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ INSTALL ═══ */}
      <section id="install" className="py-24 px-4 scroll-mt-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Install
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Get started in seconds
            </h2>
          </div>

          <div className="space-y-4">
            {tuiInstallMethods.map((m, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                    {m.label}
                  </span>
                </div>
                <div className="px-4 py-3 bg-[#09090b]">
                  <code className="text-sm font-mono text-cyan-400">
                    {m.command}
                  </code>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-[var(--color-text-muted)] mt-6">
            Requires Go 1.25 or later.
          </p>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to try it?
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
            Create a free account, install the TUI, and start encrypting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-bold text-slate-900 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
