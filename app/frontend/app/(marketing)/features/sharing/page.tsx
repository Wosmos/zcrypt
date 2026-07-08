import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Link2,
  Lock,
  Clock,
  Download,
  XCircle,
  Eye,
  Check,
  FileText,
  Zap,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";

export const metadata: Metadata = {
  title: "Encrypted File Sharing — Keys That Stay in the Link",
  description:
    "Share any file with a link whose decryption key lives only in the URL fragment — it never reaches the server. Add a password, an expiry, or a download limit, and revoke anytime. Recipients need no account and decrypt entirely in their browser.",
  keywords: [
    "encrypted file sharing",
    "secure share link",
    "zero-knowledge sharing",
    "password protected share link",
    "expiring download link",
    "burn after reading",
    "anonymous file send",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/sharing" },
  openGraph: {
    title: "Encrypted File Sharing | zcrypt",
    description:
      "Per-file share links where the decryption key lives only in the URL fragment, never on the server. Optional password, expiry, and download limits. Revoke anytime.",
    url: "https://zcrypt.cloud/features/sharing",
    type: "website",
  },
};

const capabilities = [
  {
    Icon: Link2,
    title: "The key rides in the fragment",
    desc: "The decryption key lives in the part of the URL after the # — which browsers never send to a server. We literally can't receive it.",
  },
  {
    Icon: Lock,
    title: "Optional password",
    desc: "Add a password on top of the link. Even someone holding the URL needs the secret you share separately to open it.",
  },
  {
    Icon: Clock,
    title: "Expiry dates",
    desc: "Set a link to stop working after a date or duration. When it lapses, the door closes on its own — no cleanup required.",
  },
  {
    Icon: Download,
    title: "Download limits",
    desc: "Cap how many times a link can be used. Once the count is spent, the link is dead even if someone still has it.",
  },
  {
    Icon: XCircle,
    title: "Revoke anytime",
    desc: "Change your mind? Kill a link instantly from your vault. The ciphertext stays, but no one can open it again.",
  },
  {
    Icon: Eye,
    title: "No account for recipients",
    desc: "Whoever you send it to just opens the link. The file is decrypted in their browser — never on our servers, never in the clear on the wire.",
  },
];

const related = [
  {
    href: "/features/encrypted-drive",
    title: "The encrypted drive",
    desc: "Where shared files live — folders, search, and previews, sealed.",
  },
  {
    href: "/docs/sharing",
    title: "Docs: Sharing",
    desc: "Set passwords, expiry, and limits, and learn how links decrypt.",
  },
  {
    href: "/register",
    title: "Send your first file",
    desc: "Create a vault and share a link in under a minute.",
  },
];

export default function SharingPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Sharing", url: "https://zcrypt.cloud/features/sharing" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow="Encrypted sharing"
        headlineTop="Share a file."
        headlineGradient="Not the key to your vault."
        subtext={
          <>
            Every share link carries its own decryption key inside the URL fragment —
            the one piece of a link a browser never transmits. The recipient opens it,
            their browser decrypts the file, and the server only ever held ciphertext.
          </>
        }
        secondaryLabel="Read the docs"
        secondaryHref="/docs/sharing"
      >
        {/* Share-link mock */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <div className="ml-3 flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                <Link2 className="h-3 w-3" /> Share link
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                <Lock className="h-2.5 w-2.5" /> End-to-end
              </span>
            </div>
            <div className="p-4 sm:p-5">
              {/* the url, with the fragment highlighted */}
              <div className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] p-3 font-mono text-[11px] leading-relaxed break-all dark:bg-white/[0.02]">
                <span className="text-[var(--color-text-muted)]">
                  https://zcrypt.cloud/s/
                </span>
                <span className="text-[var(--color-text-secondary)]">3kQ9pX2v</span>
                <span className="text-amber-600 dark:text-amber-400">
                  #key=8f4a…d20e
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
                  <span className="font-mono">/s/3kQ9pX2v</span>
                  <span>— sent to the server</span>
                </div>
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  <span className="font-mono">#key=…</span>
                  <span>— stays in the browser</span>
                </div>
              </div>

              {/* link controls */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  { Icon: Lock, label: "Password", value: "On" },
                  { Icon: Clock, label: "Expires", value: "7 days" },
                  { Icon: Download, label: "Downloads", value: "5 left" },
                  { Icon: XCircle, label: "Revoke", value: "Anytime" },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
                  >
                    <c.Icon className="h-4 w-4 text-cyan-500" />
                    <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      {c.label}
                    </div>
                    <div className="text-xs font-medium">{c.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading="You decide who, how long, how many"
        subheading="Sharing without surrendering control. Set the terms on every link, and pull it back the moment you want to."
        items={capabilities}
      />

      {/* ═══ WHY THE FRAGMENT MATTERS ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              The secret in the #
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Why we can&apos;t read your shares
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              A URL fragment — everything after the <span className="font-mono">#</span> —
              is processed only by the browser and is never included in the request sent
              to a server. We put the decryption key there on purpose. The server hands
              over encrypted bytes; the recipient&apos;s browser uses the key from the
              fragment to decrypt them locally. The plaintext never exists on our side.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Decryption key lives only in the URL fragment",
                "Fragments are never transmitted to the server",
                "Recipients decrypt in-browser, with no account",
                "Optional password adds a second, separate secret",
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
              href="/docs/sharing"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How sharing works
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            <div className="mb-2 text-[var(--color-text-secondary)]">
              // what the server sees on open
            </div>
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">GET</span>{" "}
              /s/3kQ9pX2v
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">returns</span>{" "}
              ciphertext blob — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">#key=…</span>{" "}
              <span className="text-amber-500">not in request</span>
            </div>
            <div className="mt-1.5">
              decrypt happens in:{" "}
              <span className="text-emerald-500">the browser</span>
            </div>
            <div className="mt-4 text-emerald-500">
              ✓ no key on the wire. no plaintext on the server.
            </div>
          </div>
        </div>
      </section>

      {/* ═══ MORE WAYS TO SEND ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              More ways to send
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Sharing a vault file is one path. For the throwaway and the
              one-time, there are two more.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <article className="card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">Anonymous Send</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Drop a file without an account and get a single link to pass along.
                It&apos;s built to burn after reading — once it&apos;s been picked up,
                it&apos;s gone. Good for the thing you want to hand off and forget.
              </p>
            </article>
            <article className="card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold">Encrypted Pad</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Write a one-time note, encrypt it, and share the link. The recipient
                reads it once — then it&apos;s burned. For a password, an address, a
                short message that shouldn&apos;t linger in anyone&apos;s inbox.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="Share like the server isn't watching"
            subtext="Free and open source. Hand someone a file without handing it to us."
          />
        </div>
      </section>
    </>
  );
}
