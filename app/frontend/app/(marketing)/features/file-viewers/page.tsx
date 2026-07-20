import type { Metadata } from "next";
import { Eye, Image as ImageIcon, Video, Music, FileText, Code, Lock, Shield } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { fileViewers } from "../_data/file-viewers";

export const metadata: Metadata = {
  title: "In-Browser File Viewers — Preview Encrypted Files Without Downloading",
  description:
    "Open images, video, audio, PDFs, DOCX, HTML, Markdown, CSV, and source code straight from your encrypted vault. Files are decrypted on the fly in your browser — plaintext never touches the server — then the preview is gone.",
  keywords: [
    "in-browser file viewer",
    "preview encrypted files",
    "encrypted PDF viewer",
    "encrypted image viewer",
    "client-side decryption preview",
    "zero-knowledge file preview",
    "view files without downloading",
    "encrypted document viewer",
    "in-browser media player",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/file-viewers" },
  openGraph: {
    title: "In-Browser File Viewers — Preview Without Downloading | zcrypt",
    description:
      "Preview images, video, audio, PDFs, documents, and code from your encrypted vault — decrypted on the fly in your browser, never on a server.",
    url: "https://zcrypt.cloud/features/file-viewers",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "In-Browser File Viewers — Preview Encrypted Files | zcrypt",
    description:
      "See your files without downloading or trusting a server. Decryption happens in your browser; plaintext never leaves your device.",
  },
};

export default function FileViewersPage() {
  const { hero, viewersSection, viewers, zeroKnowledgeSection, pipeline, memoryNote, overlaySection, overlayFeatures, related, cta } = fileViewers;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/file-viewers" },
          { name: "File Viewers", url: "https://zcrypt.cloud/features/file-viewers" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        headlineTop={hero.headlineTop}
        headlineGradient={hero.headlineGradient}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      >
        {/* Viewer mock — a full-bleed preview overlay */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
            {/* overlay header */}
            <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">annual-report.pdf</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  PDF document
                </div>
              </div>
              <span className="hidden select-none text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] sm:inline">
                3 / 18
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                <Lock className="h-2.5 w-2.5" /> Decrypted locally
              </span>
            </div>
            {/* overlay body */}
            <div className="relative grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_180px]">
              {/* "rendered" page surface */}
              <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                <div className="w-full max-w-sm space-y-2.5 px-6 py-8">
                  <div className="h-3 w-2/3 rounded bg-[var(--color-border)]" />
                  <div className="h-2 w-full rounded bg-[var(--color-border)]/70" />
                  <div className="h-2 w-full rounded bg-[var(--color-border)]/70" />
                  <div className="h-2 w-5/6 rounded bg-[var(--color-border)]/70" />
                  <div className="mt-4 h-20 w-full rounded-lg bg-gradient-to-br from-cyan-500/15 to-violet-500/10" />
                  <div className="h-2 w-3/4 rounded bg-[var(--color-border)]/70" />
                  <div className="h-2 w-full rounded bg-[var(--color-border)]/70" />
                </div>
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur-sm">
                  page 1 / 24
                </span>
              </div>
              {/* media playlist / neighbours rail */}
              <div className="space-y-2">
                {[
                  { Icon: ImageIcon, name: "cover.png", color: "text-cyan-500" },
                  { Icon: Video, name: "walkthrough.mp4", color: "text-violet-500", active: true },
                  { Icon: Music, name: "voiceover.mp3", color: "text-emerald-500" },
                  { Icon: Code, name: "notes.ts", color: "text-indigo-500" },
                ].map((m) => (
                  <div
                    key={m.name}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      m.active
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.02]"
                    }`}
                  >
                    <m.Icon className={`h-4 w-4 flex-shrink-0 ${m.color}`} />
                    <span className="truncate text-[11px] font-medium">{m.name}</span>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-1.5 pt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
                  <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5">Esc</kbd>
                  <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5">&larr;</kbd>
                  <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5">&rarr;</kbd>
                  <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5">f</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ SUPPORTED VIEWERS ═══ */}
      <CapabilityGrid
        heading={viewersSection.heading}
        subheading={viewersSection.subheading}
        items={viewers}
        variant="accent"
      />

      {/* ═══ HOW IT STAYS ZERO-KNOWLEDGE ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              {zeroKnowledgeSection.eyebrow}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {zeroKnowledgeSection.heading}
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              {zeroKnowledgeSection.subheading}
            </p>
          </div>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map(({ step, title, desc }) => (
              <li key={step} className="card p-6">
                <div className="mb-3 font-mono text-2xl font-bold text-cyan-500/80">
                  {step}
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 sm:flex-row sm:items-center">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Shield className="h-5 w-5" />
            </span>
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {memoryNote}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ THE OVERLAY ═══ */}
      <CapabilityGrid
        heading={overlaySection.heading}
        subheading={overlaySection.subheading}
        items={overlayFeatures}
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            icon={Eye}
            heading={cta.heading}
            subtext={cta.subtext}
          />
        </div>
      </section>
    </>
  );
}
