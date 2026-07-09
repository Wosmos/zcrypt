import type { Metadata } from "next";
import {
  HardDrive,
  Box,
  RefreshCw,
  Layers,
  Infinity as InfinityIcon,
  Lock,
  Server,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { STORAGE_PLATFORMS } from "@/components/marketing/landing/storage-platforms";

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

const adapters = STORAGE_PLATFORMS;

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

const related = [
  {
    href: "/features/encrypted-drive",
    title: "The encrypted drive",
    desc: "What sits on top of your storage — a real, sealed file explorer.",
  },
  {
    href: "/docs/platform-adapters",
    title: "Docs: Platform adapters",
    desc: "Connect GitHub, GitLab, Hugging Face, and Telegram accounts.",
  },
  {
    href: "/docs/repo-pool",
    title: "Docs: Repo pool",
    desc: "How chunks distribute and repos auto-rotate as they fill.",
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
      <FeatureHero
        eyebrow="Bring your own storage"
        headlineTop="We don't sell you storage."
        headlineGradient="You already have it."
        subtext={
          <>
            Connect accounts you own — GitHub, GitLab, Hugging Face, Telegram — and your
            encrypted chunks fan out across them. Repos rotate automatically as they
            fill, so your space grows on its own. Your data, your infrastructure, no
            lock-in.
          </>
        }
        secondaryLabel="Read the docs"
        secondaryHref="/docs/platform-adapters"
      >
        {/* Adapters mock */}
        <MockWindowFrame label="Connected storage" labelIcon={Server} badgeIcon={Lock} badgeLabel="Encrypted before upload">
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
        </MockWindowFrame>
      </FeatureHero>

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
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none">
            {adapters.map((a) => (
              <li key={a.name}>
                <article className="card p-6 transition-colors hover:border-cyan-500/30">
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
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-[var(--color-text-muted)]">
            Capacities are approximate, per-repo or per-file platform limits and can
            change at the providers&apos; discretion. zcrypt works within whatever each
            platform currently allows.
          </p>
        </div>
      </section>

      {/* ═══ HOW IT GROWS ═══ */}
      <CapabilityGrid items={capabilities} sectionClassName="px-4 pb-4" />

      {/* ═══ OWNERSHIP TIE-IN ═══ */}
      <TieInSection
        eyebrow="Your data, your infrastructure"
        heading="Nothing to be locked into"
        body={
          <>
            Most cloud storage rents you space on the provider&apos;s servers, on the
            provider&apos;s terms. zcrypt flips that: it&apos;s an encryption and
            orchestration layer over storage you already own. Everything is encrypted
            on your device first, then chunks are disguised as ordinary build-cache
            files and distributed across your connected accounts. Walk away whenever
            you like — the accounts, and the bytes in them, were always yours.
          </>
        }
        checklist={
          <IconList
            items={[
              "Encrypted on your device before any upload",
              "Chunks disguised as routine build-cache artifacts",
              "Distributed across accounts you control",
              "Disconnect or leave anytime — no captive data",
            ]}
          />
        }
        linkLabel="How the repo pool rotates"
        linkHref="/docs/repo-pool"
        panel={
          <CodePanel
            comment="// how a file lands in your storage"
            success="✓ your accounts. your bytes. no zcrypt-sold quota."
          >
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
          </CodePanel>
        }
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="Storage you own, encryption you trust"
            subtext="Free and open source. Connect an account you already have and start in under a minute."
          />
        </div>
      </section>
    </>
  );
}
