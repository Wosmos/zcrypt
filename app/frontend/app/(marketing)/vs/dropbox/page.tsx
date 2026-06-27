import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  X,
  Shield,
  Lock,
  HardDrive,
  Eye,
  FolderOpen,
  Github,
  ChevronRight,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "zcrypt vs Dropbox: Private, Open-Source Encrypted Drive",
  description:
    "A fair, accurate comparison of zcrypt and Dropbox. zcrypt is a free, open-source, zero-knowledge encrypted drive where you hold the keys and bring your own storage — Dropbox is a convenient, proprietary host that can access your files by default.",
  keywords: [
    "dropbox alternative",
    "zero-knowledge dropbox alternative",
    "encrypted dropbox alternative",
    "open source dropbox alternative",
    "private cloud storage",
    "zcrypt vs dropbox",
    "end-to-end encrypted file storage",
  ],
  alternates: { canonical: "https://zcrypt.cloud/vs/dropbox" },
  openGraph: {
    title: "zcrypt vs Dropbox: Private, Open-Source Encrypted Drive",
    description:
      "zcrypt is zero-knowledge by default, open source, and stores files in accounts you already own. See how it compares to Dropbox — fairly.",
    url: "https://zcrypt.cloud/vs/dropbox",
    type: "website",
  },
};

const rows: {
  label: string;
  zcrypt: { good: boolean; note: string };
  other: { good: boolean; note: string };
}[] = [
  {
    label: "Encryption model & who holds the keys",
    zcrypt: {
      good: true,
      note: "AES-256-GCM, keys derived on your device (PBKDF2, 600k iterations). Only you hold them.",
    },
    other: {
      good: false,
      note: "Encrypted in transit and at rest, but Dropbox manages the keys and can decrypt your files.",
    },
  },
  {
    label: "Zero-knowledge",
    zcrypt: {
      good: true,
      note: "Yes, by default. File contents are zero-knowledge and folder names are encrypted client-side. (File names are currently stored as metadata.)",
    },
    other: {
      good: false,
      note: "No. Dropbox can technically access file contents for previews, search, and scanning.",
    },
  },
  {
    label: "Storage model",
    zcrypt: {
      good: true,
      note: "Bring your own: GitHub, GitLab, Hugging Face, or Telegram accounts you already control.",
    },
    other: {
      good: true,
      note: "Dropbox-hosted storage on their infrastructure. Simple, but you don't own the backend.",
    },
  },
  {
    label: "Free tier & pricing",
    zcrypt: {
      good: true,
      note: "Free. You supply the storage, so there's no per-gigabyte fee from us.",
    },
    other: {
      good: false,
      note: "Limited free tier (a few GB); meaningful capacity requires a paid Plus/Professional plan.",
    },
  },
  {
    label: "Open source",
    zcrypt: { good: true, note: "Fully open source — audit the client and server yourself." },
    other: { good: false, note: "Proprietary, closed-source clients and backend." },
  },
  {
    label: "Self-hostable",
    zcrypt: { good: true, note: "Run the entire stack yourself." },
    other: { good: false, note: "Hosted service only." },
  },
  {
    label: "File organization & folders",
    zcrypt: {
      good: true,
      note: "Real nestable folders with encrypted folder names and per-folder passwords.",
    },
    other: {
      good: true,
      note: "Mature, polished folders and sync. Excellent organization — but names are visible to Dropbox.",
    },
  },
  {
    label: "In-browser previews",
    zcrypt: {
      good: true,
      note: "Images, video, audio, PDFs, docs, and code — decrypted in your browser, never on the server.",
    },
    other: {
      good: true,
      note: "Rich previews and editing, generated server-side because Dropbox can read the files.",
    },
  },
  {
    label: "File sharing",
    zcrypt: {
      good: true,
      note: "Encrypted share links with expiry. Shared vaults are in beta.",
    },
    other: {
      good: true,
      note: "Very mature sharing, links, and collaboration — at the cost of provider access.",
    },
  },
  {
    label: "Vendor lock-in",
    zcrypt: {
      good: true,
      note: "Minimal. Your data lives in your own accounts and the format is open.",
    },
    other: {
      good: false,
      note: "Higher. Data and workflows live inside Dropbox's ecosystem.",
    },
  },
];

const pillars = [
  {
    Icon: Lock,
    title: "You hold the keys",
    desc: "Your passphrase derives the encryption keys on your device with PBKDF2 (600k iterations). We never see them. Lose the passphrase and even we can't recover your files — that's the point.",
  },
  {
    Icon: Shield,
    title: "Zero-knowledge by default",
    desc: "Files are encrypted with AES-256-GCM before they leave your device. Even folder names are sealed, so the server stores opaque ciphertext and nothing else.",
  },
  {
    Icon: HardDrive,
    title: "Bring your own storage",
    desc: "Point zcrypt at a GitHub, GitLab, Hugging Face, or Telegram account you already own. No per-gigabyte fees from us, and no artificial caps.",
  },
  {
    Icon: Github,
    title: "Open source & self-hostable",
    desc: "Read the code, audit the crypto, or run the whole thing yourself. Nothing about how your files are handled is hidden behind a proprietary client.",
  },
];

export default function VsDropboxPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Compare", url: "https://zcrypt.cloud/vs/dropbox" },
          { name: "zcrypt vs Dropbox", url: "https://zcrypt.cloud/vs/dropbox" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            zcrypt vs Dropbox
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Dropbox is convenient.
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              zcrypt is private.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Dropbox is a polished, friction-free place to keep files — but it
            holds the keys and can read what you store. zcrypt is a real
            encrypted drive where everything is encrypted on your device, stored
            in accounts you already own, and the code is open for anyone to
            audit.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              Create your vault — free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/features/encrypted-drive"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              See the encrypted drive
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ PILLARS ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pillars.map(({ Icon, title, desc }) => (
              <div key={title} className="card p-6 transition-colors hover:border-cyan-500/30">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="font-heading text-base font-bold">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON TABLE ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              zcrypt vs Dropbox, side by side
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              An honest look at where each one fits. Dropbox wins on polish and
              ecosystem; zcrypt wins on privacy, ownership, and openness.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="w-1/3 py-4 pr-4 font-semibold text-[var(--color-text-secondary)]">
                    Capability
                  </th>
                  <th className="py-4 px-4 font-heading text-base font-bold text-cyan-600 dark:text-cyan-400">
                    zcrypt
                  </th>
                  <th className="py-4 px-4 font-heading text-base font-bold">
                    Dropbox
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-[var(--color-border)] align-top"
                  >
                    <th
                      scope="row"
                      className="py-4 pr-4 text-left font-medium text-[var(--color-text)]"
                    >
                      {row.label}
                    </th>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        {row.zcrypt.good ? (
                          <Check
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500"
                            strokeWidth={3}
                          />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                        )}
                        <span className="text-[var(--color-text-secondary)]">
                          {row.zcrypt.note}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        {row.other.good ? (
                          <Check
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
                            strokeWidth={3}
                          />
                        ) : (
                          <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                        )}
                        <span className="text-[var(--color-text-secondary)]">
                          {row.other.note}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            Comparison reflects each product&apos;s standard offering as of 2026.
            Dropbox is a trademark of Dropbox, Inc.; we&apos;re not affiliated with
            or endorsed by them.
          </p>
        </div>
      </section>

      {/* ═══ WHEN THE OTHER IS BETTER ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            The honest part
          </p>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            When Dropbox is the better choice
          </h2>
          <div className="mt-6 space-y-5 leading-relaxed text-[var(--color-text-secondary)]">
            <p>
              We&apos;re not going to pretend zcrypt wins for everyone. Dropbox is
              genuinely excellent at what it does, and there are real situations
              where it&apos;s the right tool.
            </p>
            <p>
              If you need <strong className="text-[var(--color-text)]">real-time
              collaborative editing</strong>, deep integrations with Office or
              Google Workspace, or a decade-mature desktop sync client that just
              works across every device your team owns, Dropbox is hard to beat.
              Its previews, commenting, and version history are more polished than
              ours today.
            </p>
            <p>
              If you specifically <strong className="text-[var(--color-text)]">want
              the provider to host and manage storage for you</strong> — no
              accounts to connect, no keys to remember — Dropbox removes that
              responsibility entirely. With zcrypt, if you lose your passphrase,
              your data is unrecoverable. That trade-off is the price of
              zero-knowledge, and it isn&apos;t for everyone.
            </p>
            <p>
              And if you need polished mobile apps today,{" "}
              <strong className="text-[var(--color-text)]">zcrypt&apos;s native
              mobile apps are still on the roadmap</strong> — we ship web,
              desktop, and a terminal app right now. Dropbox&apos;s mobile
              experience is mature and complete.
            </p>
            <p>
              zcrypt is the better fit when privacy is non-negotiable: when you
              want to be the only party who can read your files, keep them in
              storage you already own, and verify exactly how the encryption
              works.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-heading text-xl font-bold">Go deeper</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/features/encrypted-drive"
              className="card group p-5 transition-colors hover:border-cyan-500/40"
            >
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <FolderOpen className="h-4 w-4 text-cyan-500" />
                The encrypted drive
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Real folders, search, and previews — with a zero-knowledge layer
                underneath.
              </p>
            </Link>
            <Link
              href="/features/encryption"
              className="card group p-5 transition-colors hover:border-cyan-500/40"
            >
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Eye className="h-4 w-4 text-cyan-500" />
                How the encryption works
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                AES-256-GCM, client-side keys, and what the server can and
                can&apos;t see.
              </p>
            </Link>
          </div>

          <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Keep the convenience. Drop the access.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Free and open source. Bring a storage account you already own and
              start in under a minute.
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
