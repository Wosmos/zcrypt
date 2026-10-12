import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Zero-knowledge architecture · Docs",
  description:
    "What zcrypt can and cannot see. An honest, line-by-line account of what the server stores: encrypted file contents, encrypted folder names, file metadata, a registry of public keys for sharing, and the single non-zero-knowledge surface: your storage-provider tokens.",
  path: "/docs/zero-knowledge",
  ogDescription:
    "Exactly what the zcrypt server stores and what it can never read: including how sharing stays zero-knowledge and the one honest exception involving storage-provider tokens.",
});

const toc = [
  { id: "meaning", k: "docs.zero-knowledge.toc.meaning" },
  { id: "stored", k: "docs.zero-knowledge.toc.stored" },
  { id: "never", k: "docs.zero-knowledge.toc.never" },
  { id: "sharing", k: "docs.zero-knowledge.toc.sharing" },
  { id: "names", k: "docs.zero-knowledge.toc.names" },
  { id: "tokens", k: "docs.zero-knowledge.toc.tokens" },
  { id: "next", k: "docs.zero-knowledge.toc.next" },
];

export default function ZeroKnowledgePage() {
  return (
    <DocPage
      href="/docs/zero-knowledge"
      title="Zero-knowledge architecture"
      description="Zero-knowledge is a strong claim, so we state it precisely. zcrypt cannot read your file contents or your folder names, and we are equally clear about the metadata it does keep and the single surface that is not zero-knowledge."
      toc={toc}
    >
      <DocSection id="meaning" title={<T k="docs.zero-knowledge.a3" />}>
        <DocP>
          <T k="docs.zero-knowledge.p1" />
        </DocP>
        <DocP>
          <T k="docs.zero-knowledge.p2" />
        </DocP>
      </DocSection>

      <DocSection id="stored" title={<T k="docs.zero-knowledge.a40" />}>
        <DocP>
          <T k="docs.zero-knowledge.p4" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.zero-knowledge.p5" k="docs.zero-knowledge.p5" />,
            <T key="docs.zero-knowledge.p6" k="docs.zero-knowledge.p6" />,
            <T key="docs.zero-knowledge.p7" k="docs.zero-knowledge.p7" />,
          ]}
          rows={[
            [
              <T key="docs.zero-knowledge.p8" k="docs.zero-knowledge.p8" />,
              <T key="docs.zero-knowledge.p9" k="docs.zero-knowledge.p9" />,
              <T key="docs.zero-knowledge.p10" k="docs.zero-knowledge.p10" />,
            ],
            [
              <T key="docs.zero-knowledge.p11" k="docs.zero-knowledge.p11" />,
              <T key="docs.zero-knowledge.p12" k="docs.zero-knowledge.p12" />,
              <T key="docs.zero-knowledge.p13" k="docs.zero-knowledge.p13" />,
            ],
            [
              <T key="docs.zero-knowledge.p14" k="docs.zero-knowledge.p14" />,
              <T key="docs.zero-knowledge.p15" k="docs.zero-knowledge.p15" />,
              <T key="docs.zero-knowledge.p16" k="docs.zero-knowledge.p16" />,
            ],
            [
              <T key="docs.zero-knowledge.p17" k="docs.zero-knowledge.p17" />,
              <T key="docs.zero-knowledge.p18" k="docs.zero-knowledge.p18" />,
              <T key="docs.zero-knowledge.p19" k="docs.zero-knowledge.p19" />,
            ],
            [
              <T key="docs.zero-knowledge.p20" k="docs.zero-knowledge.p20" />,
              <T key="docs.zero-knowledge.p21" k="docs.zero-knowledge.p21" />,
              <T key="docs.zero-knowledge.p22" k="docs.zero-knowledge.p22" />,
            ],
            [
              <T key="docs.zero-knowledge.p23" k="docs.zero-knowledge.p23" />,
              <T key="docs.zero-knowledge.p24" k="docs.zero-knowledge.p24" />,
              <T key="docs.zero-knowledge.p25" k="docs.zero-knowledge.p25" />,
            ],
            [
              <T key="docs.zero-knowledge.p26" k="docs.zero-knowledge.p26" />,
              <T key="docs.zero-knowledge.p27" k="docs.zero-knowledge.p27" />,
              <T key="docs.zero-knowledge.p28" k="docs.zero-knowledge.p28" />,
            ],
            [
              <T key="docs.zero-knowledge.p29" k="docs.zero-knowledge.p29" />,
              <T key="docs.zero-knowledge.p30" k="docs.zero-knowledge.p30" />,
              <T key="docs.zero-knowledge.p31" k="docs.zero-knowledge.p31" />,
            ],
            [
              <T key="docs.zero-knowledge.p32" k="docs.zero-knowledge.p32" />,
              <T key="docs.zero-knowledge.p33" k="docs.zero-knowledge.p33" />,
              <T key="docs.zero-knowledge.p34" k="docs.zero-knowledge.p34" />,
            ],
            [
              <T key="docs.zero-knowledge.p35" k="docs.zero-knowledge.p35" />,
              <T key="docs.zero-knowledge.p36" k="docs.zero-knowledge.p36" />,
              <T key="docs.zero-knowledge.p37" k="docs.zero-knowledge.p37" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.zero-knowledge.a39" />}>
          <T k="docs.zero-knowledge.p38" />
        </DocNote>
      </DocSection>

      <DocSection id="never" title={<T k="docs.zero-knowledge.a50" />}>
        <DocList
          items={[
            <T key="docs.zero-knowledge.p41" k="docs.zero-knowledge.p41" />,
            <T key="docs.zero-knowledge.p42" k="docs.zero-knowledge.p42" />,
            <T key="docs.zero-knowledge.p43" k="docs.zero-knowledge.p43" />,
            <T key="docs.zero-knowledge.p44" k="docs.zero-knowledge.p44" />,
            <T key="docs.zero-knowledge.p45" k="docs.zero-knowledge.p45" />,
            <T
              key="docs.zero-knowledge.p46"
              k="docs.zero-knowledge.p46"
              links={{ l1: "#sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.zero-knowledge.p47"
              k="docs.zero-knowledge.p47"
              links={{ l1: "/docs/folder-encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.zero-knowledge.a49" />}>
          <T k="docs.zero-knowledge.p48" />
        </DocNote>
      </DocSection>

      <DocSection id="sharing" title={<T k="docs.zero-knowledge.a57" />}>
        <DocP>
          <T
            k="docs.zero-knowledge.p51"
            links={{ l1: "/docs/shared-vaults" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocList
          items={[
            <T key="docs.zero-knowledge.p52" k="docs.zero-knowledge.p52" />,
            <T key="docs.zero-knowledge.p53" k="docs.zero-knowledge.p53" />,
            <T key="docs.zero-knowledge.p54" k="docs.zero-knowledge.p54" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.zero-knowledge.a56" />}>
          <T
            k="docs.zero-knowledge.p55"
            links={{ l1: "/docs/security" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="names" title={<T k="docs.zero-knowledge.a64" />}>
        <DocP>
          <T k="docs.zero-knowledge.p58" />
        </DocP>
        <DocList
          items={[
            <T key="docs.zero-knowledge.p59" k="docs.zero-knowledge.p59" />,
            <T key="docs.zero-knowledge.p60" k="docs.zero-knowledge.p60" />,
            <T key="docs.zero-knowledge.p61" k="docs.zero-knowledge.p61" />,
          ]}
        />
        <DocP>
          <T k="docs.zero-knowledge.p77" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.zero-knowledge.a63" />}>
          <T k="docs.zero-knowledge.p62" />
        </DocNote>
      </DocSection>

      <DocSection id="tokens" title={<T k="docs.zero-knowledge.a71" />}>
        <DocP>
          <T k="docs.zero-knowledge.p65" />
        </DocP>
        <DocList
          items={[
            <T key="docs.zero-knowledge.p66" k="docs.zero-knowledge.p66" />,
            <T key="docs.zero-knowledge.p67" k="docs.zero-knowledge.p67" />,
            <T key="docs.zero-knowledge.p68" k="docs.zero-knowledge.p68" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.zero-knowledge.a70" />}>
          <T
            k="docs.zero-knowledge.p69"
            links={{ l1: "/docs/threat-model" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.zero-knowledge.a76" />}>
        <DocList
          items={[
            <T
              key="docs.zero-knowledge.p72"
              k="docs.zero-knowledge.p72"
              links={{ l1: "/docs/security" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.zero-knowledge.p73"
              k="docs.zero-knowledge.p73"
              links={{ l1: "/docs/obfuscation" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.zero-knowledge.p74"
              k="docs.zero-knowledge.p74"
              links={{ l1: "/docs/threat-model" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.zero-knowledge.p75"
              k="docs.zero-knowledge.p75"
              links={{ l1: "/features/encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
