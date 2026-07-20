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
  title: "Contributing | zcrypt Docs",
  description:
    "How to build zcrypt locally, the coding conventions, the pre-push quality gate, and how to open a pull request.",
  alternates: { canonical: "https://zcrypt.cloud/docs/contributing" },
  openGraph: {
    title: "Contributing | zcrypt Docs",
    description:
      "How to build zcrypt locally, the coding conventions, the pre-push quality gate, and how to open a pull request.",
    url: "https://zcrypt.cloud/docs/contributing",
  },
};

const toc = [
  { id: "overview", title: "Overview" },
  { id: "prerequisites", title: "Prerequisites" },
  { id: "setup", title: "Local setup" },
  { id: "env", title: "Environment variables" },
  { id: "conventions", title: "Coding conventions" },
  { id: "gate", title: "Quality gate" },
  { id: "pr", title: "Branch and PR conventions" },
  { id: "license", title: "License" },
];

export default function ContributingDocPage() {
  return (
    <DocPage
      href="/docs/contributing"
      title="Contributing"
      description="How to set up zcrypt locally, the conventions the project follows, and how to submit a change."
      toc={toc}
    >
      <DocSection id="overview" title="Overview">
        <DocP>
          zcrypt is a zero-knowledge encrypted cloud storage system, and this
          page mirrors the repository&apos;s{" "}
          <Link
            href="https://github.com/Wosmos/zcrypt/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            CONTRIBUTING.md
          </Link>
          . Because it&apos;s a security/cryptography product, read{" "}
          <code>SECURITY.md</code> before reporting anything that might be a
          vulnerability — do not open a public issue for security problems.
        </DocP>
      </DocSection>

      <DocSection id="prerequisites" title="Prerequisites">
        <DocList
          items={[
            <>Go 1.25+</>,
            <>
              Node.js 20+ and <code>Bun</code>
            </>,
            <>
              PostgreSQL (or a free{" "}
              <Link
                href="https://neon.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-600 hover:underline dark:text-cyan-400"
              >
                Neon
              </Link>{" "}
              database)
            </>,
            <>Docker (optional)</>,
          ]}
        />
      </DocSection>

      <DocSection id="setup" title="Local setup">
        <DocP>
          <strong>Backend</strong>
        </DocP>
        <DocCode label="shell">{`cd app/backend

# Create your own environment file from the template, then fill in real values.
cp .env.example .env
# At minimum set DATABASE_URL, MASTER_KEY, and ZCRYPT_JWT_SECRET.
# Generate keys with: openssl rand -hex 32

go build -o zcrypt-server .
go test ./...
go vet ./...

./zcrypt-server`}</DocCode>
        <DocP>
          <strong>Frontend</strong>
        </DocP>
        <DocCode label="shell">{`cd app/frontend

bun install
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

bun run dev        # dev server
bun run build      # production build
bun run lint       # lint
bun run typecheck  # type check`}</DocCode>
        <DocP>
          <strong>TUI</strong>
        </DocP>
        <DocCode label="shell">{`cd app/tui
go build ./...`}</DocCode>
      </DocSection>

      <DocSection id="env" title="Environment variables">
        <DocP>
          Never commit a real <code>.env</code>; it is gitignored. The
          backend template lives at <code>app/backend/.env.example</code> —
          copy it to <code>.env</code> and supply your own values. Each
          contributor is responsible for their own credentials. If you
          accidentally commit a secret, rotate it immediately and let a
          maintainer know.
        </DocP>
      </DocSection>

      <DocSection id="conventions" title="Coding conventions">
        <DocList
          items={[
            <>
              <strong>Backend</strong> — Standard Go. stdlib{" "}
              <code>net/http</code> (no web framework). Wrap errors with{" "}
              <code>fmt.Errorf(&quot;context: %w&quot;, err)</code>. UUID
              primary keys. Raw SQL via pgxpool (no ORM). Run{" "}
              <code>go vet ./...</code> and <code>go test ./...</code> before
              pushing.
            </>,
            <>
              <strong>Frontend</strong> — TypeScript + React 19.{" "}
              <code>&quot;use client&quot;</code> for interactive components.
              Zustand for global state, Tailwind for styling, Hugeicons for
              icons. No emojis in code. Run <code>bun run lint</code> and{" "}
              <code>bun run typecheck</code> before pushing.
            </>,
            <>
              <strong>Commits</strong> — Keep them focused and write clear
              messages.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="gate" title="Quality gate">
        <DocP>
          Before pushing, run the change-scoped quality gate. It runs
          typecheck, lint, tests, and build for whichever modules you touched
          (frontend / backend / tui / desktop), mirroring CI:
        </DocP>
        <DocCode label="shell">{`bash scripts/install-hooks.sh          # once per clone — wires the pre-push hook
bash scripts/prepush.sh --gates-only   # fast: gates only
bash scripts/prepush.sh                # full: gates + advisory backlog scans -> docs/report.md`}</DocCode>
        <DocNote type="info" title="The pre-push hook runs this for you">
          Once installed, the pre-push hook runs the gates automatically on{" "}
          <code>git push</code>; bypass a single push with{" "}
          <code>git push --no-verify</code> if you must.
        </DocNote>
      </DocSection>

      <DocSection id="pr" title="Branch and PR conventions">
        <DocList
          items={[
            <>
              Fork the repository (or create a feature branch if you have
              write access). Do not commit directly to <code>main</code>.
            </>,
            <>
              Use a descriptive branch name, e.g.{" "}
              <code>feat/repo-rotation</code>, <code>fix/cors-whitelist</code>
              , or <code>docs/readme</code>.
            </>,
            <>
              Make your change with tests where it makes sense, and ensure the
              build, lint, type check, and tests pass.
            </>,
            <>
              Open a pull request against <code>main</code> with a clear
              description of what changed and why. Link any related issue.
            </>,
            <>
              A maintainer will review. Address feedback by pushing
              additional commits to the same branch.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="license" title="License">
        <DocP>
          By contributing to zcrypt, you agree that your contributions will
          be licensed under the{" "}
          <Link
            href="/docs/license"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            MIT License
          </Link>
          , the same license that covers the project.
        </DocP>
        <DocP>
          Full source and issue tracker:{" "}
          <Link
            href="https://github.com/Wosmos/zcrypt"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            github.com/Wosmos/zcrypt
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
