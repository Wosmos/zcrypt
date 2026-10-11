import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocCode, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Architecture | zcrypt Docs",
  description:
    "How zcrypt fits together: a client-side chunk, compress, and encrypt pipeline that runs in a Web Worker pool, a chunked HTTP API, streaming download-to-disk, durable disk staging plus a background sync worker, pluggable platform adapters, repo-pool auto-rotation, a PostgreSQL index, and end-to-end shared spaces: all behind a strict zero-knowledge boundary.",
  alternates: { canonical: `${SITE_URL}/docs/architecture` },
  openGraph: {
    title: "Architecture | zcrypt Docs",
    description:
      "The zcrypt worker-pool pipeline, streaming downloads, staging and sync worker, platform adapters, shared spaces, and the zero-knowledge boundary.",
    url: `${SITE_URL}/docs/architecture`,
  },
};

const toc = [
  { id: "overview", k: "docs.architecture.toc.overview" },
  { id: "diagram", k: "docs.architecture.toc.diagram" },
  { id: "client", k: "docs.architecture.toc.client" },
  { id: "download", k: "docs.architecture.toc.download" },
  { id: "api", k: "docs.architecture.toc.api" },
  { id: "staging", k: "docs.architecture.toc.staging" },
  { id: "adapters", k: "docs.architecture.toc.adapters" },
  { id: "index", k: "docs.architecture.toc.index" },
  { id: "spaces", k: "docs.architecture.toc.spaces" },
  { id: "boundary", k: "docs.architecture.toc.boundary" },
  { id: "next", k: "docs.architecture.toc.next" },
];

export default function ArchitectureDocPage() {
  return (
    <DocPage
      href="/docs/architecture"
      title="Architecture"
      description="zcrypt is a thin, stateless server wrapped around a client-side encryption pipeline and your own storage accounts. Here is how the pieces connect, and why the server can never read your files."
      toc={toc}
    >
      <DocSection id="overview" title={<T k="docs.architecture.a2" />}>
        <DocP>
          <T k="docs.architecture.p1" />
        </DocP>
      </DocSection>

      <DocSection id="diagram" title={<T k="docs.architecture.a5" />}>
        <DocCode
          label={<T k="docs.architecture.a4" />}
        >{`Your device (browser / app)            zcrypt backend (Go, stateless)         Your storage
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

      <DocSection id="client" title={<T k="docs.architecture.a12" />}>
        <DocP>
          <T k="docs.architecture.p6" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.architecture.p7" k="docs.architecture.p7" />,
            <T key="docs.architecture.p8" k="docs.architecture.p8" />,
            <T key="docs.architecture.p9" k="docs.architecture.p9" />,
          ]}
        />
        <DocP>
          <T k="docs.architecture.p10" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p11" />
        </DocP>
      </DocSection>

      <DocSection id="download" title={<T k="docs.architecture.a16" />}>
        <DocP>
          <T k="docs.architecture.p13" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p14" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p15" />
        </DocP>
      </DocSection>

      <DocSection id="api" title={<T k="docs.architecture.a19" />}>
        <DocP>
          <T k="docs.architecture.p17" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p18" />
        </DocP>
      </DocSection>

      <DocSection id="staging" title={<T k="docs.architecture.a26" />}>
        <DocP>
          <T k="docs.architecture.p20" />
        </DocP>
        <DocList
          items={[
            <T key="docs.architecture.p21" k="docs.architecture.p21" />,
            <T key="docs.architecture.p22" k="docs.architecture.p22" />,
            <T key="docs.architecture.p23" k="docs.architecture.p23" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.architecture.a25" />}>
          <T
            k="docs.architecture.p24"
            links={{ l1: "/docs/desktop-app" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="adapters" title={<T k="docs.architecture.a31" />}>
        <DocP>
          <T k="docs.architecture.p27" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p28" />
        </DocP>
        <DocNote type="info" title={<T k="docs.architecture.a30" />}>
          <T
            k="docs.architecture.p29"
            links={{ l1: "/docs/obfuscation" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="index" title={<T k="docs.architecture.a33" />}>
        <DocP>
          <T k="docs.architecture.p32" />
        </DocP>
      </DocSection>

      <DocSection id="spaces" title={<T k="docs.architecture.a37" />}>
        <DocP>
          <T k="docs.architecture.p34" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p35" />
        </DocP>
        <DocP>
          <T k="docs.architecture.p36" />
        </DocP>
      </DocSection>

      <DocSection id="boundary" title={<T k="docs.architecture.a44" />}>
        <DocP>
          <T k="docs.architecture.p38" />
        </DocP>
        <DocList
          items={[
            <T key="docs.architecture.p39" k="docs.architecture.p39" />,
            <T key="docs.architecture.p40" k="docs.architecture.p40" />,
            <T key="docs.architecture.p41" k="docs.architecture.p41" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.architecture.a43" />}>
          <T
            k="docs.architecture.p42"
            links={{ l1: "/docs/zero-knowledge" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.architecture.a49" />}>
        <DocList
          items={[
            <T
              key="docs.architecture.p45"
              k="docs.architecture.p45"
              links={{ l1: "/docs/how-it-works" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.architecture.p46"
              k="docs.architecture.p46"
              links={{ l1: "/docs/repo-pool" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.architecture.p47"
              k="docs.architecture.p47"
              links={{ l1: "/docs/api" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.architecture.p48"
              k="docs.architecture.p48"
              links={{ l1: "/docs/self-hosting" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
