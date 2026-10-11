import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Snapshots & integrity | zcrypt Docs",
  description:
    "Two zcrypt tools for keeping tabs on your vault: snapshots capture a point-in-time manifest of your file list, and the integrity monitor records each file's SHA-256 and size to flag when a file's hash changes. Both are in beta.",
  alternates: { canonical: `${SITE_URL}/docs/snapshots-integrity` },
  openGraph: {
    title: "Snapshots & integrity | zcrypt Docs",
    description:
      "Point-in-time file-list manifests and SHA-256 tamper detection: maturing features, not a version-history or rollback system.",
    url: `${SITE_URL}/docs/snapshots-integrity`,
  },
};

const toc = [
  { id: "snapshots", k: "docs.snapshots-integrity.toc.snapshots" },
  { id: "snapshots-not", k: "docs.snapshots-integrity.toc.snapshots-not" },
  { id: "integrity", k: "docs.snapshots-integrity.toc.integrity" },
  { id: "maturity", k: "docs.snapshots-integrity.toc.maturity" },
  { id: "next", k: "docs.snapshots-integrity.toc.next" },
];

export default function SnapshotsIntegrityDocPage() {
  return (
    <DocPage
      href="/docs/snapshots-integrity"
      title="Snapshots & integrity"
      description="Lightweight tools for keeping an eye on the shape of your vault: a snapshot records what was in it at a moment in time, and the integrity monitor watches for files whose contents change unexpectedly."
      badge="Beta"
      toc={toc}
    >
      <DocSection id="snapshots" title={<T k="docs.snapshots-integrity.a2" />}>
        <DocP>
          <T k="docs.snapshots-integrity.p1" />
        </DocP>
      </DocSection>

      <DocSection id="snapshots-not" title={<T k="docs.snapshots-integrity.a5" />}>
        <DocNote type="warning" title={<T k="docs.snapshots-integrity.a4" />}>
          <T k="docs.snapshots-integrity.p3" />
        </DocNote>
      </DocSection>

      <DocSection id="integrity" title={<T k="docs.snapshots-integrity.a10" />}>
        <DocP>
          <T k="docs.snapshots-integrity.p6" />
        </DocP>
        <DocList
          items={[
            <T key="docs.snapshots-integrity.p7" k="docs.snapshots-integrity.p7" />,
            <T key="docs.snapshots-integrity.p8" k="docs.snapshots-integrity.p8" />,
            <T key="docs.snapshots-integrity.p9" k="docs.snapshots-integrity.p9" />,
          ]}
        />
      </DocSection>

      <DocSection id="maturity" title={<T k="docs.snapshots-integrity.a13" />}>
        <DocNote type="info" title={<T k="docs.snapshots-integrity.a12" />}>
          <T k="docs.snapshots-integrity.p11" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.snapshots-integrity.a17" />}>
        <DocList
          items={[
            <T
              key="docs.snapshots-integrity.p14"
              k="docs.snapshots-integrity.p14"
              links={{ l1: "/docs/timed-vaults" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.snapshots-integrity.p15"
              k="docs.snapshots-integrity.p15"
              links={{ l1: "/docs/downloading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.snapshots-integrity.p16"
              k="docs.snapshots-integrity.p16"
              links={{ l1: "/docs/shared-vaults" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
