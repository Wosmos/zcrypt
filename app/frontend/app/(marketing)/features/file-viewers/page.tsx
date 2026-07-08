import type { Metadata } from "next";
import {
  Eye,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Code,
  Table,
  Play,
  Search,
  Lock,
  Shield,
  Download,
  Layers,
  RefreshCcw,
  Monitor,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";

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

// The viewer line-up — one card per supported type. Mirrors the real dispatch in
// components/viewers/viewer-kind.ts (image / video / audio / pdf / docx / html /
// markdown / csv / text).
const viewers = [
  {
    Icon: ImageIcon,
    title: "Images",
    desc: "Zoom, pan, and rotate JPG, PNG, GIF, WebP, SVG, and more. A cached low-res thumbnail shows instantly while the full image decrypts.",
    accent: "from-cyan-500/15 to-cyan-500/5",
    color: "text-cyan-500",
  },
  {
    Icon: Video,
    title: "Video & audio",
    desc: "A custom player for MP4, MOV, WebM, MP3, FLAC, and more — with a playlist of the other media in the same folder.",
    accent: "from-violet-500/15 to-violet-500/5",
    color: "text-violet-500",
  },
  {
    Icon: FileText,
    title: "PDF",
    desc: "Rendered page-by-page to a canvas with pdf.js — lazy per page, no browser plugin, no third-party PDF service.",
    accent: "from-rose-500/15 to-rose-500/5",
    color: "text-rose-500",
  },
  {
    Icon: FileText,
    title: "DOCX documents",
    desc: "Word documents are rendered to clean HTML and sanitized before display, so you read the content without opening an editor.",
    accent: "from-blue-500/15 to-blue-500/5",
    color: "text-blue-500",
  },
  {
    Icon: Code,
    title: "HTML",
    desc: "Sanitized and shown in a sandboxed frame with scripts disabled — preview a page safely without it phoning home.",
    accent: "from-amber-500/15 to-amber-500/5",
    color: "text-amber-500",
  },
  {
    Icon: FileText,
    title: "Markdown",
    desc: "Rendered to formatted, sanitized HTML — headings, lists, links, and code blocks, the way you wrote them.",
    accent: "from-emerald-500/15 to-emerald-500/5",
    color: "text-emerald-500",
  },
  {
    Icon: Table,
    title: "CSV & TSV",
    desc: "Comma- and tab-separated data laid out as a readable table instead of a wall of raw text.",
    accent: "from-teal-500/15 to-teal-500/5",
    color: "text-teal-500",
  },
  {
    Icon: Code,
    title: "Text & source code",
    desc: "Around 40 languages — JS, TS, Python, Go, Rust, SQL, YAML, and more — with syntax highlighting and a line-wrap toggle.",
    accent: "from-indigo-500/15 to-indigo-500/5",
    color: "text-indigo-500",
  },
];

// The decrypt-on-the-fly pipeline, matching the real client path
// (lib/decrypt-cache.ts: fetch chunks → AES-256-GCM → zstd → SHA-256 verify).
const pipeline = [
  {
    step: "01",
    title: "Fetch the encrypted chunks",
    desc: "The browser pulls the file's ciphertext chunks straight from your own storage backend. The server only ever handles sealed bytes.",
  },
  {
    step: "02",
    title: "Decrypt with AES-256-GCM",
    desc: "Your passphrase-derived key decrypts each chunk locally. The key is never sent anywhere — there is nothing on the server to decrypt with.",
  },
  {
    step: "03",
    title: "Decompress & verify",
    desc: "Chunks are zstd-decompressed and checked against a SHA-256 hash, so a corrupted or tampered file is caught before you ever see it.",
  },
  {
    step: "04",
    title: "Render from a local blob URL",
    desc: "The plaintext becomes an in-memory blob URL that feeds the viewer — then it's revoked the moment you close or move to the next file.",
  },
];

// Overlay capabilities — keep these honest to file-viewer.tsx behaviour.
const overlayFeatures = [
  {
    Icon: Layers,
    title: "Walk the whole folder",
    desc: "Prev/next moves through every file in the folder, with a clear 3 / 18 counter — no closing and reopening.",
  },
  {
    Icon: Monitor,
    title: "Fullscreen, keyboard-first",
    desc: "Esc to close, arrow keys to move, f for fullscreen. Focus stays trapped in the dialog and returns where it was on close.",
  },
  {
    Icon: Play,
    title: "Media playlist",
    desc: "Open one track and the player lists the other audio and video in the folder, so a folder becomes a playlist.",
  },
  {
    Icon: RefreshCcw,
    title: "Honest errors & retry",
    desc: "Wrong password, failed integrity check, or an unsupported type each get a clear message — with Retry and Download to fall back to.",
  },
  {
    Icon: Search,
    title: "Instant navigation",
    desc: "A session blob cache and neighbour prefetch mean the next and previous files are usually decrypted before you ask for them.",
  },
  {
    Icon: Download,
    title: "Download when you want",
    desc: "Previewing never forces a download. When you do want the file on disk, one click reuses the blob already decrypted.",
  },
];

const related = [
  {
    href: "/features/encrypted-drive",
    title: "The encrypted drive",
    desc: "Real, nestable folders and a file explorer — every name encrypted on your device.",
  },
  {
    href: "/docs/how-it-works",
    title: "How it works",
    desc: "The full client-side pipeline: compress, encrypt, chunk, and verify.",
  },
  {
    href: "/docs/folders",
    title: "Password-protected folders",
    desc: "Give a folder its own password — previews unlock only after you enter it.",
  },
];

export default function FileViewersPage() {
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
        eyebrow="In-browser file viewers"
        headlineTop="See your files."
        headlineGradient="Don't hand them over."
        subtext={
          <>
            Most encrypted storage makes you download a file and trust a server to
            show it. zcrypt previews images, video, PDFs, documents, and code right
            in your browser — decrypted on the fly, then gone.
          </>
        }
        secondaryLabel="How decryption works"
        secondaryHref="/docs/how-it-works"
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
        heading="A viewer for almost everything"
        subheading="Pick a file and it opens in a viewer built for its type — every one of them fed by plaintext that only ever exists in your browser."
        items={viewers}
        variant="accent"
      />

      {/* ═══ HOW IT STAYS ZERO-KNOWLEDGE ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Decrypted on your device, never on ours
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Preview without trusting a server
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Every preview runs through the same client-side pipeline as a full
              download. The server hands over sealed bytes and nothing else.
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
              The decrypted blob lives only in memory and is{" "}
              <span className="font-semibold text-[var(--color-text)]">
                revoked the moment you close or navigate away
              </span>
              . It is never written to disk and never uploaded — so a preview leaves
              nothing behind on your machine or our servers.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ THE OVERLAY ═══ */}
      <CapabilityGrid
        heading="One overlay, the whole folder"
        subheading="The viewer is a full-screen overlay you drive from the keyboard — built to move through a folder, not just stare at one file."
        items={overlayFeatures}
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            icon={Eye}
            heading="See your files without downloading"
            subtext="Free and open source. Bring a storage account you already own and preview your first encrypted file in under a minute."
          />
        </div>
      </section>
    </>
  );
}
