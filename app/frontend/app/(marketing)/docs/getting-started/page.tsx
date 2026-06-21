import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Key,
  Download,
  Globe,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Getting Started | zcrypt Docs",
  description:
    "Create an account, set your passphrase, and upload your first encrypted file to zcrypt in under 5 minutes. Step-by-step guide with screenshots.",
  keywords: [
    "zcrypt getting started",
    "encrypted cloud storage setup",
    "zero knowledge storage tutorial",
    "how to use zcrypt",
    "passphrase setup",
    "encrypted file upload",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/getting-started",
  },
  openGraph: {
    title: "Getting Started | zcrypt Docs",
    description:
      "Create an account, set your passphrase, and upload your first encrypted file to zcrypt in under 5 minutes.",
    url: "https://zcrypt.cloud/docs/getting-started",
  },
};

const steps = [
  {
    num: "01",
    title: "Create your account",
    icon: Check,
    content: [
      "Go to zcrypt.cloud/register and sign up with your email and a strong password.",
      "Check your inbox and click the verification link we send you.",
      "zcrypt is free and open source. There are no paid tiers and no credit card. Your storage comes from the platform accounts you connect in the next step.",
    ],
  },
  {
    num: "02",
    title: "Connect a storage platform",
    icon: Globe,
    content: [
      "zcrypt does not run its own storage farm. Instead, your encrypted files live inside a platform account you already have: GitHub, GitLab, Hugging Face, or Telegram.",
      "Go to Settings, then Platform Tokens, and add an access token (or a bot token and channel for Telegram). zcrypt creates private repositories or a private channel on your behalf and stores your encrypted chunks there.",
      "Your storage capacity is simply the free space your connected platform gives you. Bring more than one platform if you want more room. See Platform Adapters for per-platform setup and capacity.",
    ],
  },
  {
    num: "03",
    title: "Set your passphrase",
    icon: Key,
    content: [
      "On your first login, you will be asked to create a passphrase. This is separate from your account password.",
      "Your account password logs you in. Your passphrase encrypts your files: it is used to derive your encryption key locally on your device and it never leaves your browser. The two are intentionally different so that even zcrypt cannot read your data.",
      "Pick something strong and memorable. If you lose it, your files cannot be recovered. We strongly recommend storing it in a password manager.",
    ],
    warning:
      'Your passphrase is never stored on our servers. This is a core part of zero-knowledge encryption. There is no "forgot passphrase" recovery option.',
  },
  {
    num: "04",
    title: "Upload your first file",
    icon: Upload,
    content: [
      "Open your dashboard and drag a file onto the upload area, or click to browse your device.",
      "zcrypt automatically compresses the file with zstd, encrypts it with AES-256-GCM, and splits it into chunks. All of this happens in your browser.",
      "Encrypted chunks are pushed to the platform you connected in step 2. You will see real-time progress as each chunk completes.",
    ],
  },
  {
    num: "05",
    title: "Download and decrypt",
    icon: Download,
    content: [
      "Click any file in your vault to download it. You may be asked to enter your passphrase if it is not cached.",
      "zcrypt pulls the encrypted chunks back from your platform, reassembles them, decrypts, and decompresses the file. Everything happens locally in your browser.",
      "The original file is reconstructed and saved to your device. No plaintext data ever touches our servers or your storage platform.",
    ],
  },
];

const requirements = [
  { label: "Browser", value: "Chrome, Firefox, Safari, or Edge (latest)" },
  { label: "JavaScript", value: "Must be enabled for client-side encryption" },
  {
    label: "Storage",
    value:
      "A GitHub, GitLab, Hugging Face, or Telegram account to hold your encrypted files",
  },
  { label: "Account", value: "Email verification required" },
];

export default function GettingStartedPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Getting Started",
            url: "https://zcrypt.cloud/docs/getting-started",
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
            Getting Started
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Create an account, connect a storage platform, set your passphrase,
            and upload your first encrypted file in a few minutes.
          </p>
          <div className="mt-6 card p-5 border-cyan-500/30 bg-cyan-500/5">
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <strong className="font-semibold text-[var(--color-text)]">
                Your storage is your own.
              </strong>{" "}
              zcrypt is free and open source. It does not sell storage or gate
              features behind paid plans. Instead, you bring your own backend:
              your encrypted files live in your connected GitHub, GitLab, Hugging
              Face, or Telegram account, so your capacity is whatever free space
              those platforms give you. No artificial limits.
            </p>
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="pb-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Before you start
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {requirements.map((req) => (
                <div key={req.label} className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-cyan-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium">{req.label}:</span>{" "}
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {req.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto space-y-10">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {i < steps.length - 1 && (
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
                    <h2 className="text-lg font-bold">{step.title}</h2>
                  </div>
                  <div className="space-y-3">
                    {step.content.map((paragraph, j) => (
                      <p
                        key={j}
                        className="text-sm text-[var(--color-text-secondary)] leading-relaxed"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                  {step.warning && (
                    <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                        <strong className="font-semibold">Important:</strong>{" "}
                        {step.warning}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* What you can do next */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">What to explore next</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                href: "/docs/platform-adapters",
                title: "Platform Adapters",
                desc: "Set up GitHub, GitLab, Hugging Face, or Telegram as your encrypted storage backend.",
              },
              {
                href: "/docs/how-it-works",
                title: "How It Works",
                desc: "Follow a file end to end: connect, compress, encrypt, chunk, and push to your repos.",
              },
              {
                href: "/docs/security",
                title: "Security Model",
                desc: "Learn how encryption, key derivation, and zero-knowledge architecture work.",
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
