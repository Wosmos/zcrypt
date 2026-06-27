import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Self-hosting | zcrypt Docs",
  description:
    "Run your own zcrypt instance with Docker. Configure the database, master key, JWT secret, allowed origins, optional Google/GitHub OAuth and Resend email, and point the Next.js frontend at your backend.",
  alternates: { canonical: "https://zcrypt.cloud/docs/self-hosting" },
  openGraph: {
    title: "Self-hosting | zcrypt Docs",
    description:
      "Run your own zcrypt instance with Docker — real required and optional environment variables, OAuth setup, and the frontend env.",
    url: "https://zcrypt.cloud/docs/self-hosting",
  },
};

const toc = [
  { id: "overview", title: "Overview" },
  { id: "prerequisites", title: "Prerequisites" },
  { id: "docker", title: "Run with Docker" },
  { id: "required", title: "Required environment variables" },
  { id: "optional", title: "Optional environment variables" },
  { id: "oauth", title: "OAuth (Google / GitHub)" },
  { id: "frontend", title: "Frontend" },
  { id: "next", title: "Where to go next" },
];

export default function SelfHostingDocPage() {
  return (
    <DocPage
      href="/docs/self-hosting"
      title="Self-hosting"
      description="zcrypt is open source. Run your own backend with Docker for full control over the database, master key, and storage. The frontend is a standard Next.js app you can deploy anywhere."
      toc={toc}
    >
      <DocSection id="overview" title="Overview">
        <DocP>
          A zcrypt deployment is two pieces: a stateless Go backend (the API,
          built into a tiny distroless container image) and a Next.js frontend.
          The backend talks to a PostgreSQL database and is configured entirely
          through environment variables. It holds no plaintext and no encryption
          keys — encryption and decryption happen in the browser — so the only
          long-lived secret you must protect is the <code>MASTER_KEY</code>,
          which wraps your connected storage tokens at rest.
        </DocP>
        <DocP>
          A documented template with placeholder values lives at{" "}
          <code>app/backend/.env.example</code>. Copy it to{" "}
          <code>app/backend/.env</code> and fill in your own values — the{" "}
          <code>.env</code> file is gitignored, so never commit real secrets.
        </DocP>
      </DocSection>

      <DocSection id="prerequisites" title="Prerequisites">
        <DocList
          items={[
            <>
              <strong>PostgreSQL</strong> — a local instance or a managed
              provider such as Neon. The schema is applied automatically on first
              boot (or run the <code>migrate</code> subcommand).
            </>,
            <>
              <strong>Docker</strong> — the simplest way to run the backend. The
              repository ships a multi-stage <code>Dockerfile</code> at its root.
            </>,
            <>
              <strong>Go 1.25+</strong> — only needed if you build the backend
              from source instead of using Docker.
            </>,
            <>
              <strong>Node.js 20+ and Bun</strong> — for building or running the
              frontend.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="docker" title="Run with Docker">
        <DocP>
          Build the image from the repository root, then run it with your
          configuration passed as environment variables. At minimum you need a
          database connection, a master key, a JWT secret, and your frontend
          origin.
        </DocP>
        <DocCode label="shell">{`# Build from the repo root (the Dockerfile lives there)
docker build -t zcrypt .

# Run it
docker run -p 8080:8080 \\
  -e DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \\
  -e MASTER_KEY="$(openssl rand -hex 32)" \\
  -e ZCRYPT_JWT_SECRET="$(openssl rand -hex 32)" \\
  -e FRONTEND_URL="https://your-frontend.example.com" \\
  -e ALLOWED_ORIGINS="https://your-frontend.example.com" \\
  zcrypt`}</DocCode>
        <DocP>
          Prefer an env file? Pass <code>--env-file app/backend/.env</code>{" "}
          instead of repeating <code>-e</code> flags. The container listens on{" "}
          <code>8080</code> by default; hosts like Railway inject a{" "}
          <code>PORT</code> variable, which the server also honours.
        </DocP>
        <DocNote type="security" title="Guard the MASTER_KEY">
          The <code>MASTER_KEY</code> is a 32-byte hex value that encrypts every
          stored platform token at rest. Generate a fresh one with{" "}
          <code>openssl rand -hex 32</code> and keep it safe. If you lose it,
          connected storage tokens can no longer be decrypted; if it leaks, those
          tokens are exposed. It never encrypts your files — those are sealed in
          the browser under your passphrase.
        </DocNote>
      </DocSection>

      <DocSection id="required" title="Required environment variables">
        <DocP>
          These must be set for a production deployment. The server refuses to
          start without <code>DATABASE_URL</code> and <code>MASTER_KEY</code>.
        </DocP>
        <DocTable
          head={["Variable", "Description"]}
          rows={[
            [
              <code key="v">DATABASE_URL</code>,
              "PostgreSQL connection string (e.g. a Neon serverless database). The schema migrates automatically on startup.",
            ],
            [
              <code key="v">MASTER_KEY</code>,
              <>
                32-byte hex key (64 hex chars) for envelope encryption of
                platform tokens at rest. Generate with{" "}
                <code>openssl rand -hex 32</code>.
              </>,
            ],
            [
              <code key="v">ZCRYPT_JWT_SECRET</code>,
              <>
                Secret used to sign access and refresh tokens (HS256). Must be at
                least 32 characters. If left empty the server auto-generates an
                ephemeral one, so set a stable value in production or tokens stop
                validating after a restart.
              </>,
            ],
            [
              <code key="v">FRONTEND_URL</code>,
              "Public URL of your frontend. Used for email links and the post-OAuth redirect, and added to the CORS allow-list automatically. No trailing slash.",
            ],
            [
              <code key="v">ALLOWED_ORIGINS</code>,
              <>
                Comma-separated list of origins allowed by CORS. Defaults to{" "}
                <code>localhost</code> if unset; <code>FRONTEND_URL</code> is
                always added on top.
              </>,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="optional" title="Optional environment variables">
        <DocP>
          Everything below is optional. OAuth and email each switch on only when
          their full set of values is present.
        </DocP>
        <DocTable
          head={["Variable", "Description"]}
          rows={[
            [
              <code key="v">BACKEND_URL</code>,
              <>
                Public backend URL (e.g. <code>https://api.example.com</code>),
                no trailing slash. <strong>Required for OAuth</strong> — it builds
                the <code>redirect_uri</code> and must exactly match what is
                registered with Google/GitHub. If unset it is derived per-request,
                which usually breaks OAuth.
              </>,
            ],
            [
              <code key="v">ZCRYPT_PORT</code>,
              <>
                Port to listen on (default <code>8080</code>). <code>PORT</code>{" "}
                is also honoured for cloud hosts that inject it.
              </>,
            ],
            [
              <code key="v">ZCRYPT_TRUSTED_PROXY_COUNT</code>,
              <>
                Number of trusted reverse-proxy hops in front of the app. The
                real client IP is read that many hops in from the right of the{" "}
                <code>X-Forwarded-For</code> chain. <code>0</code> (default)
                ignores forwarding headers so clients cannot spoof their IP to
                bypass rate limits; set <code>1</code> behind a single proxy such
                as Railway.
              </>,
            ],
            [
              <code key="v">RESEND_API_KEY</code>,
              "Resend API key. Enables transactional email (verification, password reset, magic links). When set, RESEND_FROM is also required.",
            ],
            [
              <code key="v">RESEND_FROM</code>,
              <>
                From address for emails, e.g.{" "}
                <code>zcrypt &lt;noreply@example.com&gt;</code>.
              </>,
            ],
            [
              <code key="v">DEV_MODE</code>,
              <>
                Set to <code>true</code> only for local load testing — it
                disables all rate limiting. Never enable it in production.
              </>,
            ],
          ]}
        />
        <DocNote type="info" title="Email is optional, but recommended">
          Without <code>RESEND_API_KEY</code> the server runs fine, but it cannot
          send verification or password-reset emails. If you configure email, both
          the API key and the from-address are validated at startup.
        </DocNote>
      </DocSection>

      <DocSection id="oauth" title="OAuth (Google / GitHub)">
        <DocP>
          Sign-in with Google or GitHub is optional. A provider is enabled only
          when both its client ID and secret are present.
        </DocP>
        <DocTable
          head={["Variable", "Description"]}
          rows={[
            [<code key="v">GOOGLE_CLIENT_ID</code>, "Google OAuth client ID."],
            [<code key="v">GOOGLE_CLIENT_SECRET</code>, "Google OAuth client secret."],
            [<code key="v">GITHUB_CLIENT_ID</code>, "GitHub OAuth app client ID."],
            [<code key="v">GITHUB_CLIENT_SECRET</code>, "GitHub OAuth app client secret."],
          ]}
        />
        <DocP>
          Register these exact redirect URIs with each provider, substituting your
          real <code>BACKEND_URL</code>:
        </DocP>
        <DocCode label="redirect URIs">{`# Google -> Authorized redirect URIs
https://<BACKEND_URL>/api/auth/oauth/google/callback

# GitHub -> Authorization callback URL
https://<BACKEND_URL>/api/auth/oauth/github/callback`}</DocCode>
        <DocP>
          The backend logs the exact URIs to register at startup, and serves them
          (with no secrets) at <code>GET /api/auth/oauth/config</code> so you can
          verify the live configuration.
        </DocP>
      </DocSection>

      <DocSection id="frontend" title="Frontend">
        <DocP>
          The frontend only needs to know where the backend lives. Point it at
          your running backend, then run the dev server or produce a production
          build.
        </DocP>
        <DocCode label="shell">{`cd app/frontend

# Install dependencies
bun install

# Point the frontend at your backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Dev server
bun run dev

# Production build
bun run build`}</DocCode>
        <DocTable
          head={["Variable", "Description"]}
          rows={[
            [
              <code key="v">NEXT_PUBLIC_API_URL</code>,
              "Base URL of your zcrypt backend API. Baked in at build time, so rebuild after changing it.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/architecture" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Architecture — how the pipeline, staging, sync worker, and adapters fit together
            </Link>,
            <Link key="b" href="/docs/api" className="text-cyan-600 hover:underline dark:text-cyan-400">
              API reference — the REST endpoints your instance exposes
            </Link>,
            <Link key="c" href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Bring your own storage — connect GitHub, GitLab, Hugging Face, or Telegram
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
