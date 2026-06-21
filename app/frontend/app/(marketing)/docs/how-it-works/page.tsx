import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Layers,
  Lock,
  Box,
  Upload,
  Download,
  Shield,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "How It Works | zcrypt Docs",
  description:
    "A plain-language walkthrough of how zcrypt protects a file end to end: connect your account, compress, encrypt on your device, chunk, and push to your own repositories.",
  keywords: [
    "how zcrypt works",
    "zero knowledge encryption explained",
    "client side encryption pipeline",
    "encrypted cloud storage how it works",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/how-it-works",
  },
  openGraph: {
    title: "How It Works | zcrypt Docs",
    description:
      "A plain-language walkthrough of how zcrypt protects a file end to end, from your device to your own repositories.",
    url: "https://zcrypt.cloud/docs/how-it-works",
  },
};

const uploadSteps = [
  {
    num: "01",
    title: "Connect your account",
    icon: Globe,
    what: "Before anything is stored, you link a platform you already own — GitHub, GitLab, Hugging Face, or Telegram. zcrypt creates a private repository (or uses a private Telegram channel) to hold your files.",
    why: "zcrypt does not run a storage farm of its own. Your files live in your accounts, so your capacity is the free space those platforms give you and you keep full control of the underlying infrastructure.",
  },
  {
    num: "02",
    title: "Compress with zstd",
    icon: Layers,
    what: "When you add a file, zcrypt first compresses it on your device using Zstandard (zstd).",
    why: "Compression happens before encryption, while the data is still readable, so it can actually shrink. Smaller payloads mean less storage used and faster uploads. Encrypting first would make compression impossible, because encrypted data looks random.",
  },
  {
    num: "03",
    title: "Encrypt on your device",
    icon: Lock,
    what: "The compressed file is encrypted with AES-256-GCM using a key derived from your passphrase. This all happens locally — in your browser or in the TUI — before any bytes leave your machine.",
    why: "This is what makes zcrypt zero-knowledge. Your passphrase never leaves your device and the server only ever sees ciphertext. Even if the server, the database, and your storage platform were all compromised, your files would remain unreadable.",
  },
  {
    num: "04",
    title: "Split into chunks",
    icon: Box,
    what: "The encrypted blob is split into fixed-size chunks (10 MB each). Each chunk gets a randomized filename.",
    why: "Chunking keeps individual uploads within platform file-size limits, enables parallel and resumable transfers, and means a single failed piece can be retried without re-uploading the whole file. Randomized names avoid leaking anything about the original file.",
  },
  {
    num: "05",
    title: "Push to your repositories",
    icon: Upload,
    what: "Each encrypted chunk is pushed to the platform you connected, stored as a binary blob under disguised filenames and commit messages. When a repository nears its size threshold, zcrypt creates a new one automatically.",
    why: "Storing chunks as ordinary-looking blobs in private repos means the platform sees only opaque data, never your filenames or content. Auto-rotation lets your vault grow across many repositories without you managing any of it.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "How It Works",
            url: "https://zcrypt.cloud/docs/how-it-works",
          },
        ]}
      />

      {/* Header */}
      <section className="pt-24 md:pt-32 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to docs
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
            How It Works
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Follow a single file from your device to your own storage and back
            again. Each step explains what happens and, just as importantly, why
            it happens in that order.
          </p>
        </div>
      </section>

      {/* The short version */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-cyan-500" />
              The short version
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4">
              When you upload a file, zcrypt compresses it, encrypts it, and
              breaks it into chunks — all on your device — then pushes those
              chunks to repositories in your own connected account. Downloading
              runs the same pipeline in reverse. The plaintext never leaves your
              machine, and your passphrase never leaves your browser.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--color-text-muted)]">
              <span>connect</span>
              <ArrowRight className="h-3 w-3 text-cyan-500" />
              <span>compress</span>
              <ArrowRight className="h-3 w-3 text-cyan-500" />
              <span>encrypt</span>
              <ArrowRight className="h-3 w-3 text-cyan-500" />
              <span>chunk</span>
              <ArrowRight className="h-3 w-3 text-cyan-500" />
              <span>push to your repos</span>
            </div>
          </div>
        </div>
      </section>

      {/* Upload pipeline */}
      <section className="pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-8 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Uploading a file
          </h2>
          <div className="space-y-10">
            {uploadSteps.map((step, i) => (
              <div key={i} className="relative">
                {i < uploadSteps.length - 1 && (
                  <div className="absolute left-[19px] top-12 bottom-0 w-px bg-gradient-to-b from-[var(--color-border)] to-transparent" />
                )}
                <div className="flex gap-5">
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                    <step.icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold text-[var(--color-text-muted)] font-mono">
                        {step.num}
                      </span>
                      <h3 className="text-lg font-bold">{step.title}</h3>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      {step.what}
                    </p>
                    <div className="mt-3 pl-4 border-l-2 border-cyan-500/30">
                      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                        <strong className="font-semibold text-[var(--color-text)]">
                          Why:
                        </strong>{" "}
                        {step.why}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download pipeline */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Download className="h-4 w-4 text-cyan-500" />
            Downloading a file
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
            Downloading is simply the pipeline in reverse, and every step still
            happens on your device:
          </p>
          <div className="space-y-4">
            {[
              {
                title: "Fetch the chunks",
                body: "zcrypt pulls the encrypted chunks back from your repositories, several in parallel for speed.",
              },
              {
                title: "Verify integrity",
                body: "Each chunk is checked against its SHA-256 hash so a corrupted or tampered piece is caught before it is used.",
              },
              {
                title: "Reassemble and decrypt",
                body: "The chunks are stitched back into the encrypted blob, then decrypted locally with the key derived from your passphrase.",
              },
              {
                title: "Decompress and save",
                body: "The blob is decompressed back to the original file, the final hash is verified, and the file is saved to your device. No plaintext ever touches the server.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex gap-3 pl-5 border-l-2 border-[var(--color-border)]"
              >
                <div>
                  <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                href: "/docs/security",
                title: "Security Model",
                desc: "The cryptographic detail behind each step: AES-256-GCM, key derivation, and the threat model.",
              },
              {
                href: "/docs/platform-adapters",
                title: "Platform Adapters",
                desc: "How GitHub, GitLab, Hugging Face, and Telegram are used as your storage backend.",
              },
              {
                href: "/docs/getting-started",
                title: "Getting Started",
                desc: "Put it into practice: connect a platform and upload your first file.",
              },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="card p-5 group hover:border-cyan-500/40 transition-colors"
              >
                <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                  {link.title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {link.desc}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
