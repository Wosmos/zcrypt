import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Monitor,
  Terminal,
  ShieldCheck,
  Server,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";

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

const related = [
  { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "The file explorer at the heart of every surface." },
  { href: "/docs/web-app", title: "Web app guide", desc: "Get going in the browser in under a minute." },
  { href: "/docs/desktop-app", title: "Desktop app guide", desc: "Install the native build for your platform." },
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
      <FeatureHero
        eyebrow="Web, desktop & terminal"
        headlineTop="One vault."
        headlineGradient="Three ways to reach it."
        subtext={
          <>
            The same zero-knowledge core, wherever you work: a web app in any
            browser, a native desktop app for macOS, Windows and Linux, and a
            single-binary terminal app that runs over SSH. The encryption never
            changes — only the interface does.
          </>
        }
        secondaryLabel="See the terminal app"
        secondaryHref="/tui"
      >
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
      </FeatureHero>

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
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3 list-none">
            {surfaces.map((s) => (
              <li
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
              </li>
            ))}
          </ul>
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
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="The same vault, wherever you are"
            subtext="Free and open source. Create an account once and reach it from the web, your desktop, or a terminal."
          />
        </div>
      </section>
    </>
  );
}
