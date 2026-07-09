import type { Metadata } from "next";
import {
  Lock,
  Key,
  Shield,
  ShieldCheck,
  Cpu,
  Server,
  Folder,
  Eye,
  X,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";

export const metadata: Metadata = {
  title: "Zero-Knowledge Encryption — AES-256-GCM, Encrypted on Your Device",
  description:
    "Your files are encrypted on your own device with AES-256-GCM before they ever leave. Your key is derived from your passphrase with PBKDF2-SHA256 (600,000 iterations) and never transmitted. The server only ever sees ciphertext — no keys, no plaintext, not even your folder names.",
  keywords: [
    "zero-knowledge encryption",
    "client-side encryption",
    "AES-256-GCM",
    "PBKDF2",
    "end-to-end encrypted storage",
    "envelope encryption",
    "encrypted cloud storage",
    "private cloud",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/encryption" },
  openGraph: {
    title: "Zero-Knowledge Encryption — Encrypted on Your Device | zcrypt",
    description:
      "AES-256-GCM, on your device, before anything leaves. Your passphrase never travels. The server only ever holds ciphertext — no keys, no plaintext, no folder names.",
    url: "https://zcrypt.cloud/features/encryption",
    type: "website",
  },
};

const guarantees = [
  {
    Icon: Cpu,
    title: "Encrypted on your device",
    desc: "Compression and AES-256-GCM encryption happen in your browser, on your machine, before a single byte goes over the wire.",
  },
  {
    Icon: Key,
    title: "Your key never travels",
    desc: "Your encryption key is derived from your passphrase with PBKDF2-SHA256 — 600,000 iterations — and stays on your device. It is never sent to us.",
  },
  {
    Icon: Lock,
    title: "A unique key per file",
    desc: "Each file gets its own random content key, wrapped by your passphrase key. One file's key can never unlock another.",
  },
  {
    Icon: Folder,
    title: "Even folder names are sealed",
    desc: "File names and folder names are encrypted client-side too. The server can't read your files, their names, or how you organized them.",
  },
  {
    Icon: Server,
    title: "The server only sees ciphertext",
    desc: "On our side there are no keys and no plaintext — only opaque encrypted blobs we couldn't open even if compelled to.",
  },
  {
    Icon: ShieldCheck,
    title: "Tamper-evident by design",
    desc: "AES-256-GCM authenticates every chunk. If ciphertext is altered in transit or at rest, decryption fails loudly instead of returning garbage.",
  },
];

const pipeline = [
  {
    step: "01",
    title: "Derive your key",
    desc: "Your passphrase + a random salt run through PBKDF2-SHA256 (600,000 iterations) to derive a 256-bit key encryption key. This happens locally and the key never leaves your device.",
  },
  {
    step: "02",
    title: "Seal each file with its own key",
    desc: "A fresh random content key is generated per file and used to encrypt it with AES-256-GCM. That content key is then wrapped (encrypted) with your passphrase-derived key.",
  },
  {
    step: "03",
    title: "Encrypt folder names, then chunk",
    desc: "Folder names are encrypted client-side too. The encrypted file is then split into chunks, each individually authenticated.",
  },
  {
    step: "04",
    title: "Upload ciphertext only",
    desc: "Only the wrapped key and the encrypted chunks ever leave your device. The server stores blobs it has no way to read.",
  },
];

const related = [
  { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "Real folders, search, and previews on top of this encryption layer." },
  { href: "/docs/zero-knowledge", title: "Zero-knowledge, explained", desc: "What the term means and how we hold ourselves to it." },
  { href: "/docs/security", title: "Security model", desc: "The full picture: algorithms, key handling, and threat model." },
];

export default function EncryptionPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Encryption", url: "https://zcrypt.cloud/features/encryption" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow="Zero-knowledge encryption"
        headlineTop="We can't read your files."
        headlineGradient="That's the whole point."
        subtext={
          <>
            Your files are encrypted on your own device with AES-256-GCM before
            they ever leave it. The key is derived from your passphrase and never
            transmitted. We store ciphertext and nothing else — no keys, no
            plaintext, not even your folder names.
          </>
        }
        secondaryLabel="Read the docs"
        secondaryHref="/docs/zero-knowledge"
      >
        {/* Encryption boundary diagram */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
            {/* trusted device */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/[0.04] p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Cpu className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold">Your device</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                    Trusted zone
                  </div>
                </div>
              </div>
              <IconList
                items={[
                  "Passphrase entered here, stays here",
                  "Key derived locally (PBKDF2)",
                  "Files + names encrypted (AES-256-GCM)",
                  "Plaintext never leaves",
                ]}
                iconClassName="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan-500"
                itemClassName="flex items-start gap-2"
                className="space-y-2 text-xs text-[var(--color-text-secondary)]"
              />
            </div>

            {/* boundary */}
            <div className="flex flex-row items-center justify-center gap-2 md:flex-col">
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <Lock className="h-3 w-3 text-cyan-500" /> Encryption boundary
              </span>
              <div className="hidden h-full w-px bg-gradient-to-b from-transparent via-[var(--color-border)] to-transparent md:block" />
            </div>

            {/* server */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/[0.04] text-[var(--color-text-muted)] dark:bg-white/[0.04]">
                  <Server className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold">Our servers</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Ciphertext only
                  </div>
                </div>
              </div>
              <IconList
                items={[
                  "Encrypted blobs, that's it",
                  "No passphrase, no derived key",
                  "No plaintext file contents",
                  "No readable file or folder names",
                ]}
                icon={X}
                iconClassName="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-500/70"
                itemClassName="flex items-start gap-2"
                className="space-y-2 text-xs text-[var(--color-text-secondary)]"
              />
            </div>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ GUARANTEES ═══ */}
      <CapabilityGrid
        heading="What zero-knowledge actually means"
        subheading="Not a privacy policy promise. A cryptographic one — enforced by where the keys live and what code runs where."
        items={guarantees}
      />

      {/* ═══ THE PIPELINE ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              Envelope encryption
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              How a file gets sealed
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Every upload runs the same four steps, entirely on your device.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pipeline.map((p) => (
              <div key={p.step} className="card relative p-6">
                <div className="font-heading text-3xl font-bold text-cyan-500/20">
                  {p.step}
                </div>
                <h3 className="mt-3 text-sm font-bold">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>

          {/* what the server stores */}
          <div className="mt-10">
            <CodePanel
              comment="// what actually lands on the server"
              success="✓ no passphrase. no derived key. no plaintext. no readable names."
            >
              <div className="break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">wrapped_key</span> 8e30dd·91ac0c·77ae3f·b8d40e — sealed under your passphrase
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">name</span> 9f2a1c·b8d40e·7c5b13·f0e2a9 — sealed
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[0]</span> a4f9c1·0c77ae·3f5b2a·4f9c1e — AES-256-GCM
              </div>
              <div className="mt-1.5 break-all">
                <span className="text-cyan-600/80 dark:text-cyan-400/80">chunk[1]</span> 4d1b6c·77ae3f·5b2a4f·9c1e0c — AES-256-GCM
              </div>
            </CodePanel>
          </div>
        </div>
      </section>

      {/* ═══ THE TRADE-OFF (HONESTY) ═══ */}
      <TieInSection
        surface={false}
        eyebrow="The honest trade-off"
        heading={<>Lose your passphrase and even we can&apos;t recover it</>}
        body={
          <>
            True zero-knowledge has a price, and we won&apos;t pretend
            otherwise. Because your key is derived from your passphrase and
            never reaches us, we have no &ldquo;reset password and get your
            files back&rdquo; button. If you lose your passphrase, your data
            stays encrypted forever — to you and to everyone else.
          </>
        }
        checklist={
          <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
            That is exactly the property that makes the rest of these promises
            real. A provider who can recover your files for you can also be
            compelled to hand them over. We can&apos;t do either.
          </p>
        }
        linkLabel="Read the security model"
        linkHref="/docs/security"
        panel={
          <div className="card p-6">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Shield className="h-5 w-5" />
            </div>
            <IconList
              items={[
                "Choose a strong passphrase you won't forget — it is the one key to everything.",
                "Previews and downloads are decrypted in your browser, then discarded.",
                "Sharing wraps a file's key for the recipient — without ever exposing your passphrase.",
                "Password-protected folders add a second key, separate from your vault.",
              ]}
              icon={Eye}
              iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-500"
              iconStrokeWidth={1.5}
              itemClassName="flex items-start gap-2.5"
              className="space-y-3 text-sm text-[var(--color-text-secondary)]"
            />
          </div>
        }
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection
            heading="Encryption you don't have to trust us about"
            subtext="Free and open source. Bring a storage account you already own and encrypt your first file in under a minute."
          />
        </div>
      </section>
    </>
  );
}
