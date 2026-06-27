import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Eye,
  Shield,
  ShieldCheck,
  Lock,
  Clock,
  Bell,
  Mail,
  Users,
  Layers,
  AlertTriangle,
  Check,
  X,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Privacy Tools — Decoy Profile & Dead Man's Switch",
  description:
    "zcrypt's privacy toolkit: a decoy profile that opens a fake vault under coercion, and a dead man's switch that emails a trusted contact if you stop checking in. Plus snapshots and shared vaults, in beta. All built on zero-knowledge encryption.",
  keywords: [
    "decoy profile",
    "plausible deniability",
    "duress password",
    "dead man's switch",
    "encrypted vault privacy",
    "coercion protection",
    "zero-knowledge privacy tools",
    "file integrity snapshots",
    "shared encrypted vaults",
    "border crossing privacy",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/privacy" },
  openGraph: {
    title: "Privacy Tools — Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "A decoy vault for coercion, a dead man's switch that alerts a trusted contact, plus snapshots and shared vaults in beta — all on a zero-knowledge core.",
    url: "https://zcrypt.cloud/features/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Tools — Decoy Profile & Dead Man's Switch | zcrypt",
    description:
      "Plausible deniability and a dead man's switch, built on top of zero-knowledge encryption. Honest about what each one does — and doesn't.",
  },
};

// Decoy profile — how it behaves, kept honest to the implementation.
const decoyPoints = [
  "A second decoy password you set yourself, separate from your real one.",
  "Logging in with it opens an innocent-looking vault with believable filler files.",
  "Nothing in the decoy hints that a real vault exists behind a different password.",
];

// Dead man's switch — what it does, and an explicit list of what it does NOT do.
const dmsDoes = [
  "Emails a trusted contact you choose if you don't log in for a set window.",
  "Timeout is configurable from 7 to 365 days — you decide the check-in cadence.",
  "Every login automatically resets the countdown, so normal use keeps it quiet.",
];
const dmsDoesNot = [
  "It does not hand over your files.",
  "It does not release your passphrase or any keys.",
  "It is a heads-up to a person — not an automated handover of access.",
];

// Beta tools — visibly labelled, with their real current limits spelled out.
const betaTools = [
  {
    Icon: Layers,
    title: "Snapshots & integrity",
    desc: "Capture a point-in-time manifest of your vault and detect if a stored file has been altered or tampered with since.",
    caveat:
      "Snapshots are manifests for tamper detection — not a restore or version-history system. They don't roll your files back to an earlier state yet.",
    href: "/docs/snapshots-integrity",
  },
  {
    Icon: Users,
    title: "Shared vaults",
    desc: "Collaborate in a vault with other people using viewer, editor, and admin roles.",
    caveat:
      "The cryptographic key-sharing behind roles is still maturing. Treat shared vaults as experimental and don't rely on them for high-stakes secrets yet.",
    href: "/docs/shared-vaults",
  },
];

export default function PrivacyToolsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/privacy" },
          { name: "Privacy Tools", url: "https://zcrypt.cloud/features/privacy" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Privacy tools
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Privacy for the
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              moments that matter.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Encryption keeps your files unreadable. These tools go a step further —
            for being pressured to unlock, for going quiet unexpectedly, and for the
            edge cases real privacy has to plan for. Built on the same zero-knowledge
            core, and honest about what each one actually does.
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
              href="/docs/decoy-profile"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              Read the docs
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <p className="mx-auto mt-6 inline-flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Zero-knowledge by design — we never hold your keys or your plaintext.
          </p>
        </div>
      </section>

      {/* ═══ DECOY PROFILE ═══ */}
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Plausible deniability
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              A decoy profile for when you&apos;re forced to open up
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              Set a second &ldquo;decoy&rdquo; password. When you log in with it,
              zcrypt opens an innocent-looking vault full of harmless files — not your
              real one. Under coercion, at a border crossing, or anywhere you can&apos;t
              say no, you can unlock something real-looking without exposing what
              actually matters.
            </p>
            <ul className="mt-6 space-y-2.5">
              {decoyPoints.map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                >
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/decoy-profile"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How decoy profiles work
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Two-login mock */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)]">
                  <Eye className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  Decoy password
                </span>
              </div>
              <div className="space-y-1.5">
                {["budget-2024.xlsx", "cat-photos", "recipes.txt"].map((f) => (
                  <div
                    key={f}
                    className="truncate rounded-lg bg-black/[0.02] px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-text-secondary)] dark:bg-white/[0.02]"
                  >
                    {f}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Looks ordinary
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Lock className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                  Real password
                </span>
              </div>
              <div className="space-y-1.5">
                {["source·sealed", "ledger·sealed", "keys·sealed"].map((f) => (
                  <div
                    key={f}
                    className="truncate rounded-lg bg-cyan-500/10 px-2.5 py-1.5 font-mono text-[11px] text-cyan-700 dark:text-cyan-300"
                  >
                    {f}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-cyan-600/80 dark:text-cyan-400/80">
                Never revealed
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DEAD MAN'S SWITCH ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-16">
        <div className="mx-auto grid max-w-5xl items-start gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              If you go quiet
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              A dead man&apos;s switch that reaches a person
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              Choose a trusted contact and a check-in window. If you don&apos;t log in
              for that long, zcrypt emails them a notification. It&apos;s a safety net
              for journalists, activists, and anyone who needs someone alerted if they
              suddenly can&apos;t check in.
            </p>

            {/* Check-in timeline */}
            <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
                <Clock className="h-3.5 w-3.5 text-cyan-500" />
                Check-in window
                <span className="ml-auto font-mono text-[var(--color-text-muted)]">
                  7&ndash;365 days
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)]">
                <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[var(--color-text-muted)]">
                <span>last login resets it</span>
                <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                  <Bell className="h-3 w-3" /> contact notified
                </span>
              </div>
            </div>
          </div>

          {/* Does / does-not honesty card */}
          <div className="space-y-4">
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Mail className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold">What it does</h3>
              </div>
              <ul className="space-y-2.5">
                {dmsDoes.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" strokeWidth={3} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card border-amber-500/30 bg-amber-500/[0.04] p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold">What it doesn&apos;t do</h3>
              </div>
              <ul className="space-y-2.5">
                {dmsDoesNot.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" strokeWidth={2.5} />
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Because zcrypt is zero-knowledge, there are no keys for us to hand over
                — so the switch alerts a person rather than releasing your data.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ IN BETA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              In beta
            </span>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Maturing, and honestly labelled
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              These two are real and usable, but still evolving. We&apos;d rather tell
              you exactly where they stand than oversell them.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {betaTools.map(({ Icon, title, desc, caveat, href }) => (
              <article key={title} className="card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    Beta
                  </span>
                </div>
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                  <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {caveat}
                  </p>
                </div>
                <Link
                  href={href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
                >
                  Read the docs
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ZERO-KNOWLEDGE TIE-IN ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-500">
            <Shield className="h-6 w-6" />
          </div>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            It all sits on a zero-knowledge core
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            Every one of these tools is bounded by the same promise: your files are
            encrypted on your device with AES-256-GCM before they leave, and we never
            see your passphrase or your plaintext. The decoy hides a vault we
            can&apos;t read either way; the dead man&apos;s switch notifies a person
            because there are no keys for us to release. Privacy features that
            can&apos;t betray you, because the architecture won&apos;t let them.
          </p>
          <Link
            href="/docs/how-it-works"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
          >
            How the encryption works
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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
                desc: "Real folders and a file explorer — every name encrypted on your device.",
              },
              {
                href: "/docs/dead-mans-switch",
                title: "Dead man's switch",
                desc: "Set the contact, timeout, and message for your inactivity alert.",
              },
              {
                href: "/docs/security",
                title: "Security model",
                desc: "How zero-knowledge encryption and our threat model fit together.",
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
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{r.desc}</p>
              </Link>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Privacy you can actually reason about
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Free and open source. Bring a storage account you already own, set a
              decoy password, and arm your safety net in minutes.
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
