import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Folder,
  Eye,
  Lock,
  Search,
  LayoutGrid,
  ChevronRight,
  Archive,
  Image as ImageIcon,
  FileText,
  FolderOpen,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";

export const metadata: Metadata = {
  title: "Encrypted Cloud Drive — Real Folders & File Explorer",
  description:
    "zcrypt is a real encrypted drive, not a flat bucket of files. Nest folders, drag to organize, search, sort, and switch between grid and list — with every file and even folder names encrypted on your device.",
  keywords: [
    "encrypted drive",
    "encrypted file manager",
    "private cloud drive",
    "encrypted folders",
    "encrypted file explorer",
    "secure file organization",
    "zero-knowledge drive",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/encrypted-drive" },
  openGraph: {
    title: "Encrypted Cloud Drive — Real Folders & File Explorer | zcrypt",
    description:
      "A real encrypted drive: nest folders, drag to organize, search and sort — every file and folder name encrypted on your device.",
    url: "https://zcrypt.cloud/features/encrypted-drive",
    type: "website",
  },
};

const capabilities = [
  {
    Icon: FolderOpen,
    title: "Real, nestable folders",
    desc: "Create folders inside folders, as deep as you like. Organize the way you already think — not a flat list of blobs.",
  },
  {
    Icon: ChevronRight,
    title: "Breadcrumb navigation",
    desc: "Always know where you are. Click any crumb to jump back up, or drag a file onto one to move it there.",
  },
  {
    Icon: LayoutGrid,
    title: "Grid & list views",
    desc: "Switch between a thumbnail grid and a sortable list. Sort by name, size, type, date — or by how much space compression saved.",
  },
  {
    Icon: Search,
    title: "Search & filter",
    desc: "Find files fast within the current folder, and filter by type. Search matches decrypted names locally, never on the server.",
  },
  {
    Icon: Eye,
    title: "Preview without downloading",
    desc: "Open images, video, audio, PDFs, documents, and code right in the browser — decrypted on the fly, then gone.",
  },
  {
    Icon: Lock,
    title: "Encrypted folder names",
    desc: "Folder names are encrypted on your device too. Even your structure stays private — the server only ever sees ciphertext.",
  },
];

const explorerFolders = [
  { name: "Projects", count: "12 items" },
  { name: "Photos 2026", count: "248 items" },
  { name: "Tax & legal", count: "9 items", locked: true },
];

const explorerFiles = [
  { Icon: Archive, name: "q4-research.tar.zst", meta: "248 MB" },
  { Icon: ImageIcon, name: "cover-shot.png", meta: "4.1 MB" },
  { Icon: FileText, name: "contract-final.pdf", meta: "820 KB" },
];

const related = [
  { href: "/features/folders", title: "Password-protected folders", desc: "Give a folder its own password, separate from your vault." },
  { href: "/features/file-viewers", title: "In-browser file viewers", desc: "Preview images, video, PDFs, docs, and code — decrypted locally." },
  { href: "/features/transfers", title: "Transfer manager", desc: "Pause, resume, and track every upload and download." },
];

export default function EncryptedDrivePage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Encrypted Drive", url: "https://zcrypt.cloud/features/encrypted-drive" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow="The encrypted drive"
        headlineTop="A real drive."
        headlineGradient="Encrypted end to end."
        subtext={
          <>
            Most &ldquo;encrypted storage&rdquo; gives you a flat list of files. zcrypt
            gives you a real file explorer — folders, search, previews, drag-and-drop —
            where everything is encrypted on your device before it leaves.
          </>
        }
        secondaryLabel="Read the docs"
        secondaryHref="/docs/folders"
      >
        {/* Explorer mock */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
            {/* window bar */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <div className="ml-3 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                My Vault <ChevronRight className="h-3 w-3" /> Projects
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                <Lock className="h-2.5 w-2.5" /> Unlocked
              </span>
            </div>
            {/* listing */}
            <div className="p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {explorerFolders.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
                  >
                    <Folder className="h-5 w-5 flex-shrink-0 text-cyan-500" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 truncate text-xs font-medium">
                        {f.name}
                        {f.locked && <Lock className="h-3 w-3 text-amber-500" />}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {f.count}
                      </div>
                    </div>
                  </div>
                ))}
                {explorerFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
                  >
                    <f.Icon className="h-5 w-5 flex-shrink-0 text-[var(--color-text-muted)]" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{f.name}</div>
                      <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {f.meta}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading="Everything a drive should do"
        subheading="The organization you expect from Finder or Google Drive — with a zero-knowledge encryption layer underneath all of it."
        items={capabilities}
      />

      {/* ═══ PRIVACY TIE-IN ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Organized, never exposed
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              The structure is yours alone
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              A nicer file manager usually means handing the provider more metadata.
              Not here. Folder names are encrypted on your device with your passphrase,
              so the server stores opaque ciphertext — it can&apos;t read your files,
              your folder names, or how you&apos;ve arranged them.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Folder names encrypted client-side",
                "Previews decrypted in your browser, never on our servers",
                "Lose your passphrase and even we can't recover it",
              ].map((c) => (
                <li key={c} className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <Check className="h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/features/encryption"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How the encryption works
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            <div className="mb-2 text-[var(--color-text-secondary)]">// what the server stores</div>
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span> 9f2a1c·b8d40e·7c5b13·f0e2a9 — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span> 4d1b6c·8e30dd·91ac0c·77ae3f — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">file</span> a4f9c1·0c77ae·3f5b2a·4f9c1e — sealed
            </div>
            <div className="mt-4 text-emerald-500">✓ folder names sealed · keys never sent · contents encrypted</div>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="Your files, organized and sealed"
            subtext="Free and open source. Bring a storage account you already own and start in under a minute."
          />
        </div>
      </section>
    </>
  );
}
