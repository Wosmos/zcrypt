import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  Key,
  Shield,
  Download,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Getting Started — zcrypt Docs",
  description:
    "Create an account, set your passphrase, and upload your first encrypted file to zcrypt in under 5 minutes.",
  alternates: {
    canonical: "https://zcrypt.cloud/docs/getting-started",
  },
  openGraph: {
    title: "Getting Started — zcrypt Docs",
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
      "Head to zcrypt.cloud/register and create a free account with your email and a strong password.",
      "Verify your email address by clicking the link we send you.",
      "You'll get 10 GB of free encrypted storage immediately — no credit card required.",
    ],
  },
  {
    num: "02",
    title: "Set your passphrase",
    icon: Key,
    content: [
      "When you first log in, you'll be prompted to create a passphrase. This is separate from your account password.",
      "Your passphrase is used to derive your encryption key locally on your device. It never leaves your browser.",
      "Choose something strong and memorable — if you lose it, your files cannot be recovered. We recommend using a password manager.",
    ],
    warning:
      "Your passphrase is never stored on our servers. This is a core part of our zero-knowledge architecture. There is no \"forgot passphrase\" option.",
  },
  {
    num: "03",
    title: "Upload your first file",
    icon: Upload,
    content: [
      "Navigate to your dashboard and drag a file onto the upload area, or click to browse.",
      "Your file is automatically compressed (zstd), encrypted (AES-256-GCM), and split into chunks — all in your browser.",
      "Encrypted chunks are uploaded to your configured storage backends. Progress is shown in real-time via SSE.",
    ],
  },
  {
    num: "04",
    title: "Download and decrypt",
    icon: Download,
    content: [
      "Click any file in your vault to download it. Enter your passphrase if prompted.",
      "zcrypt downloads the encrypted chunks, reassembles them, decrypts, and decompresses — all locally.",
      "The original file is reconstructed in your browser and saved to your device. No plaintext ever touches our servers.",
    ],
  },
  {
    num: "05",
    title: "Connect a storage backend (optional)",
    icon: Shield,
    content: [
      "By default, zcrypt uses shared platform storage. Pro and Plus users can connect their own GitHub, GitLab, or Hugging Face repositories.",
      "Go to Settings → Platform Tokens to add a personal access token for your preferred platform.",
      "Your files will be stored as encrypted blobs in your own repositories — you retain full control of the underlying infrastructure.",
    ],
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          { name: "Getting Started", url: "https://zcrypt.cloud/docs/getting-started" },
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
            Create an account, set your passphrase, and upload your first
            encrypted file — all in under 5 minutes.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto space-y-10">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="absolute left-[19px] top-12 bottom-0 w-px bg-gradient-to-b from-[var(--color-border)] to-transparent" />
              )}

              <div className="flex gap-5">
                {/* Step number */}
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

      {/* Next steps */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">What&apos;s next?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/security"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Security Model
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Understand the encryption, threat model, and zero-knowledge
                architecture.
              </p>
            </Link>
            <Link
              href="/docs/platform-adapters"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Platform Adapters
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Connect GitHub, GitLab, or Hugging Face as your storage
                backend.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
