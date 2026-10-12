import { pageMetadata } from "@/lib/page-metadata";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Repo pool & rotation · Docs",
  description:
    "How zcrypt grows your storage across many repositories automatically: an active repo per account, a size threshold, and a disguised new repo created the moment one fills up.",
  path: "/docs/repo-pool",
  ogDescription:
    "How zcrypt grows your storage across many repositories automatically, with per-repo usage tracking and transparent rotation.",
});

const toc = [
  { id: "why", k: "docs.repo-pool.toc.why" },
  { id: "rotation", k: "docs.repo-pool.toc.rotation" },
  { id: "thresholds", k: "docs.repo-pool.toc.thresholds" },
  { id: "throttling", k: "docs.repo-pool.toc.throttling" },
  { id: "tracking", k: "docs.repo-pool.toc.tracking" },
  { id: "durability", k: "docs.repo-pool.toc.durability" },
  { id: "next", k: "docs.repo-pool.toc.next" },
];

export default function RepoPoolDocPage() {
  return (
    <DocPage
      href="/docs/repo-pool"
      title="Repo pool & rotation"
      description="A single repository on any platform fills up. zcrypt sidesteps that by treating your storage as a pool of repositories that grows on demand, so your usable space climbs transparently while you just keep uploading."
      toc={toc}
    >
      <DocSection id="why" title={<T k="docs.repo-pool.a3" />}>
        <DocP>
          <T k="docs.repo-pool.p1" />
        </DocP>
        <DocP>
          <T k="docs.repo-pool.p2" />
        </DocP>
      </DocSection>

      <DocSection id="rotation" title={<T k="docs.repo-pool.a12" />}>
        <DocP>
          <T k="docs.repo-pool.p4" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.repo-pool.p5" k="docs.repo-pool.p5" />,
            <T key="docs.repo-pool.p6" k="docs.repo-pool.p6" />,
            <T key="docs.repo-pool.p7" k="docs.repo-pool.p7" />,
            <T key="docs.repo-pool.p8" k="docs.repo-pool.p8" />,
          ]}
        />
        <DocP>
          <T k="docs.repo-pool.p9" />
        </DocP>
        <DocNote type="info" title={<T k="docs.repo-pool.a11" />}>
          <T k="docs.repo-pool.p10" />
        </DocNote>
      </DocSection>

      <DocSection id="thresholds" title={<T k="docs.repo-pool.a26" />}>
        <DocP>
          <T k="docs.repo-pool.p13" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.repo-pool.p14" k="docs.repo-pool.p14" />,
            <T key="docs.repo-pool.p15" k="docs.repo-pool.p15" />,
          ]}
          rows={[
            [
              <T key="docs.repo-pool.p16" k="docs.repo-pool.p16" />,
              <T key="docs.repo-pool.p17" k="docs.repo-pool.p17" />,
            ],
            [
              <T key="docs.repo-pool.p18" k="docs.repo-pool.p18" />,
              <T key="docs.repo-pool.p19" k="docs.repo-pool.p19" />,
            ],
            [
              <T key="docs.repo-pool.p20" k="docs.repo-pool.p20" />,
              <T key="docs.repo-pool.p21" k="docs.repo-pool.p21" />,
            ],
            [
              <T key="docs.repo-pool.p22" k="docs.repo-pool.p22" />,
              <T key="docs.repo-pool.p23" k="docs.repo-pool.p23" />,
            ],
          ]}
        />
        <DocNote type="warning" title={<T k="docs.repo-pool.a25" />}>
          <T k="docs.repo-pool.p24" />
        </DocNote>
      </DocSection>

      <DocSection id="throttling" title={<T k="docs.repo-pool.a32" />}>
        <DocP>
          <T k="docs.repo-pool.p27" />
        </DocP>
        <DocP>
          <T k="docs.repo-pool.p28" />
        </DocP>
        <DocList
          items={[
            <T key="docs.repo-pool.p29" k="docs.repo-pool.p29" />,
            <T key="docs.repo-pool.p30" k="docs.repo-pool.p30" />,
            <T key="docs.repo-pool.p31" k="docs.repo-pool.p31" />,
          ]}
        />
      </DocSection>

      <DocSection id="tracking" title={<T k="docs.repo-pool.a34" />}>
        <DocP>
          <T k="docs.repo-pool.p33" />
        </DocP>
      </DocSection>

      <DocSection id="durability" title={<T k="docs.repo-pool.a41" />}>
        <DocSubsection title={<T k="docs.repo-pool.a37" />}>
          <DocP>
            <T k="docs.repo-pool.p35" />
          </DocP>
          <DocP>
            <T k="docs.repo-pool.p36" />
          </DocP>
        </DocSubsection>
        <DocSubsection title={<T k="docs.repo-pool.a40" />}>
          <DocP>
            <T k="docs.repo-pool.p38" />
          </DocP>
          <DocP>
            <T k="docs.repo-pool.p39" />
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="next" title={<T k="docs.repo-pool.a45" />}>
        <DocList
          items={[
            <T
              key="docs.repo-pool.p42"
              k="docs.repo-pool.p42"
              links={{ l1: "/docs/platform-adapters" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.repo-pool.p43"
              k="docs.repo-pool.p43"
              links={{ l1: "/docs/obfuscation" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.repo-pool.p44"
              k="docs.repo-pool.p44"
              links={{ l1: "/docs/uploading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
