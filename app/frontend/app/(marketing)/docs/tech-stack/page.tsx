import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocTable,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Tech stack & infrastructure | zcrypt Docs",
  description:
    "The technology behind zcrypt: a Go standard-library backend, a shared Rust core for the native apps, a Next.js 16 + React 19 web app, PostgreSQL via pgx, and Tauri desktop/mobile shells — deployed on Vercel, a Docker-on-a-cloud-VM backend, and Neon serverless Postgres.",
  alternates: { canonical: "https://zcrypt.cloud/docs/tech-stack" },
  openGraph: {
    title: "Tech stack & infrastructure | zcrypt Docs",
    description:
      "Languages, frameworks, and hosting behind zcrypt — Go, Rust, Next.js, PostgreSQL, Tauri — and how it's deployed.",
    url: "https://zcrypt.cloud/docs/tech-stack",
  },
};

const toc = [
  { id: "principles", title: "How it's put together" },
  { id: "backend", title: "Backend" },
  { id: "web", title: "Web app" },
  { id: "core", title: "Native core & apps" },
  { id: "tui", title: "Terminal app" },
  { id: "crypto", title: "Crypto & compression" },
  { id: "data", title: "Data & storage" },
  { id: "infra", title: "Infrastructure & hosting" },
  { id: "next", title: "Where to go next" },
];

export default function TechStackPage() {
  return (
    <DocPage
      href="/docs/tech-stack"
      title="Tech stack & infrastructure"
      description="Everything zcrypt is built with, layer by layer — and how each piece is deployed. Versions track the repository; the manifests (go.mod, package.json, Cargo.toml) are the source of truth."
      toc={toc}
    >
      <DocSection id="principles" title="How it's put together">
        <DocP>
          zcrypt is one product across four surfaces — web, desktop, Android, and
          a terminal app — sharing a single design principle: all encryption
          happens on your device, and the server only ever handles ciphertext.
          That principle drives the stack. The backend stays deliberately thin
          (standard-library Go, no framework), the cryptography lives in code
          that runs on the client (a Rust core for native, Web Workers for the
          browser), and the database stores only metadata and encrypted blobs.
        </DocP>
        <DocNote type="info" title="The manifests are canonical">
          Exact versions live in <code>app/backend/go.mod</code>,{" "}
          <code>app/frontend/package.json</code>, and{" "}
          <code>app/core/Cargo.toml</code>. The numbers below reflect the current
          tree and may drift slightly ahead of a release.
        </DocNote>
      </DocSection>

      <DocSection id="backend" title="Backend">
        <DocP>
          A stateless HTTP service written in Go with the standard library only —
          no web framework, just <code>net/http</code>. It brokers the chunked
          upload/download API, coordinates the storage adapters, and holds no
          plaintext and no encryption keys.
        </DocP>
        <DocTable
          head={["Piece", "Choice", "Why"]}
          rows={[
            [<strong key="l">Language</strong>, "Go 1.25", "Fast, statically linked, tiny distroless container."],
            [<strong key="h">HTTP</strong>, <>Standard library <code>net/http</code></>, "No framework — fewer moving parts, easy to audit."],
            [<strong key="d">DB driver</strong>, "pgx / pgxpool", "Raw SQL against PostgreSQL, no ORM."],
            [<strong key="a">Auth</strong>, "JWT (HS256), bcrypt, TOTP", "Access/refresh tokens, hashed passwords, 2FA."],
            [<strong key="c">Compression / crypto</strong>, "zstd · AES-256-GCM", "Server-side only for the narrow re-encryption paths; file crypto is client-side."],
          ]}
        />
      </DocSection>

      <DocSection id="web" title="Web app">
        <DocP>
          The browser client is a Next.js App Router application. The full
          encryption pipeline runs here in a pool of Web Workers, so compression,
          encryption, and hashing happen off the main thread — the server never
          sees a plaintext byte.
        </DocP>
        <DocTable
          head={["Piece", "Choice"]}
          rows={[
            [<strong key="f">Framework</strong>, "Next.js 16 (App Router)"],
            [<strong key="r">UI runtime</strong>, "React 19"],
            [<strong key="t">Language</strong>, "TypeScript 5.7"],
            [<strong key="s">Styling</strong>, "Tailwind CSS"],
            [<strong key="st">State</strong>, "Zustand"],
            [<strong key="m">Motion</strong>, "Motion (Framer Motion)"],
            [<strong key="rt">Runtime / package manager</strong>, "Bun"],
          ]}
        />
      </DocSection>

      <DocSection id="core" title="Native core & apps">
        <DocP>
          Desktop and mobile run <strong>zcrypt-core</strong>, a shared Rust
          crate that implements the same zero-knowledge crypto and chunk pipeline
          as the web workers — compiled to native code and embedded in-process, so
          there is no subprocess (which is what makes it work inside Apple&apos;s
          app sandbox). The native shell is Tauri v2.
        </DocP>
        <DocTable
          head={["Piece", "Choice", "Notes"]}
          rows={[
            [<strong key="c">Core engine</strong>, "Rust (zcrypt-core, edition 2021)", "Crypto, chunk pipeline, local ledger, platform adapters."],
            [<strong key="a">Async / HTTP</strong>, "tokio · reqwest", "Concurrent chunk streaming, direct-to-platform uploads."],
            [<strong key="s">Shell</strong>, "Tauri v2", "Native window + OS integration on macOS, Windows, Linux, Android."],
            [<strong key="l">Local store</strong>, "Embedded SQLite ledger", "Offline resume, dedup lookups, sync cursor."],
          ]}
        />
        <DocP>
          See{" "}
          <Link href="/docs/desktop-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Desktop app
          </Link>{" "}
          and{" "}
          <Link href="/docs/android-app" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Android app
          </Link>{" "}
          for how the shared core reaches each platform.
        </DocP>
      </DocSection>

      <DocSection id="tui" title="Terminal app">
        <DocP>
          The TUI is a separate, single-binary Go program built with Bubble Tea.
          It runs the same client-side encryption pipeline and talks to the same
          backend API — no runtime, no browser, works over SSH.
        </DocP>
      </DocSection>

      <DocSection id="crypto" title="Crypto & compression">
        <DocP>
          The cryptographic format is identical across every surface and pinned by
          conformance vectors, so a file encrypted in one client decrypts in any
          other.
        </DocP>
        <DocTable
          head={["Concern", "Primitive"]}
          rows={[
            [<strong key="e">Encryption</strong>, "AES-256-GCM (authenticated)"],
            [<strong key="k">Key derivation</strong>, "PBKDF2-HMAC-SHA256, 600,000 iterations"],
            [<strong key="h">Integrity</strong>, "SHA-256 per chunk + whole-file hash"],
            [<strong key="d">Dedup MAC</strong>, "HMAC-SHA256"],
            [<strong key="c">Compression</strong>, "zstd (per-chunk, skipped when it wouldn't help)"],
            [<strong key="s">Sharing</strong>, "X25519 ECIES key-wrapping (keys move, never plaintext)"],
          ]}
        />
      </DocSection>

      <DocSection id="data" title="Data & storage">
        <DocP>
          A PostgreSQL database is the index that ties everything together — users,
          folders, per-file salts, chunk references, encrypted platform tokens,
          and shares. It holds no readable file contents and no passphrase. Your
          actual encrypted bytes never live on zcrypt&apos;s infrastructure at
          all: they go to a storage platform <em>you</em> own.
        </DocP>
        <DocTable
          head={["Layer", "Choice"]}
          rows={[
            [<strong key="d">Database</strong>, "PostgreSQL (Neon serverless)"],
            [<strong key="a">Access</strong>, <>Raw SQL via <code>pgx</code> / pgxpool — no ORM</>],
            [<strong key="s">Your storage backends</strong>, "GitHub · GitLab · Hugging Face · Telegram (bring your own)"],
          ]}
        />
      </DocSection>

      <DocSection id="infra" title="Infrastructure & hosting">
        <DocP>
          Deployment is intentionally boring and portable. The backend is a small
          distroless Docker image that runs on any Linux host; nothing about it is
          tied to a specific provider, which is the point — you can self-host the
          exact same image (see{" "}
          <Link href="/docs/self-hosting" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Self-hosting
          </Link>
          ).
        </DocP>
        <DocTable
          head={["Component", "Where it runs"]}
          rows={[
            [<strong key="f">Frontend</strong>, "Vercel (Next.js)"],
            [<strong key="b">Backend</strong>, "Distroless Docker image on a cloud Linux VM (provider-agnostic)"],
            [<strong key="d">Database</strong>, "Neon serverless PostgreSQL"],
            [<strong key="s">Encrypted file storage</strong>, "Your own GitHub / GitLab / Hugging Face / Telegram accounts"],
          ]}
        />
        <DocNote type="security" title="What our infrastructure can and can't see">
          Because encryption is client-side, our hosting only ever handles
          ciphertext and metadata. Compromising the frontend, the backend VM, or
          the database would not expose your files — the keys to decrypt them
          exist only on your devices.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>
          For how these pieces move data at runtime, read{" "}
          <Link href="/docs/architecture" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Architecture
          </Link>
          . To run the whole stack yourself, see{" "}
          <Link href="/docs/self-hosting" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Self-hosting
          </Link>
          , and to build on it,{" "}
          <Link href="/docs/contributing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Contributing
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
