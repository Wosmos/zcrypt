import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Threat model · Docs",
  description:
    "An honest account of what zcrypt defends against (server breaches, storage-provider access, MITM, insider access, metadata leakage) and what it cannot protect: a compromised device, a weak passphrase, and frontend supply-chain risk.",
  path: "/docs/threat-model",
  ogDescription:
    "What zcrypt protects against and what it does not: stated plainly, with the reasoning and the mitigations for each gap.",
});

const toc = [
  { id: "protected", k: "docs.threat-model.toc.protected" },
  { id: "not-protected", k: "docs.threat-model.toc.not-protected" },
  { id: "matrix", k: "docs.threat-model.toc.matrix" },
  { id: "guidance", k: "docs.threat-model.toc.guidance" },
  { id: "next", k: "docs.threat-model.toc.next" },
];

export default function ThreatModelPage() {
  return (
    <DocPage
      href="/docs/threat-model"
      title="Threat model"
      description="A security tool is only as honest as its threat model. Here is what zcrypt is designed to stop, what it cannot, and why, so you can decide whether it fits your situation rather than taking a slogan on faith."
      toc={toc}
    >
      <DocSection id="protected" title={<T k="docs.threat-model.a7" />}>
        <DocP>
          <T k="docs.threat-model.p1" />
        </DocP>
        <DocList
          items={[
            <T key="docs.threat-model.p2" k="docs.threat-model.p2" />,
            <T key="docs.threat-model.p3" k="docs.threat-model.p3" />,
            <T key="docs.threat-model.p4" k="docs.threat-model.p4" />,
            <T key="docs.threat-model.p5" k="docs.threat-model.p5" />,
            <T
              key="docs.threat-model.p6"
              k="docs.threat-model.p6"
              links={{ l1: "/docs/obfuscation" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>

      <DocSection id="not-protected" title={<T k="docs.threat-model.a15" />}>
        <DocP>
          <T k="docs.threat-model.p8" />
        </DocP>
        <DocList
          items={[
            <T key="docs.threat-model.p9" k="docs.threat-model.p9" />,
            <T key="docs.threat-model.p10" k="docs.threat-model.p10" />,
            <T key="docs.threat-model.p11" k="docs.threat-model.p11" />,
            <T key="docs.threat-model.p12" k="docs.threat-model.p12" />,
          ]}
        />
        <DocNote type="warning" title={<T k="docs.threat-model.a14" />}>
          <T k="docs.threat-model.p13" />
        </DocNote>
      </DocSection>

      <DocSection id="matrix" title={<T k="docs.threat-model.a53" />}>
        <DocTable
          head={[
            <T key="docs.threat-model.p16" k="docs.threat-model.p16" />,
            <T key="docs.threat-model.p17" k="docs.threat-model.p17" />,
            <T key="docs.threat-model.p18" k="docs.threat-model.p18" />,
          ]}
          rows={[
            [
              <T key="docs.threat-model.p19" k="docs.threat-model.p19" />,
              <T key="docs.threat-model.p20" k="docs.threat-model.p20" />,
              <T key="docs.threat-model.p21" k="docs.threat-model.p21" />,
            ],
            [
              <T key="docs.threat-model.p22" k="docs.threat-model.p22" />,
              <T key="docs.threat-model.p23" k="docs.threat-model.p23" />,
              <T key="docs.threat-model.p24" k="docs.threat-model.p24" />,
            ],
            [
              <T key="docs.threat-model.p25" k="docs.threat-model.p25" />,
              <T key="docs.threat-model.p26" k="docs.threat-model.p26" />,
              <T key="docs.threat-model.p27" k="docs.threat-model.p27" />,
            ],
            [
              <T key="docs.threat-model.p28" k="docs.threat-model.p28" />,
              <T key="docs.threat-model.p29" k="docs.threat-model.p29" />,
              <T key="docs.threat-model.p30" k="docs.threat-model.p30" />,
            ],
            [
              <T key="docs.threat-model.p31" k="docs.threat-model.p31" />,
              <T key="docs.threat-model.p32" k="docs.threat-model.p32" />,
              <T key="docs.threat-model.p33" k="docs.threat-model.p33" />,
            ],
            [
              <T key="docs.threat-model.p34" k="docs.threat-model.p34" />,
              <T key="docs.threat-model.p35" k="docs.threat-model.p35" />,
              <T key="docs.threat-model.p36" k="docs.threat-model.p36" />,
            ],
            [
              <T key="docs.threat-model.p37" k="docs.threat-model.p37" />,
              <T key="docs.threat-model.p38" k="docs.threat-model.p38" />,
              <T key="docs.threat-model.p39" k="docs.threat-model.p39" />,
            ],
            [
              <T key="docs.threat-model.p40" k="docs.threat-model.p40" />,
              <T key="docs.threat-model.p41" k="docs.threat-model.p41" />,
              <T key="docs.threat-model.p42" k="docs.threat-model.p42" />,
            ],
            [
              <T key="docs.threat-model.p43" k="docs.threat-model.p43" />,
              <T key="docs.threat-model.p44" k="docs.threat-model.p44" />,
              <T key="docs.threat-model.p45" k="docs.threat-model.p45" />,
            ],
            [
              <T key="docs.threat-model.p46" k="docs.threat-model.p46" />,
              <T key="docs.threat-model.p47" k="docs.threat-model.p47" />,
              <T key="docs.threat-model.p48" k="docs.threat-model.p48" />,
            ],
            [
              <T key="docs.threat-model.p49" k="docs.threat-model.p49" />,
              <T key="docs.threat-model.p50" k="docs.threat-model.p50" />,
              <T key="docs.threat-model.p51" k="docs.threat-model.p51" />,
            ],
          ]}
        />
        <DocP>
          <T
            k="docs.threat-model.p52"
            links={{ l1: "/docs/zero-knowledge" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="guidance" title={<T k="docs.threat-model.a59" />}>
        <DocList
          items={[
            <T key="docs.threat-model.p54" k="docs.threat-model.p54" />,
            <T
              key="docs.threat-model.p55"
              k="docs.threat-model.p55"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.threat-model.p56" k="docs.threat-model.p56" />,
            <T key="docs.threat-model.p57" k="docs.threat-model.p57" />,
            <T
              key="docs.threat-model.p58"
              k="docs.threat-model.p58"
              links={{ l1: "/docs/folder-encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.threat-model.a63" />}>
        <DocList
          items={[
            <T
              key="docs.threat-model.p60"
              k="docs.threat-model.p60"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.threat-model.p61"
              k="docs.threat-model.p61"
              links={{ l1: "/docs/obfuscation" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.threat-model.p62"
              k="docs.threat-model.p62"
              links={{ l1: "/docs/security" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
