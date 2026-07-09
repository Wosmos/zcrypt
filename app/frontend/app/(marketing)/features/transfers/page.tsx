import type { Metadata } from "next";
import {
  Upload,
  Download,
  Pause,
  Play,
  RefreshCw,
  Archive,
  Clock,
  Smartphone,
  Shield,
  CheckCircle2,
  ChevronDown,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";

export const metadata: Metadata = {
  title: "Transfer Manager — Pause, Resume & Track Every Upload",
  description:
    "A unified, docked transfer manager that survives navigation. Live progress and ETA, pause and resume without re-encrypting, retry on failure, and bulk ZIP downloads — plus encrypted device-to-device transfer with a 6-digit code.",
  keywords: [
    "upload manager",
    "resumable uploads",
    "pause resume upload",
    "download manager",
    "bulk download zip",
    "encrypted file transfer",
    "device to device transfer",
    "transfer progress",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/transfers" },
  openGraph: {
    title: "Transfer Manager — Pause, Resume & Track Every Transfer | zcrypt",
    description:
      "A docked manager that survives navigation: live progress, pause/resume without re-encrypting, retry, and bulk ZIP downloads. Plus encrypted device-to-device transfer.",
    url: "https://zcrypt.cloud/features/transfers",
    type: "website",
  },
};

const capabilities = [
  {
    Icon: Clock,
    title: "Live progress & ETA",
    desc: "Watch every transfer move in real time — per-file percentage, current stage, and a running estimate of time remaining.",
  },
  {
    Icon: Pause,
    title: "Pause without losing work",
    desc: "Pause an upload at a chunk boundary and walk away. The session stays intact, so nothing already encrypted is thrown out.",
  },
  {
    Icon: Play,
    title: "Resume where it left off",
    desc: "Resuming reuses the same encryption key and skips chunks the server already has. No re-encrypting, no starting over.",
  },
  {
    Icon: RefreshCw,
    title: "Retry on failure",
    desc: "A dropped connection doesn't mean a restart. Retry picks the transfer back up from the last confirmed chunk.",
  },
  {
    Icon: Archive,
    title: "Bulk ZIP downloads",
    desc: "Select many files and download them as a single ZIP — each one decrypted in your browser and packed locally.",
  },
  {
    Icon: Upload,
    title: "Survives navigation",
    desc: "The manager is docked once and persists as you move around the app. Browse, open files, and start more work while transfers run.",
  },
];

const queue = [
  {
    Icon: Upload,
    name: "q4-research.tar.zst",
    stage: "Encrypting · chunk 18/24",
    pct: 74,
    state: "active" as const,
  },
  {
    Icon: Upload,
    name: "design-system.fig",
    stage: "Paused · 41% complete",
    pct: 41,
    state: "paused" as const,
  },
  {
    Icon: Download,
    name: "photos-2026.zip",
    stage: "Downloading · decrypting",
    pct: 56,
    state: "active" as const,
  },
  {
    Icon: Archive,
    name: "tax-documents.zip",
    stage: "Done",
    pct: 100,
    state: "done" as const,
  },
];

const stateStyles: Record<string, string> = {
  active: "bg-cyan-500",
  paused: "bg-amber-500",
  done: "bg-emerald-500",
};

const related = [
  { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "Where your transfers land — real folders, search, and previews." },
  { href: "/docs/transfer-manager", title: "Transfer manager docs", desc: "Every control in the docked panel, explained." },
  { href: "/docs/uploading", title: "Uploading guide", desc: "How files are compressed, encrypted, chunked, and sent." },
];

export default function TransfersPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Transfers", url: "https://zcrypt.cloud/features/transfers" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow="The transfer manager"
        headlineTop="Start it. Walk away."
        headlineGradient="It picks up where it stopped."
        subtext={
          <>
            One docked panel tracks every upload and download. Live progress and
            ETA, pause and resume without re-encrypting, retry on failure, and
            bulk ZIP downloads — and it keeps running as you move around the app.
          </>
        }
        secondaryLabel="Read the docs"
        secondaryHref="/docs/transfer-manager"
      >
        {/* Docked transfer panel mock */}
        <MockWindowFrame
          maxWidth="max-w-md"
          contentClassName=""
          dots={false}
          leading={
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              <span className="text-sm font-semibold">Transfers</span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                2 active · 1 paused
              </span>
              <ChevronDown className="ml-auto h-4 w-4 text-[var(--color-text-muted)]" />
            </>
          }
        >
          {/* rows */}
          <div className="divide-y divide-[var(--color-border)]">
            {queue.map((q) => (
              <div key={q.name} className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <q.Icon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {q.name}
                  </span>
                  {q.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : q.state === "paused" ? (
                    <Play className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
                  ) : (
                    <Pause className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className={`h-full rounded-full ${stateStyles[q.state]}`}
                    style={{ width: `${q.pct}%` }}
                  />
                </div>
                <div className="mt-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {q.stage}
                </div>
              </div>
            ))}
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading="Built for big files and flaky networks"
        subheading="Because everything is encrypted on your device first, transfers have to be resilient. So they are."
        items={capabilities}
      />

      {/* ═══ RESUME DEEP-DIVE ═══ */}
      <TieInSection
        sectionClassName="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20"
        eyebrow="Resume that actually resumes"
        heading="No re-encrypting. No re-uploading."
        body={
          <>
            When you pause or hit a network hiccup, the upload stops at a clean
            chunk boundary and holds onto its session. Resuming reuses the very
            same content key, so the chunks already on the server still line up
            — it simply continues with the chunks that are missing.
          </>
        }
        checklist={
          <IconList
            items={[
              "Pauses at a chunk boundary, keeps the session alive",
              "Resumes with the same key — already-encrypted chunks stay valid",
              "Skips chunks the server already confirmed",
              "Retry after a failure continues from the last confirmed chunk",
            ]}
            itemClassName="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
            iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500"
          />
        }
        linkLabel="How uploading works"
        linkHref="/docs/uploading"
        panel={
          <CodePanel
            comment="// resuming a paused 24-chunk upload"
            success="✓ complete — 18 chunks never re-sent"
          >
            <div><span className="text-cyan-600/80 dark:text-cyan-400/80">session</span> reused — same content key</div>
            <div className="mt-1.5 text-emerald-500">chunk[0..17] already on server → skipped</div>
            <div className="mt-1.5">chunk[18] encrypt → upload <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span></div>
            <div className="mt-1.5">chunk[19] encrypt → upload <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span></div>
            <div className="mt-1.5 text-[var(--color-text-muted)]">…</div>
            <div className="mt-1.5">chunk[23] encrypt → upload <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span></div>
          </CodePanel>
        }
      />

      {/* ═══ DEVICE-TO-DEVICE ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="card overflow-hidden">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="p-8 md:p-10">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Smartphone className="h-5 w-5" />
                </div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Also: device-to-device
                </p>
                <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                  Send a file straight to another device
                </h2>
                <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
                  Separate from the vault, zcrypt can stream a file directly from
                  one device to another. The sender gets a six-digit code; whoever
                  enters it on the other end starts receiving. The data is
                  end-to-end encrypted — our server is a blind relay that passes
                  along ciphertext it can&apos;t read.
                </p>
                <IconList
                  items={[
                    "Pair with a 6-digit code",
                    "End-to-end encrypted, the relay only sees ciphertext",
                    "Nothing has to land in your vault first",
                  ]}
                  icon={Shield}
                  iconStrokeWidth={1.5}
                />
              </div>
              <div className="flex items-center justify-center border-t border-[var(--color-border)] bg-[var(--color-bg)] p-8 md:border-l md:border-t-0">
                <div className="w-full max-w-[240px] text-center">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Pairing code
                  </div>
                  <div className="mt-3 flex justify-center gap-1.5">
                    {["4", "8", "2", "1", "0", "7"].map((d, i) => (
                      <span
                        key={i}
                        className="flex h-11 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-xl font-semibold text-cyan-600 dark:text-cyan-400"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    Waiting for peer…
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="Move big files without babysitting them"
            subtext="Free and open source. Bring a storage account you already own and start your first upload in under a minute."
          />
        </div>
      </section>
    </>
  );
}
