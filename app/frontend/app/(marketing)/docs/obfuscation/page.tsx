import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocCode, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Storage obfuscation · Docs",
  description:
    "Encryption hides file contents; obfuscation hides that there is anything interesting to look at. zcrypt stores chunks under random hex .bin names in repos with plausible dev-project names, rotating commit messages, and a generic build-artifacts README.",
  path: "/docs/obfuscation",
  ogDescription:
    "How zcrypt makes its storage repositories look like unremarkable build-cache projects: a second layer beneath the encryption.",
});

const toc = [
  { id: "why", k: "docs.obfuscation.toc.why" },
  { id: "filenames", k: "docs.obfuscation.toc.filenames" },
  { id: "repos", k: "docs.obfuscation.toc.repos" },
  { id: "scope", k: "docs.obfuscation.toc.scope" },
  { id: "limits", k: "docs.obfuscation.toc.limits" },
  { id: "next", k: "docs.obfuscation.toc.next" },
];

export default function ObfuscationPage() {
  return (
    <DocPage
      href="/docs/obfuscation"
      title="Storage obfuscation"
      description="Strong encryption already protects your file contents. Obfuscation is the layer on top that keeps your storage from advertising itself, so the repositories holding your data read as ordinary developer projects."
      toc={toc}
    >
      <DocSection id="why" title={<T k="docs.obfuscation.a4" />}>
        <DocP>
          <T k="docs.obfuscation.p1" />
        </DocP>
        <DocNote type="info" title={<T k="docs.obfuscation.a3" />}>
          <T
            k="docs.obfuscation.p2"
            links={{ l1: "/docs/security" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="filenames" title={<T k="docs.obfuscation.a9" />}>
        <DocP>
          <T k="docs.obfuscation.p5" />
        </DocP>
        <DocCode label={<T k="docs.obfuscation.a7" />}>{`a3f9c1e8b2740d56.bin
7d10e4ab9c3f8821.bin
0b5e2f7a16c94d3e.bin`}</DocCode>
        <DocP>
          <T k="docs.obfuscation.p8" />
        </DocP>
      </DocSection>

      <DocSection id="repos" title={<T k="docs.obfuscation.a16" />}>
        <DocP>
          <T k="docs.obfuscation.p10" />
        </DocP>
        <DocList
          items={[
            <T key="docs.obfuscation.p11" k="docs.obfuscation.p11" />,
            <T key="docs.obfuscation.p12" k="docs.obfuscation.p12" />,
            <T key="docs.obfuscation.p13" k="docs.obfuscation.p13" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.obfuscation.a15" />}>
          <T k="docs.obfuscation.p14" />
        </DocNote>
      </DocSection>

      <DocSection id="scope" title={<T k="docs.obfuscation.a22" />}>
        <DocP>
          <T k="docs.obfuscation.p17" />
        </DocP>
        <DocList
          items={[
            <T key="docs.obfuscation.p18" k="docs.obfuscation.p18" />,
            <T key="docs.obfuscation.p19" k="docs.obfuscation.p19" />,
            <T key="docs.obfuscation.p20" k="docs.obfuscation.p20" />,
          ]}
        />
        <DocP>
          <T
            k="docs.obfuscation.p21"
            links={{ l1: "/docs/zero-knowledge" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="limits" title={<T k="docs.obfuscation.a28" />}>
        <DocList
          items={[
            <T key="docs.obfuscation.p23" k="docs.obfuscation.p23" />,
            <T key="docs.obfuscation.p24" k="docs.obfuscation.p24" />,
            <T key="docs.obfuscation.p25" k="docs.obfuscation.p25" />,
          ]}
        />
        <DocNote type="warning" title={<T k="docs.obfuscation.a27" />}>
          <T k="docs.obfuscation.p26" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.obfuscation.a32" />}>
        <DocList
          items={[
            <T
              key="docs.obfuscation.p29"
              k="docs.obfuscation.p29"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.obfuscation.p30"
              k="docs.obfuscation.p30"
              links={{ l1: "/docs/threat-model" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.obfuscation.p31"
              k="docs.obfuscation.p31"
              links={{ l1: "/docs/security" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
