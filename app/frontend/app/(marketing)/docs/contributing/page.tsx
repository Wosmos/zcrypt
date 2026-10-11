import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocCode, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Contributing | zcrypt Docs",
  description:
    "How to build zcrypt locally, the coding conventions, the pre-push quality gate, and how to open a pull request.",
  alternates: { canonical: `${SITE_URL}/docs/contributing` },
  openGraph: {
    title: "Contributing | zcrypt Docs",
    description:
      "How to build zcrypt locally, the coding conventions, the pre-push quality gate, and how to open a pull request.",
    url: `${SITE_URL}/docs/contributing`,
  },
};

const toc = [
  { id: "overview", k: "docs.contributing.toc.overview" },
  { id: "prerequisites", k: "docs.contributing.toc.prerequisites" },
  { id: "setup", k: "docs.contributing.toc.setup" },
  { id: "env", k: "docs.contributing.toc.env" },
  { id: "conventions", k: "docs.contributing.toc.conventions" },
  { id: "gate", k: "docs.contributing.toc.gate" },
  { id: "pr", k: "docs.contributing.toc.pr" },
  { id: "license", k: "docs.contributing.toc.license" },
];

export default function ContributingDocPage() {
  return (
    <DocPage
      href="/docs/contributing"
      title="Contributing"
      description="How to set up zcrypt locally, the conventions the project follows, and how to submit a change."
      toc={toc}
    >
      <DocSection id="overview" title={<T k="docs.contributing.a2" />}>
        <DocP>
          <T
            k="docs.contributing.p1"
            links={{ l1: "https://github.com/Wosmos/zcrypt/blob/main/CONTRIBUTING.md" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="prerequisites" title={<T k="docs.contributing.a7" />}>
        <DocList
          items={[
            <T key="docs.contributing.p3" k="docs.contributing.p3" />,
            <T key="docs.contributing.p4" k="docs.contributing.p4" />,
            <T
              key="docs.contributing.p5"
              k="docs.contributing.p5"
              links={{ l1: "https://neon.tech" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.contributing.p6" k="docs.contributing.p6" />,
          ]}
        />
      </DocSection>

      <DocSection id="setup" title={<T k="docs.contributing.a14" />}>
        <DocP>
          <T k="docs.contributing.p8" />
        </DocP>
        <DocCode label={<T k="docs.contributing.a10" />}>{`cd app/backend

# Create your own environment file from the template, then fill in real values.
cp .env.example .env
# At minimum set DATABASE_URL, MASTER_KEY, and ZCRYPT_JWT_SECRET.
# Generate keys with: openssl rand -hex 32

go build -o zcrypt-server .
go test ./...
go vet ./...

./zcrypt-server`}</DocCode>
        <DocP>
          <T k="docs.contributing.p11" />
        </DocP>
        <DocCode label={<T k="docs.contributing.a13" />}>{`cd app/frontend

bun install
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

bun run dev        # dev server
bun run build      # production build
bun run lint       # lint
bun run typecheck  # type check`}</DocCode>
      </DocSection>

      <DocSection id="env" title={<T k="docs.contributing.a16" />}>
        <DocP>
          <T k="docs.contributing.p15" />
        </DocP>
      </DocSection>

      <DocSection id="conventions" title={<T k="docs.contributing.a20" />}>
        <DocList
          items={[
            <T key="docs.contributing.p17" k="docs.contributing.p17" />,
            <T key="docs.contributing.p18" k="docs.contributing.p18" />,
            <T key="docs.contributing.p19" k="docs.contributing.p19" />,
          ]}
        />
      </DocSection>

      <DocSection id="gate" title={<T k="docs.contributing.a26" />}>
        <DocP>
          <T k="docs.contributing.p21" />
        </DocP>
        <DocCode
          label={<T k="docs.contributing.a23" />}
        >{`bash scripts/install-hooks.sh          # once per clone, wires the pre-push hook
bash scripts/prepush.sh --gates-only   # fast: gates only
bash scripts/prepush.sh                # full: gates + advisory backlog scans -> docs/report.md`}</DocCode>
        <DocNote type="info" title={<T k="docs.contributing.a25" />}>
          <T k="docs.contributing.p24" />
        </DocNote>
      </DocSection>

      <DocSection id="pr" title={<T k="docs.contributing.a32" />}>
        <DocList
          items={[
            <T key="docs.contributing.p27" k="docs.contributing.p27" />,
            <T key="docs.contributing.p28" k="docs.contributing.p28" />,
            <T key="docs.contributing.p29" k="docs.contributing.p29" />,
            <T key="docs.contributing.p30" k="docs.contributing.p30" />,
            <T key="docs.contributing.p31" k="docs.contributing.p31" />,
          ]}
        />
      </DocSection>

      <DocSection id="license" title={<T k="docs.contributing.a35" />}>
        <DocP>
          <T
            k="docs.contributing.p33"
            links={{ l1: "/docs/license" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocP>
          <T
            k="docs.contributing.p34"
            links={{ l1: "https://github.com/Wosmos/zcrypt" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
