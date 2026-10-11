import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Self-hosting | zcrypt Docs",
  description:
    "Run your own zcrypt instance with Docker. Configure the database, master key, JWT secret, allowed origins, optional Google/GitHub OAuth and Resend email, and point the Next.js frontend at your backend.",
  alternates: { canonical: `${SITE_URL}/docs/self-hosting` },
  openGraph: {
    title: "Self-hosting | zcrypt Docs",
    description:
      "Run your own zcrypt instance with Docker: real required and optional environment variables, OAuth setup, and the frontend env.",
    url: `${SITE_URL}/docs/self-hosting`,
  },
};

const toc = [
  { id: "overview", k: "docs.self-hosting.toc.overview" },
  { id: "prerequisites", k: "docs.self-hosting.toc.prerequisites" },
  { id: "docker", k: "docs.self-hosting.toc.docker" },
  { id: "required", k: "docs.self-hosting.toc.required" },
  { id: "optional", k: "docs.self-hosting.toc.optional" },
  { id: "oauth", k: "docs.self-hosting.toc.oauth" },
  { id: "frontend", k: "docs.self-hosting.toc.frontend" },
  { id: "next", k: "docs.self-hosting.toc.next" },
];

export default function SelfHostingDocPage() {
  return (
    <DocPage
      href="/docs/self-hosting"
      title="Self-hosting"
      description="zcrypt is open source. Run your own backend with Docker for full control over the database, master key, and storage. The frontend is a standard Next.js app you can deploy anywhere."
      toc={toc}
    >
      <DocSection id="overview" title={<T k="docs.self-hosting.a3" />}>
        <DocP>
          <T k="docs.self-hosting.p1" />
        </DocP>
        <DocP>
          <T k="docs.self-hosting.p2" />
        </DocP>
      </DocSection>

      <DocSection id="prerequisites" title={<T k="docs.self-hosting.a8" />}>
        <DocList
          items={[
            <T key="docs.self-hosting.p4" k="docs.self-hosting.p4" />,
            <T key="docs.self-hosting.p5" k="docs.self-hosting.p5" />,
            <T key="docs.self-hosting.p6" k="docs.self-hosting.p6" />,
            <T key="docs.self-hosting.p7" k="docs.self-hosting.p7" />,
          ]}
        />
      </DocSection>

      <DocSection id="docker" title={<T k="docs.self-hosting.a15" />}>
        <DocP>
          <T k="docs.self-hosting.p9" />
        </DocP>
        <DocCode
          label={<T k="docs.self-hosting.a11" />}
        >{`# Build from the repo root (the Dockerfile lives there)
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
          <T k="docs.self-hosting.p12" />
        </DocP>
        <DocNote type="security" title={<T k="docs.self-hosting.a14" />}>
          <T k="docs.self-hosting.p13" />
        </DocNote>
      </DocSection>

      <DocSection id="required" title={<T k="docs.self-hosting.a24" />}>
        <DocP>
          <T k="docs.self-hosting.p16" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.self-hosting.p17" k="docs.self-hosting.p17" />,
            <T key="docs.self-hosting.p18" k="docs.self-hosting.p18" />,
          ]}
          rows={[
            [
              <code key="v">DATABASE_URL</code>,
              <T key="docs.self-hosting.p19" k="docs.self-hosting.p19" />,
            ],
            [
              <code key="v">MASTER_KEY</code>,
              <T key="docs.self-hosting.p20" k="docs.self-hosting.p20" />,
            ],
            [
              <code key="v">ZCRYPT_JWT_SECRET</code>,
              <T key="docs.self-hosting.p21" k="docs.self-hosting.p21" />,
            ],
            [
              <code key="v">FRONTEND_URL</code>,
              <T key="docs.self-hosting.p22" k="docs.self-hosting.p22" />,
            ],
            [
              <code key="v">ALLOWED_ORIGINS</code>,
              <T key="docs.self-hosting.p23" k="docs.self-hosting.p23" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="optional" title={<T k="docs.self-hosting.a36" />}>
        <DocP>
          <T k="docs.self-hosting.p25" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.self-hosting.p26" k="docs.self-hosting.p26" />,
            <T key="docs.self-hosting.p27" k="docs.self-hosting.p27" />,
          ]}
          rows={[
            [
              <code key="v">BACKEND_URL</code>,
              <T key="docs.self-hosting.p28" k="docs.self-hosting.p28" />,
            ],
            [
              <code key="v">ZCRYPT_PORT</code>,
              <T key="docs.self-hosting.p29" k="docs.self-hosting.p29" />,
            ],
            [
              <code key="v">ZCRYPT_TRUSTED_PROXY_COUNT</code>,
              <T key="docs.self-hosting.p30" k="docs.self-hosting.p30" />,
            ],
            [
              <code key="v">RESEND_API_KEY</code>,
              <T key="docs.self-hosting.p31" k="docs.self-hosting.p31" />,
            ],
            [
              <code key="v">RESEND_FROM</code>,
              <T key="docs.self-hosting.p32" k="docs.self-hosting.p32" />,
            ],
            [
              <code key="v">DEV_MODE</code>,
              <T key="docs.self-hosting.p33" k="docs.self-hosting.p33" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.self-hosting.a35" />}>
          <T k="docs.self-hosting.p34" />
        </DocNote>
      </DocSection>

      <DocSection id="oauth" title={<T k="docs.self-hosting.a48" />}>
        <DocP>
          <T k="docs.self-hosting.p37" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.self-hosting.p38" k="docs.self-hosting.p38" />,
            <T key="docs.self-hosting.p39" k="docs.self-hosting.p39" />,
          ]}
          rows={[
            [
              <code key="v">GOOGLE_CLIENT_ID</code>,
              <T key="docs.self-hosting.p40" k="docs.self-hosting.p40" />,
            ],
            [
              <code key="v">GOOGLE_CLIENT_SECRET</code>,
              <T key="docs.self-hosting.p41" k="docs.self-hosting.p41" />,
            ],
            [
              <code key="v">GITHUB_CLIENT_ID</code>,
              <T key="docs.self-hosting.p42" k="docs.self-hosting.p42" />,
            ],
            [
              <code key="v">GITHUB_CLIENT_SECRET</code>,
              <T key="docs.self-hosting.p43" k="docs.self-hosting.p43" />,
            ],
          ]}
        />
        <DocP>
          <T k="docs.self-hosting.p44" />
        </DocP>
        <DocCode label={<T k="docs.self-hosting.a46" />}>{`# Google -> Authorized redirect URIs
https://<BACKEND_URL>/api/auth/oauth/google/callback

# GitHub -> Authorization callback URL
https://<BACKEND_URL>/api/auth/oauth/github/callback`}</DocCode>
        <DocP>
          <T k="docs.self-hosting.p47" />
        </DocP>
      </DocSection>

      <DocSection id="frontend" title={<T k="docs.self-hosting.a55" />}>
        <DocP>
          <T k="docs.self-hosting.p49" />
        </DocP>
        <DocCode label={<T k="docs.self-hosting.a51" />}>{`cd app/frontend

# Install dependencies
bun install

# Point the frontend at your backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Dev server
bun run dev

# Production build
bun run build`}</DocCode>
        <DocTable
          head={[
            <T key="docs.self-hosting.p52" k="docs.self-hosting.p52" />,
            <T key="docs.self-hosting.p53" k="docs.self-hosting.p53" />,
          ]}
          rows={[
            [
              <code key="v">NEXT_PUBLIC_API_URL</code>,
              <T key="docs.self-hosting.p54" k="docs.self-hosting.p54" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.self-hosting.a59" />}>
        <DocList
          items={[
            <T
              key="docs.self-hosting.p56"
              k="docs.self-hosting.p56"
              links={{ l1: "/docs/architecture" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.self-hosting.p57"
              k="docs.self-hosting.p57"
              links={{ l1: "/docs/api" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.self-hosting.p58"
              k="docs.self-hosting.p58"
              links={{ l1: "/docs/platform-adapters" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
