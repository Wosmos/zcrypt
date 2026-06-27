import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Architecture | zcrypt Docs",
  description:
    "How zcrypt fits together: a client-side compress-encrypt-chunk pipeline, a chunked HTTP API, durable disk staging plus a background sync worker, pluggable platform adapters, repo-pool auto-rotation, and a PostgreSQL index — all behind a strict zero-knowledge boundary.",
  alternates: { canonical: "https://zcrypt.cloud/docs/architecture" },
  openGraph: {
    title: "Architecture | zcrypt Docs",
    description:
      "The zcrypt pipeline, staging and sync worker, platform adapters, repo-pool rotation, and the zero-knowledge boundary.",
    url: "https://zcrypt.cloud/docs/architecture",
  },
};

const toc = [
  { id: "overview", title: "Overview" },
  { id: "diagram", title: "The big picture" },
  { id: "client", title: "Client pipeline" },
  { id: "api", title: "Chunked HTTP API" },
  { id: "staging", title: "Staging & the sync worker" },
  { id: "adapters", title: "Platform adapters & repo pool" },
  { id: "index", title: "The index (PostgreSQL)" },
  { id: "boundary", title: "The zero-knowledge boundary" },
  { id: "next", title: "Where to go next" },
];

export default function ArchitectureDocPage() {
  return (
    <DocPage
      href="/docs/architecture"
      title="Architecture"
      description="zcrypt is a thin, stateless server wrapped around a client-side encryption pipeline and your own storage accounts. Here is how the pieces connect — and why the server can never read your files."
      toc={toc}
    >
      <DocSection id="overview" title="Overview">
        <DocP>
          A file's life in zcrypt is: your browser compresses, encrypts, and
          chunks it; the chunks travel over a chunked HTTP API to the Go backend;
          the backend stages them on durable disk and a background worker syncs
          them to a storage platform you own; a PostgreSQL index records the
          ciphertext metadata that lets you find and reassemble the file later.
          Plaintext and keys never leave your device.
        </DocP>
      </DocSection>

      <DocSection id="diagram" title="The big picture">
        <DocCode label="data flow">{`Your device (browser / TUI)            zcrypt backend (Go, stateless)         Your storage
┌─────────────────────────┐            ┌──────────────────────────┐         ┌──────────────┐
│  1. zstd compress        │            │  Chunked HTTP API        │         │  GitHub      │
│  2. AES-256-GCM encrypt  │  chunks    │  (JSON + raw chunk bytes)│         │  GitLab      │
│  3. split into chunks    │ ─────────► │            │             │ ──────► │  Hugging Face│
│                          │   HTTPS    │            ▼             │  sync   │  Telegram    │
│  passphrase ─► key       │            │  Durable disk staging    │         └──────────────┘
│  (never leaves device)   │ ◄───────── │            │             │
└─────────────────────────┘  SSE/events│            ▼             │
                                        │  Background sync worker  │
                                        │            │             │
                                        │            ▼             │
                                        │  PostgreSQL index (pgx)  │
                                        └──────────────────────────┘
                                  Server sees only ciphertext + metadata`}</DocCode>
      </DocSection>

      <DocSection id="client" title="Client pipeline">
        <DocP>
          Everything that makes a file private happens before it leaves your
          device, in this order:
        </DocP>
        <DocList
          ordered
          items={[
            <>
              <strong>Compress.</strong> The file is compressed with zstd, so less
              data is encrypted and stored.
            </>,
            <>
              <strong>Encrypt.</strong> It is sealed with AES-256-GCM under a key
              derived from your passphrase (PBKDF2-SHA256, 600,000 iterations,
              with a unique per-file salt and IV). Authenticated encryption means
              tampering is detectable on the way back.
            </>,
            <>
              <strong>Chunk.</strong> The ciphertext is split into fixed-size
              chunks (10&nbsp;MB by default), each hashed with SHA-256. Chunking
              is what makes large files fast, parallel, and resumable.
            </>,
          ]}
        />
        <DocP>
          The same pipeline runs in the web app and the Go terminal app (TUI), so
          a file uploaded from one decrypts cleanly in the other.
        </DocP>
      </DocSection>

      <DocSection id="api" title="Chunked HTTP API">
        <DocP>
          The backend is plain Go standard-library <code>net/http</code> — no web
          framework. The client opens an upload session, then sends each encrypted
          chunk as raw bytes with a SHA-256 header the server uses to verify
          integrity (never to decrypt). Where a platform supports it, the client
          can request a presigned URL and upload a chunk straight to the platform,
          skipping the server relay. Downloads run the same path in reverse:
          metadata first, then chunks by index.
        </DocP>
        <DocP>
          Because uploads are session-based and chunk-addressed, they are
          inherently resumable — the client asks which chunks already landed and
          re-sends only the gaps.
        </DocP>
      </DocSection>

      <DocSection id="staging" title="Staging & the sync worker">
        <DocP>
          Uploaded chunks are not pushed to a storage platform inline. The server
          first writes each chunk to a durable staging directory on disk, which
          survives restarts. A background sync worker then drains that staging
          area, pushing chunks to the right platform repository and recording the
          result. This decouples the user-facing upload from the slower,
          retry-prone platform push.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Resilience.</strong> If a platform push fails, the chunk
              stays staged and is retried; a crash mid-upload doesn't lose
              already-received chunks.
            </>,
            <>
              <strong>Read-through.</strong> If you download a file whose chunks
              haven't been synced off staging yet, the server serves them straight
              from the staging directory.
            </>,
            <>
              <strong>Progress.</strong> Upload and sync progress is pushed to the
              client over Server-Sent Events.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="adapters" title="Platform adapters & repo pool">
        <DocP>
          Each storage backend implements a common adapter interface — upload,
          download, delete, create repo, list chunks, and report repo size — so
          the pipeline treats GitHub, GitLab, Hugging Face, and Telegram
          uniformly. Optional capabilities layer on top: some adapters batch many
          chunk uploads into a single commit, and some support direct presigned
          uploads.
        </DocP>
        <DocP>
          A <strong>repo pool</strong> sits in front of the adapters. Each file's
          chunks go to a single platform, and as a repository approaches that
          platform's size threshold the pool auto-rotates to a fresh repo. This is
          why your usable space is bounded by your platform account, not by a
          fixed cap.
        </DocP>
        <DocNote type="info" title="Disguise">
          Repositories, commit messages, and stored chunk file names are
          generated to look like ordinary developer activity, so the storage side
          reveals nothing about your real files. See{" "}
          <Link href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Storage obfuscation
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="index" title="The index (PostgreSQL)">
        <DocP>
          A PostgreSQL database, accessed through <code>pgx</code> with raw SQL
          (no ORM), is the index that ties everything together: users, folders and
          files, per-file salts and chunk references, encrypted platform tokens,
          shares, and more. Every record about a file is metadata or ciphertext —
          the database holds no readable file contents and no passphrase. The
          schema is applied automatically on startup.
        </DocP>
      </DocSection>

      <DocSection id="boundary" title="The zero-knowledge boundary">
        <DocP>
          The line between your device and the server is the security boundary.
          Cross it, and only ciphertext and metadata exist:
        </DocP>
        <DocList
          items={[
            <>
              Your passphrase, and the key derived from it, never leave the
              client — they are never sent, stored, or logged.
            </>,
            <>
              Chunks arrive already encrypted; the server verifies their hashes
              but cannot decrypt them.
            </>,
            <>
              Platform tokens are the one secret the server does hold, and they're
              encrypted at rest with a per-user key derived from the instance{" "}
              <code>MASTER_KEY</code> via HKDF — so the storage platform never
              sees plaintext, and the database never sees a usable token.
            </>,
          ]}
        />
        <DocNote type="security" title="The trade-off">
          Because the server has nothing to decrypt your files with, neither do
          we — and neither does anyone who compromises the server. The flip side
          is that a forgotten passphrase is unrecoverable. See{" "}
          <Link href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Zero-knowledge architecture
          </Link>
          .
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/how-it-works" className="text-cyan-600 hover:underline dark:text-cyan-400">
              How it works — a file's journey, step by step
            </Link>,
            <Link key="b" href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Repo pool & rotation — how storage grows across repositories
            </Link>,
            <Link key="c" href="/docs/api" className="text-cyan-600 hover:underline dark:text-cyan-400">
              API reference — the endpoints behind the pipeline
            </Link>,
            <Link key="d" href="/docs/self-hosting" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Self-hosting — run the whole stack yourself
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
