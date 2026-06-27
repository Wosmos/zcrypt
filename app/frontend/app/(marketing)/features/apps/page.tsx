import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Globe,
  Monitor,
  Terminal,
  ShieldCheck,
  Server,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Web, Desktop & Terminal — One Encrypted Vault, Three Surfaces",
  description:
    "The same zero-knowledge core wherever you work: a web app in any browser, a native desktop app for macOS, Windows and Linux, and a single-binary terminal app (TUI) that runs over SSH. Your encryption never changes — only the interface does.",
  keywords: [
    "encrypted storage apps",
    "web app",
    "desktop app",
    "terminal app",
    "TUI",
    "CLI encrypted storage",
    "macOS Windows Linux",
    "SSH file storage",
    "cross-platform encryption",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/apps" },
  openGraph: {
    title: "Web, Desktop & Terminal — One Encrypted Vault | zcrypt",
    description:
      "One zero-knowledge core across three surfaces: web in any browser, a native desktop app, and a single-binary TUI that works over SSH.",
    url: "https://zcrypt.cloud/features/apps",
    type: "website",
  },
};

const surfaces = [
  {
    Icon: Globe,
    name: "Web app",
    tagline: "Any browser, nothing to install",
    desc: "The full vault in any modern browser. Encryption runs in the page itself, so your files are sealed before they leave the tab — no extension, no download.",
    points: ["Works on any OS", "Drag-and-drop uploads", "In-browser previews", "Always the latest build"],
    href: "/docs/web-app",
    cta: "Web app docs",
    external: false,
  },
  {
    Icon: Monitor,
    name: "Desktop app",
    tagline: "Native on macOS, Windows & Linux",
    desc: "A native desktop build for when zcrypt is part of your daily workflow. Sits in your dock or tray, handles large transfers comfortably, and feels at home on your machine.",
    points: ["macOS, Windows, Linux", "Built for large files", "Lives in the background", "Same encrypted vault"],
    href: "/docs/desktop-app",
    cta: "Desktop app docs",
    external: false,
  },
  {
    Icon: Terminal,
    name: "Terminal app (TUI)",
    tagline: "One binary, works over SSH",
    desc: "A single-binary terminal app written in Go. No runtime, no browser — just one small executable that runs anywhere you have a shell, including headless servers over SSH.",
    points: ["Single binary", "Zero dependencies", "Runs over SSH", "Scriptable & fast"],
    href: "/tui",
    cta: "Explore the TUI",
    external: false,
  },
];

const comparison = [
  {
    surface: "Web app",
    bestFor: "Quick access from any machine",
    install: "Nothing — open a browser",
    runsOn: "Any OS with a modern browser",
  },
  {
    surface: "Desktop app",
    bestFor: "Daily use and big transfers",
    install: "Native installer",
    runsOn: "macOS, Windows, Linux",
  },
  {
    surface: "Terminal (TUI)",
    bestFor: "Servers, SSH, and the keyboard",
    install: "One binary",
    runsOn: "Linux, macOS, Windows · amd64 & arm64",
  },
];

export default function AppsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Apps", url: "https://zcrypt.cloud/features/apps" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Web, desktop &amp; terminal
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            One vault.
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              Three ways to reach it.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            The same zero-knowledge core, wherever you work: a web app in any
            browser, a native desktop app for macOS, Windows and Linux, and a
            single-binary terminal app that runs over SSH. The encryption never
            changes — only the interface does.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              Create your vault
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/tui"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              See the terminal app
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Three-surface mock */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* browser */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl shadow-black/10 dark:shadow-black/30">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <div className="ml-2 flex-1 truncate rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-[9px] text-[var(--color-text-muted)] dark:bg-white/[0.04]">
                  zcrypt.cloud
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Globe className="h-7 w-7 text-cyan-500" />
                <div className="text-xs font-bold">Web</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  any browser
                </div>
              </div>
            </div>

            {/* desktop */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl shadow-black/10 dark:shadow-black/30">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-[9px] text-[var(--color-text-muted)]">
                  zcrypt
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Monitor className="h-7 w-7 text-cyan-500" />
                <div className="text-xs font-bold">Desktop</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  macOS · Win · Linux
                </div>
              </div>
            </div>

            {/* terminal */}
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#09090b] shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-[9px] text-white/30">
                  ssh · zcrypt
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Terminal className="h-7 w-7 text-cyan-400" />
                <div className="text-xs font-bold text-white/90">Terminal</div>
                <div className="font-mono text-[10px] text-white/30">
                  one binary
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SHARED CORE ═══ */}
      <section className="px-4 pb-4 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
            <div className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text)]">The same encryption everywhere.</span>{" "}
              Web, desktop, and terminal all run the identical zero-knowledge
              pipeline — compress, encrypt with AES-256-GCM, chunk, and upload —
              entirely on your device. Pick a surface for the workflow, not for
              the security. It&apos;s the same vault and the same guarantees on
              all three.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ THE THREE SURFACES ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Pick where you work
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Three front ends over one encrypted backend. Use whichever fits the
              moment — or all three.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {surfaces.map((s) => (
              <div
                key={s.name}
                className="card flex flex-col p-6 transition-colors hover:border-cyan-500/30"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <s.Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold">{s.name}</h3>
                <p className="mt-0.5 text-xs font-medium text-cyan-600 dark:text-cyan-400">
                  {s.tagline}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {s.desc}
                </p>
                <ul className="mt-4 space-y-2">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href={s.href}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
                >
                  {s.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Which one when?
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              A quick way to choose. There&apos;s no wrong answer — they all open
              the same vault.
            </p>
          </div>

          {/* table on md+, cards on mobile */}
          <div className="overflow-x-auto">
            <table className="hidden w-full border-collapse text-left text-sm md:table">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Surface
                  </th>
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Best for
                  </th>
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Install
                  </th>
                  <th className="py-3 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Runs on
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.surface} className="border-b border-[var(--color-border)]">
                    <td className="py-4 pr-4 font-semibold">{row.surface}</td>
                    <td className="py-4 pr-4 text-[var(--color-text-secondary)]">{row.bestFor}</td>
                    <td className="py-4 pr-4 text-[var(--color-text-secondary)]">{row.install}</td>
                    <td className="py-4 text-[var(--color-text-secondary)]">{row.runsOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 md:hidden">
            {comparison.map((row) => (
              <div key={row.surface} className="card p-5">
                <h3 className="text-sm font-bold">{row.surface}</h3>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Best for</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.bestFor}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Install</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.install}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Runs on</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.runsOn}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-[var(--color-text-muted)]">
            <Server className="h-3.5 w-3.5 flex-shrink-0" />
            One account, one encrypted vault — switch surfaces any time without
            re-uploading a thing.
          </p>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-heading text-xl font-bold">Keep exploring</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "The file explorer at the heart of every surface." },
              { href: "/docs/web-app", title: "Web app guide", desc: "Get going in the browser in under a minute." },
              { href: "/docs/desktop-app", title: "Desktop app guide", desc: "Install the native build for your platform." },
            ].map((r) => (
              <Link key={r.href} href={r.href} className="card group p-5 transition-colors hover:border-cyan-500/40">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  {r.title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{r.desc}</p>
              </Link>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              The same vault, wherever you are
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Free and open source. Create an account once and reach it from the
              web, your desktop, or a terminal.
            </p>
            <Link
              href="/register"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              Create your vault
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
