import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  HardDrive,
  FolderOpen,
  Eye,
  Share2,
  Lock,
  RefreshCcw,
  Send,
  Monitor,
  Shield,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Features — The Encrypted Cloud Drive",
  description:
    "Everything zcrypt does: a real encrypted file explorer with folders, in-browser previews, per-folder passwords, sharing, bring-your-own-storage, a transfer manager, and apps for web, desktop, and terminal.",
  keywords: [
    "encrypted drive features",
    "encrypted file manager",
    "encrypted folders",
    "encrypted file viewer",
    "zero-knowledge storage features",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features" },
  openGraph: {
    title: "zcrypt Features — The Encrypted Cloud Drive",
    description:
      "A real encrypted file explorer: folders, previews, per-folder passwords, sharing, bring-your-own-storage, and apps for every surface.",
    url: "https://zcrypt.cloud/features",
    type: "website",
  },
};

const features = [
  { href: "/features/encrypted-drive", Icon: HardDrive, title: "Encrypted drive", desc: "A real file explorer — folders, grid/list, search, sort — all encrypted on your device." },
  { href: "/features/folders", Icon: FolderOpen, title: "Encrypted folders", desc: "Nestable folders with encrypted names, plus a separate password for any folder." },
  { href: "/features/file-viewers", Icon: Eye, title: "File viewers", desc: "Preview images, video, audio, PDFs, documents, and code — decrypted locally." },
  { href: "/features/sharing", Icon: Share2, title: "Sharing", desc: "Share links with an optional password, expiry, and limits. The key stays in the URL." },
  { href: "/features/encryption", Icon: Lock, title: "Zero-knowledge encryption", desc: "AES-256-GCM on your device. The server only ever sees ciphertext." },
  { href: "/features/bring-your-own-storage", Icon: RefreshCcw, title: "Bring your own storage", desc: "Use GitHub, GitLab, Hugging Face, or Telegram. Your data, no lock-in." },
  { href: "/features/transfers", Icon: Send, title: "Transfer manager", desc: "Pause, resume, retry, and track every upload and download in one place." },
  { href: "/features/privacy", Icon: Shield, title: "Privacy tools", desc: "Decoy profile and dead man's switch — with their real limits spelled out." },
  { href: "/features/apps", Icon: Monitor, title: "Web, desktop & terminal", desc: "The same zero-knowledge core across every surface, including a single-binary TUI." },
];

export default function FeaturesPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features" },
        ]}
      />

      <section className="px-6 pt-32 pb-12 text-center md:pt-36">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Features
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
            Everything the drive does
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            A real encrypted file manager with a zero-knowledge core. Here&apos;s every
            part of it — dig into whichever matters to you.
          </p>
        </div>
      </section>

      <section className="px-4 pb-24">
        <ul className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none">
          {features.map(({ href, Icon, title, desc }) => (
            <li key={href}>
              <Link
                href={href}
                className="card group block h-full p-6 transition-colors hover:border-cyan-500/40"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  {title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-12 max-w-5xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Start with a drive you actually own
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
            Free and open source. Bring a storage account you already have.
          </p>
          <Link
            href="/register"
            className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
          >
            Create your vault
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
