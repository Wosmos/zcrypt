import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Timed vaults | zcrypt Docs",
  description:
    "A timed vault is a named group of files you have already uploaded, with a countdown attached. When the timer runs out the vault is flagged as expired and dimmed in the list, but nothing self-destructs: your files are not deleted. In beta.",
  alternates: { canonical: `${SITE_URL}/docs/timed-vaults` },
  openGraph: {
    title: "Timed vaults | zcrypt Docs",
    description:
      "Group already-uploaded files under a shared countdown. Expiry flags the vault. It does not delete your files.",
    url: `${SITE_URL}/docs/timed-vaults`,
  },
};

const toc = [
  { id: "what", k: "docs.timed-vaults.toc.what" },
  { id: "creating", k: "docs.timed-vaults.toc.creating" },
  { id: "countdown", k: "docs.timed-vaults.toc.countdown" },
  { id: "not", k: "docs.timed-vaults.toc.not" },
  { id: "deleting", k: "docs.timed-vaults.toc.deleting" },
  { id: "maturity", k: "docs.timed-vaults.toc.maturity" },
  { id: "next", k: "docs.timed-vaults.toc.next" },
];

export default function TimedVaultsDocPage() {
  return (
    <DocPage
      href="/docs/timed-vaults"
      title="Timed vaults"
      description="Group files you have already uploaded under a single named countdown. When the timer lapses the vault is flagged as expired and dimmed in the list, but nothing self-destructs, and your files stay exactly where they are."
      badge="Beta"
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.timed-vaults.a2" />}>
        <DocP>
          <T k="docs.timed-vaults.p1" />
        </DocP>
      </DocSection>

      <DocSection id="creating" title={<T k="docs.timed-vaults.a9" />}>
        <DocP>
          <T k="docs.timed-vaults.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.timed-vaults.p4" k="docs.timed-vaults.p4" />,
            <T key="docs.timed-vaults.p5" k="docs.timed-vaults.p5" />,
            <T key="docs.timed-vaults.p6" k="docs.timed-vaults.p6" />,
            <T key="docs.timed-vaults.p7" k="docs.timed-vaults.p7" />,
          ]}
        />
        <DocP>
          <T k="docs.timed-vaults.p8" />
        </DocP>
      </DocSection>

      <DocSection id="countdown" title={<T k="docs.timed-vaults.a11" />}>
        <DocP>
          <T k="docs.timed-vaults.p10" />
        </DocP>
      </DocSection>

      <DocSection id="not" title={<T k="docs.timed-vaults.a14" />}>
        <DocNote type="warning" title={<T k="docs.timed-vaults.a13" />}>
          <T k="docs.timed-vaults.p12" />
        </DocNote>
      </DocSection>

      <DocSection id="deleting" title={<T k="docs.timed-vaults.a16" />}>
        <DocP>
          <T k="docs.timed-vaults.p15" />
        </DocP>
      </DocSection>

      <DocSection id="maturity" title={<T k="docs.timed-vaults.a19" />}>
        <DocNote type="info" title={<T k="docs.timed-vaults.a18" />}>
          <T k="docs.timed-vaults.p17" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.timed-vaults.a23" />}>
        <DocList
          items={[
            <T
              key="docs.timed-vaults.p20"
              k="docs.timed-vaults.p20"
              links={{ l1: "/docs/snapshots-integrity" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.timed-vaults.p21"
              k="docs.timed-vaults.p21"
              links={{ l1: "/docs/shared-vaults" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.timed-vaults.p22"
              k="docs.timed-vaults.p22"
              links={{ l1: "/docs/uploading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
