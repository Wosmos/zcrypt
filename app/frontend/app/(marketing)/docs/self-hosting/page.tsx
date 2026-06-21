import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Shield,
  Server,
  Key,
  Globe,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Self-Hosting | zcrypt Docs",
  description:
    "Run your own zcrypt instance with Docker. Configure the database, master key, environment variables, and optional Google/GitHub OAuth.",
  keywords: [
    "self-host zcrypt",
    "zcrypt docker",
    "zcrypt environment variables",
    "zcrypt oauth setup",
    "open source encrypted storage self hosting",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/self-hosting",
  },
  openGraph: {
    title: "Self-Hosting | zcrypt Docs",
    description:
      "Run your own zcrypt instance with Docker. Configure the database, environment variables, and optional OAuth.",
    url: "https://zcrypt.cloud/docs/self-hosting",
  },
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="card overflow-x-auto p-4 text-xs leading-relaxed font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-1)]">
      <code>{children}</code>
    </pre>
  );
}

const requiredEnv = [
  {
    name: "DATABASE_URL",
    desc: "PostgreSQL connection string.",
  },
  {
    name: "MASTER_KEY",
    desc: "32-byte hex key for envelope encryption of platform tokens. Generate with `openssl rand -hex 32`.",
  },
  {
    name: "ZCRYPT_JWT_SECRET",
    desc: "JWT signing secret. Auto-generated if left empty, but set it explicitly in production so tokens survive restarts.",
  },
  {
    name: "FRONTEND_URL",
    desc: "Frontend URL — used for email links and the post-OAuth redirect, and added to the CORS whitelist.",
  },
  {
    name: "BACKEND_URL",
    desc: "Public backend URL (e.g. https://api.zcrypt.app), no trailing slash. Required for OAuth — it builds the redirect_uri and must exactly match what is registered with Google/GitHub.",
  },
  {
    name: "ALLOWED_ORIGINS",
    desc: "Comma-separated CORS whitelist. Defaults to localhost; FRONTEND_URL is added automatically.",
  },
];

const optionalEnv = [
  { name: "ZCRYPT_PORT", desc: "Server port (default: 8080)." },
  { name: "SMTP_HOST", desc: "SMTP server for email verification." },
  { name: "SMTP_PORT", desc: "SMTP port (default: 587)." },
  { name: "SMTP_USERNAME", desc: "SMTP login." },
  { name: "SMTP_PASSWORD", desc: "SMTP password." },
  { name: "SMTP_FROM", desc: "Sender email address." },
];

const oauthEnv = [
  { name: "GOOGLE_CLIENT_ID", desc: "Google OAuth client ID." },
  { name: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth client secret." },
  { name: "GITHUB_CLIENT_ID", desc: "GitHub OAuth app client ID." },
  { name: "GITHUB_CLIENT_SECRET", desc: "GitHub OAuth app client secret." },
];

const sections = [
  { id: "prerequisites", title: "Prerequisites" },
  { id: "docker", title: "Run with Docker" },
  { id: "env", title: "Environment Variables" },
  { id: "oauth", title: "OAuth (Google / GitHub login)" },
  { id: "frontend", title: "Frontend" },
];

export default function SelfHostingPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Self-Hosting",
            url: "https://zcrypt.cloud/docs/self-hosting",
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
            Self-Hosting
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            zcrypt is open source. Run your own instance with Docker for full
            control over the backend, database, and storage. The frontend is a
            standard Next.js app you can deploy anywhere.
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
          {/* Prerequisites */}
          <div id="prerequisites" className="scroll-mt-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-500" />
              Prerequisites
            </h2>
            <ul className="space-y-2 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <li>Go 1.25+ (only needed if you build from source instead of using Docker)</li>
              <li>Node.js 20+ and Bun, for the frontend</li>
              <li>
                PostgreSQL — a local instance or a managed provider such as Neon
              </li>
              <li>Docker, for the simplest backend deployment</li>
            </ul>
          </div>

          {/* Docker */}
          <div id="docker" className="scroll-mt-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-cyan-500" />
              Run with Docker
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4">
              Build the image from the repository root and run it, passing your
              configuration as environment variables. At minimum you need a
              database connection, a master key, and your frontend origin.
            </p>
            <CodeBlock>{`docker build -t zcrypt .

docker run -p 8080:8080 \\
  -e DATABASE_URL="postgresql://..." \\
  -e MASTER_KEY="$(openssl rand -hex 32)" \\
  -e FRONTEND_URL="https://your-frontend.vercel.app" \\
  -e ALLOWED_ORIGINS="https://your-frontend.vercel.app" \\
  zcrypt`}</CodeBlock>
            <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong className="font-semibold">Important:</strong> Generate a
                fresh <code className="font-mono">MASTER_KEY</code> with{" "}
                <code className="font-mono">openssl rand -hex 32</code> and keep
                it safe. It encrypts every stored platform token. If you lose it,
                connected tokens can no longer be decrypted; if it leaks, those
                tokens are exposed.
              </p>
            </div>
          </div>

          {/* Environment variables */}
          <div id="env" className="scroll-mt-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Key className="h-4 w-4 text-cyan-500" />
              Environment Variables
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
              The backend is configured entirely through environment variables. A
              documented template with placeholder values lives at{" "}
              <code className="font-mono text-xs">
                app/backend/.env.example
              </code>{" "}
              — copy it to <code className="font-mono text-xs">.env</code> and
              fill in your own values. The{" "}
              <code className="font-mono text-xs">.env</code> file is gitignored;
              never commit real secrets.
            </p>

            <h3 className="text-sm font-bold mb-3">Required</h3>
            <div className="card overflow-hidden mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Variable
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requiredEnv.map((row) => (
                    <tr
                      key={row.name}
                      className="border-t border-[var(--color-border)] align-top"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-bold mb-3">Optional</h3>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Variable
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {optionalEnv.map((row) => (
                    <tr
                      key={row.name}
                      className="border-t border-[var(--color-border)] align-top"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OAuth */}
          <div id="oauth" className="scroll-mt-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-500" />
              OAuth (Google / GitHub login)
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
              OAuth login is optional. A provider is enabled only when both its
              client ID and secret are set.
            </p>
            <div className="card overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Variable
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {oauthEnv.map((row) => (
                    <tr
                      key={row.name}
                      className="border-t border-[var(--color-border)] align-top"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4">
              Register these exact redirect URIs with each provider, substituting
              your real <code className="font-mono text-xs">BACKEND_URL</code>:
            </p>
            <CodeBlock>{`# Google -> Authorized redirect URIs
https://<BACKEND_URL>/api/auth/oauth/google/callback

# GitHub -> Authorization callback URL
https://<BACKEND_URL>/api/auth/oauth/github/callback`}</CodeBlock>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mt-4">
              The backend logs the exact URIs to register at startup, and serves
              them at{" "}
              <code className="font-mono text-xs">
                GET /api/auth/oauth/config
              </code>{" "}
              (no secrets) so you can verify the live configuration.
            </p>
          </div>

          {/* Frontend */}
          <div id="frontend" className="scroll-mt-24">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-cyan-500" />
              Frontend
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-4">
              The frontend only needs to know where the backend lives. Point it
              at your running backend, then build or run the dev server.
            </p>
            <CodeBlock>{`cd app/frontend

# Install dependencies
bun install

# Point the frontend at your backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Dev server
bun run dev

# Production build
bun run build`}</CodeBlock>
            <div className="card overflow-hidden mt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Variable
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[var(--color-border)] align-top">
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">
                      NEXT_PUBLIC_API_URL
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                      Backend API URL.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-500" />
            Related
          </h2>
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
                How zcrypt encrypts your data and protects platform tokens at
                rest.
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
                Connect GitHub, GitLab, Hugging Face, or Telegram as your storage
                backend.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
