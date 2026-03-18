import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Shield, Lock, Key, Eye } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Security — zcrypt Docs",
  description:
    "How zcrypt encrypts your files with AES-256-GCM, the zero-knowledge architecture, and our threat model.",
  alternates: {
    canonical: "https://zcrypt.cloud/docs/security",
  },
  openGraph: {
    title: "Security — zcrypt Docs",
    description:
      "How zcrypt encrypts your files with AES-256-GCM, zero-knowledge architecture, and our threat model.",
    url: "https://zcrypt.cloud/docs/security",
  },
};

const sections = [
  {
    id: "overview",
    title: "Security Overview",
    content: `zcrypt is built on a zero-knowledge architecture. This means that we cannot read, access, or decrypt your files — by design. Your encryption key is derived from a passphrase that only you know, and all cryptographic operations happen locally on your device (in-browser or in the TUI).`,
  },
  {
    id: "encryption",
    title: "Encryption",
    subsections: [
      {
        title: "Algorithm: AES-256-GCM",
        content:
          "Every file is encrypted using AES-256-GCM (Galois/Counter Mode), the same authenticated encryption standard used by financial institutions, governments, and secure messaging apps. GCM provides both confidentiality and integrity — if a single bit of the ciphertext is modified, decryption will fail.",
      },
      {
        title: "Key Derivation",
        content:
          "Your passphrase is never transmitted or stored. Instead, it's combined with a unique random salt using a key derivation function (KDF) to produce a 256-bit encryption key. The salt is stored alongside file metadata (it doesn't need to be secret), but the passphrase exists only in your memory and your password manager.",
      },
      {
        title: "Per-File Keys",
        content:
          "Each file upload generates a fresh random salt. This means every file has a unique encryption key derived from your passphrase, even if the files are identical. Compromising one file's metadata reveals nothing about other files.",
      },
    ],
  },
  {
    id: "pipeline",
    title: "Upload Pipeline",
    subsections: [
      {
        title: "1. Compression (zstd)",
        content:
          "Before encryption, files are compressed using Facebook's Zstandard (zstd) algorithm. This reduces storage usage and upload time. Compression happens locally.",
      },
      {
        title: "2. Encryption (AES-256-GCM)",
        content:
          "The compressed payload is encrypted with your derived key. The ciphertext includes an authentication tag that prevents tampering.",
      },
      {
        title: "3. Chunking (10 MB)",
        content:
          "Large encrypted files are split into 10 MB chunks. Each chunk is individually uploaded and verified. This enables parallel uploads, resumable transfers, and works within Git platform file-size limits.",
      },
      {
        title: "4. Storage",
        content:
          "Encrypted chunks are pushed to your configured storage backend (GitHub, GitLab, or Hugging Face). The chunks are stored as binary blobs in Git repositories with randomized filenames and commit messages to prevent metadata leakage.",
      },
    ],
  },
  {
    id: "zero-knowledge",
    title: "Zero-Knowledge Architecture",
    subsections: [
      {
        title: "What we store",
        content:
          "File metadata (original name, size, chunk count, SHA-256 hash of the plaintext), encryption salt, and your account credentials (email, bcrypt-hashed password). We also store an index mapping files to their storage locations.",
      },
      {
        title: "What we never store",
        content:
          "Your passphrase, encryption keys, or any plaintext file data. These exist only on your device during active sessions. When you close the browser, they're gone.",
      },
      {
        title: "What this means",
        content:
          "Even if our database is fully compromised, an attacker gets encrypted blobs (useless without your passphrase), file metadata, and hashed passwords. They cannot reconstruct your files. A court order demanding your data would yield nothing useful — we physically cannot comply.",
      },
    ],
  },
  {
    id: "threat-model",
    title: "Threat Model",
    subsections: [
      {
        title: "Protected against",
        content:
          "Server-side breaches (database, storage backends), man-in-the-middle attacks (TLS + client-side encryption), insider threats (we cannot access your files), storage provider access (GitHub/GitLab see only encrypted blobs), and metadata leakage (randomized filenames and commit messages).",
      },
      {
        title: "Not protected against",
        content:
          "Compromised client device (keylogger, malware capturing your passphrase), weak passphrase (if someone guesses your passphrase, they can derive your key), and supply-chain attacks on the frontend JavaScript (mitigated by open-source code — you can self-host or audit).",
      },
      {
        title: "Mitigations",
        content:
          "Use a strong, unique passphrase. Enable two-factor authentication (TOTP). Keep your devices secure. For maximum assurance, audit the open-source code or use the TUI (compiled binary, no browser supply-chain risk).",
      },
    ],
  },
  {
    id: "platform-tokens",
    title: "Platform Token Security",
    subsections: [
      {
        title: "Encryption at rest",
        content:
          "When you connect a storage backend, your platform access token (GitHub PAT, GitLab token, etc.) is encrypted with AES-256-GCM using a key-encryption key (KEK) derived from a server-side master key. Tokens are never stored in plaintext.",
      },
      {
        title: "Minimal permissions",
        content:
          "We only request the minimum permissions needed: repository read/write access. No access to your other repositories, profile, or organization data.",
      },
    ],
  },
];

export default function SecurityPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          { name: "Security", url: "https://zcrypt.cloud/docs/security" },
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
            Security
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            How zcrypt protects your files with AES-256-GCM, zero-knowledge
            architecture, and a transparent threat model.
          </p>
        </div>
      </section>

      {/* Table of contents */}
      <section className="pb-8 px-4">
        <div className="max-w-3xl mx-auto">
          <nav className="card p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              On this page
            </h2>
            <ul className="space-y-1.5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-sm text-[var(--color-text-secondary)] hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* Content */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto space-y-16">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-cyan-500" />
                {section.title}
              </h2>

              {section.content && (
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
                  {section.content}
                </p>
              )}

              {section.subsections && (
                <div className="space-y-6">
                  {section.subsections.map((sub, i) => (
                    <div
                      key={i}
                      className="pl-5 border-l-2 border-[var(--color-border)]"
                    >
                      <h3 className="text-sm font-bold mb-2">{sub.title}</h3>
                      <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                        {sub.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Next steps */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/getting-started"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Getting Started
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Create an account and upload your first encrypted file.
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
                Connect your own storage backends with platform tokens.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
