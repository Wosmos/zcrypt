import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  HardDrive,
  Github,
  GitBranch,
  Send,
  Cloud,
  Box,
  RefreshCw,
  Layers,
  Infinity as InfinityIcon,
  Lock,
  Check,
  Server,
  FileText,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Bring Your Own Storage — Your Data, Your Infrastructure",
  description:
    "zcrypt never sells you storage. Connect accounts you already own — GitHub, GitLab, Hugging Face, Telegram — and your encrypted chunks fan out across them. Repos rotate automatically as they fill, so your space grows on its own. No lock-in.",
  keywords: [
    "bring your own storage",
    "BYO storage",
    "self-hosted encrypted storage",
    "github as storage",
    "no vendor lock-in",
    "decentralized file storage",
    "encrypted storage backend",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/bring-your-own-storage" },
  openGraph: {
    title: "Bring Your Own Storage | zcrypt",
    description:
      "Connect GitHub, GitLab, Hugging Face, and Telegram accounts you already own. Encrypted chunks fan out across them and repos rotate automatically. Your data, your infrastructure, no lock-in.",
    url: "https://zcrypt.cloud/features/bring-your-own-storage",
    type: "website",
  },
};

const adapters = [
  {
    Icon: Github,
    name: "GitHub",
    capacity: "~850 MB / repo",
    note: "The default. Spin up as many repos as you like.",
  },
  {
    Icon: GitBranch,
    name: "GitLab",
    capacity: "~9 GB / repo",
    note: "Roomier repos for heavier vaults.",
  },
  {
    Icon: Cloud,
    name: "Hugging Face",
    capacity: "~280 GB / repo",
    note: "Built for large files — serious headroom.",
  },
  {
    Icon: Send,
    name: "Telegram",
    capacity: "~50 MB / file",
    note: "Many small chunks, spread wide.",
  },
];

const capabilities = [
  {
    Icon: Layers,
    title: "Chunks fan out",
    desc: "Each file is encrypted, then split into chunks that spread across the accounts you've connected. No single repo holds the whole picture.",
  },
  {
    Icon: RefreshCw,
    title: "Automatic repo rotation",
    desc: "When a repo nears its platform's ceiling, zcrypt rotates to a fresh one on its own. Your usable space grows without you lifting a finger.",
  },
  {
    Icon: InfinityIcon,
    title: "Space that grows",
    desc: "Connect more accounts, get more room. There's no zcrypt-sold quota to bump against — your capacity is whatever you already have.",
  },
  {
    Icon: Lock,
    title: "Disguised on arrival",
    desc: "Chunks are stored looking like ordinary build-cache files — unremarkable artifacts in a code repo, not obvious encrypted blobs.",
  },
  {
    Icon: Server,
    title: "Your infrastructure",
    desc: "The bytes sit in accounts you control and can walk away with. zcrypt orchestrates; it doesn't hold your storage hostage.",
  },
  {
    Icon: HardDrive,
    title: "No lock-in",
    desc: "Disconnect a platform or leave entirely — your accounts are yours. Open source, so the mechanics are never a black box.",
  },
];

export default function BringYourOwnStoragePage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          {
            name: "Bring your own storage",
            url: "https://zcrypt.cloud/features/bring-your-own-storage",
          },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Bring your own storage
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            We don&apos;t sell you storage.
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              You already have it.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Connect accounts you own — GitHub, GitLab, Hugging Face, Telegram — and your
            encrypted chunks fan out across them. Repos rotate automatically as they
            fill, so your space grows on its own. Your data, your infrastructure, no
            lock-in.
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
              href="/docs/platform-adapters"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              Read the docs
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Adapters mock */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <div className="ml-3 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                <Server className="h-3 w-3" /> Connected storage
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                <Lock className="h-2.5 w-2.5" /> Encrypted before upload
              </span>
            </div>
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {adapters.map((a) => (
                  <div
                    key={a.name}
                    className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-3 dark:bg-white/[0.02]"
                  >
                    <a.Icon className="h-5 w-5 text-cyan-500" />
                    <div className="mt-2 text-xs font-semibold">{a.name}</div>
                    <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {a.capacity}
                    </div>
                  </div>
                ))}
              </div>
              {/* chunk fan-out row */}
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <Box className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                    chunk-01
                  </span>
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                    chunk-02
                  </span>
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                    chunk-03
                  </span>
                  <span className="text-[var(--color-text-muted)]">→ disguised as build-cache, spread across repos</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ADAPTERS DETAIL ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Connect what you already pay for
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Four platforms, each with its own generous limits. Mix and match — the
              more you connect, the more room you have.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {adapters.map((a) => (
              <article
                key={a.name}
                className="card p-6 transition-colors hover:border-cyan-500/30"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <a.Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold">{a.name}</h3>
                <p className="mt-1 font-mono text-xs text-cyan-600 dark:text-cyan-400">
                  {a.capacity}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {a.note}
                </p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-[var(--color-text-muted)]">
            Capacities are approximate, per-repo or per-file platform limits and can
            change at the providers&apos; discretion. zcrypt works within whatever each
            platform currently allows.
          </p>
        </div>
      </section>

      {/* ═══ HOW IT GROWS ═══ */}
      <section className="px-4 pb-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="card p-6 transition-colors hover:border-cyan-500/30"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ OWNERSHIP TIE-IN ═══ */}
      <section className="mt-16 border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Your data, your infrastructure
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Nothing to be locked into
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              Most cloud storage rents you space on the provider&apos;s servers, on the
              provider&apos;s terms. zcrypt flips that: it&apos;s an encryption and
              orchestration layer over storage you already own. Everything is encrypted
              on your device first, then chunks are disguised as ordinary build-cache
              files and distributed across your connected accounts. Walk away whenever
              you like — the accounts, and the bytes in them, were always yours.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Encrypted on your device before any upload",
                "Chunks disguised as routine build-cache artifacts",
                "Distributed across accounts you control",
                "Disconnect or leave anytime — no captive data",
              ].map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]"
                >
                  <Check className="h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/repo-pool"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How the repo pool rotates
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            <div className="mb-2 text-[var(--color-text-secondary)]">
              // how a file lands in your storage
            </div>
            <div>
              <span className="text-cyan-600/80 dark:text-cyan-400/80">1</span> encrypt
              on device — AES-256-GCM
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">2</span> split
              into chunks
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">3</span> disguise
              as <span className="text-[var(--color-text-secondary)]">build-cache-*.bin</span>
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">4</span> fan out
              across your repos
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">5</span> repo near
              limit? <span className="text-amber-500">rotate →</span> fresh repo
            </div>
            <div className="mt-4 text-emerald-500">
              ✓ your accounts. your bytes. no zcrypt-sold quota.
            </div>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-heading text-xl font-bold">Keep exploring</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                href: "/features/encrypted-drive",
                title: "The encrypted drive",
                desc: "What sits on top of your storage — a real, sealed file explorer.",
                Icon: HardDrive,
              },
              {
                href: "/docs/platform-adapters",
                title: "Docs: Platform adapters",
                desc: "Connect GitHub, GitLab, Hugging Face, and Telegram accounts.",
                Icon: Server,
              },
              {
                href: "/docs/repo-pool",
                title: "Docs: Repo pool",
                desc: "How chunks distribute and repos auto-rotate as they fill.",
                Icon: FileText,
              },
            ].map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="card group p-5 transition-colors hover:border-cyan-500/40"
              >
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  {r.title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {r.desc}
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Storage you own, encryption you trust
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Free and open source. Connect an account you already have and start in
              under a minute.
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
