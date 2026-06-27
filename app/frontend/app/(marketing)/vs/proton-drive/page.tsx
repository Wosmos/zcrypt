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
  Terminal,
  ChevronRight,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
  description:
    "A fair comparison of two end-to-end encrypted drives. Proton Drive is audited, established, and has mobile apps. zcrypt adds open-source self-hosting, bring-your-own-storage, no artificial caps, and a terminal app — all free.",
  keywords: [
    "proton drive alternative",
    "open source proton drive alternative",
    "self-hosted proton drive alternative",
    "zero-knowledge cloud storage",
    "encrypted cloud drive",
    "zcrypt vs proton drive",
    "bring your own storage encrypted drive",
  ],
  alternates: { canonical: "https://zcrypt.cloud/vs/proton-drive" },
  openGraph: {
    title: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
    description:
      "Both are end-to-end encrypted. zcrypt adds open-source self-hosting, bring-your-own-storage, no caps, and a terminal app. A fair look at both.",
    url: "https://zcrypt.cloud/vs/proton-drive",
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
      good: true,
      note: "End-to-end encrypted with keys derived from your password. Proton can't read your files either.",
    },
  },
  {
    label: "Zero-knowledge",
    zcrypt: {
      good: true,
      note: "Yes, by default. File contents are zero-knowledge and folder names are encrypted. (File names are stored as metadata; Proton additionally encrypts file names.)",
    },
    other: {
      good: true,
      note: "Yes. Proton Drive is genuinely zero-knowledge and encrypts file metadata as well.",
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
      note: "Proton-hosted in Swiss/EU data centers. Reputable and managed — but Proton runs the storage.",
    },
  },
  {
    label: "Free tier & pricing",
    zcrypt: {
      good: true,
      note: "Free. You supply the storage, so capacity isn't metered or sold by the gigabyte.",
    },
    other: {
      good: true,
      note: "Generous free tier; larger storage and bundles require a paid Proton plan.",
    },
  },
  {
    label: "Open source",
    zcrypt: {
      good: true,
      note: "Client and server are fully open source.",
    },
    other: {
      good: true,
      note: "Proton open-sources its apps and publishes independent security audits.",
    },
  },
  {
    label: "Self-hostable",
    zcrypt: {
      good: true,
      note: "Run the entire stack yourself — client, server, and storage.",
    },
    other: {
      good: false,
      note: "Hosted Proton service only; you can't run your own Proton Drive server.",
    },
  },
  {
    label: "File organization & folders",
    zcrypt: {
      good: true,
      note: "Real nestable folders with encrypted names, plus optional per-folder passwords.",
    },
    other: {
      good: true,
      note: "Solid encrypted folders and a clean drive experience.",
    },
  },
  {
    label: "In-browser previews",
    zcrypt: {
      good: true,
      note: "Images, video, audio, PDFs, docs, and code — decrypted locally in the browser.",
    },
    other: {
      good: true,
      note: "In-browser previews with client-side decryption, similar approach.",
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
      note: "Mature encrypted sharing with password-protected and expiring links.",
    },
  },
  {
    label: "Vendor lock-in",
    zcrypt: {
      good: true,
      note: "Minimal. Data lives in storage you already own and the format is open.",
    },
    other: {
      good: false,
      note: "Moderate. Your encrypted data lives within Proton's hosted ecosystem.",
    },
  },
];

const pillars = [
  {
    Icon: Github,
    title: "Open source, top to bottom",
    desc: "Like Proton, our apps are open source — and so is the server. You can audit, fork, or run the whole thing. There's no closed component you have to trust on faith.",
  },
  {
    Icon: HardDrive,
    title: "Bring your own storage",
    desc: "This is the big one. Instead of a Proton-hosted quota, point zcrypt at a GitHub, GitLab, Hugging Face, or Telegram account you already own. No gigabyte caps from us, no separate storage bill.",
  },
  {
    Icon: Lock,
    title: "Self-host the entire stack",
    desc: "Run your own zcrypt server and keep both the keys and the infrastructure under your control. Proton Drive is hosted only — you can't operate your own instance.",
  },
  {
    Icon: Terminal,
    title: "A real terminal app",
    desc: "zcrypt ships a full TUI alongside web and desktop, so you can manage an encrypted vault straight from the command line — handy for servers and power users.",
  },
];

export default function VsProtonDrivePage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Compare", url: "https://zcrypt.cloud/vs/proton-drive" },
          { name: "zcrypt vs Proton Drive", url: "https://zcrypt.cloud/vs/proton-drive" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            zcrypt vs Proton Drive
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Both are end-to-end encrypted.
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              Only one is yours to run.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Proton Drive is a genuinely excellent, audited, zero-knowledge drive —
            and we respect it. The differences are narrower here and more about
            philosophy: zcrypt is open source <em>and</em> self-hostable, stores
            files in accounts you already own, has no artificial caps, and even
            ships a terminal app.
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
              href="/features/encryption"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              How the encryption works
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ RESPECT NOTE ═══ */}
      <section className="px-4 pb-4">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-cyan-500" />
            <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-text)]">Credit where it&apos;s
              due.</strong>{" "}
              Proton Drive is end-to-end encrypted, independently audited, backed
              by an established privacy company, and has mature mobile apps. If
              you&apos;re weighing it against zcrypt, you&apos;re already making a
              privacy-respecting choice. This page is about which trade-offs suit
              you — not about claiming Proton gets anything wrong.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ PILLARS ═══ */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Where zcrypt is different
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              The encryption story is similar. These four things are where zcrypt
              takes a different path.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pillars.map(({ Icon, title, desc }) => (
              <div key={title} className="card p-6 transition-colors hover:border-cyan-500/30">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-base font-bold">{title}</h3>
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
              zcrypt vs Proton Drive, side by side
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Both check the privacy boxes. The differences cluster around
              hosting, storage ownership, and tooling.
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
                    Proton Drive
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
            Proton Drive is a trademark of Proton AG; we&apos;re not affiliated
            with or endorsed by them.
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
            When Proton Drive is the better choice
          </h2>
          <div className="mt-6 space-y-5 leading-relaxed text-[var(--color-text-secondary)]">
            <p>
              Proton Drive is a serious, well-built product, and for many people
              it&apos;s the smarter pick. We&apos;d rather you choose the right
              tool than the one with our name on it.
            </p>
            <p>
              If you want{" "}
              <strong className="text-[var(--color-text)]">polished native mobile
              apps today</strong>, Proton has them and zcrypt does not — our
              mobile apps are still on the roadmap. For people who manage files
              primarily from a phone, that difference alone may settle it.
            </p>
            <p>
              If you value a{" "}
              <strong className="text-[var(--color-text)]">single, fully managed
              privacy suite</strong> — Drive, Mail, Calendar, and VPN under one
              audited provider in Swiss/EU jurisdiction — Proton delivers that as
              a cohesive package. zcrypt is focused on being an encrypted drive,
              not an ecosystem.
            </p>
            <p>
              If you&apos;d rather{" "}
              <strong className="text-[var(--color-text)]">not manage your own
              storage or infrastructure at all</strong>, Proton handles
              everything for you. zcrypt&apos;s bring-your-own-storage model is
              powerful, but it does ask you to connect an account and take
              responsibility for your passphrase. And some of our more advanced
              collaboration features, like shared vaults, are still in beta.
            </p>
            <p>
              zcrypt is the better fit when you want an encrypted drive you can
              fully self-host, store in accounts you already own, scale without
              artificial caps, and drive from the terminal — all open source and
              free.
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
              End-to-end encrypted, and entirely yours
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Open source and free. Bring a storage account you already own, or
              self-host the whole stack.
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
