import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocTable } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Glossary | zcrypt Docs",
  description:
    "Plain-language definitions of the terms used across zcrypt: vault, passphrase, CEK, envelope encryption, chunk, salt, KEK, zero-knowledge, BYOB, repo pool, decoy vault, dead man's switch, TOTP, and zstd.",
  alternates: { canonical: `${SITE_URL}/docs/glossary` },
  openGraph: {
    title: "Glossary | zcrypt Docs",
    description:
      "Every zcrypt term, defined: vault, passphrase, CEK, envelope encryption, chunk, salt, KEK, zero-knowledge, BYOB, and more.",
    url: `${SITE_URL}/docs/glossary`,
  },
};

const toc = [
  { id: "terms", k: "docs.glossary.toc.terms" },
  { id: "next", k: "docs.glossary.toc.next" },
];

export default function GlossaryDocPage() {
  return (
    <DocPage
      href="/docs/glossary"
      title="Glossary"
      description="The vocabulary used throughout zcrypt and these docs, defined in one place."
      toc={toc}
    >
      <DocSection id="terms" title={<T k="docs.glossary.a32" />}>
        <DocP>
          <T k="docs.glossary.p1" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.glossary.p2" k="docs.glossary.p2" />,
            <T key="docs.glossary.p3" k="docs.glossary.p3" />,
          ]}
          rows={[
            [
              <T key="docs.glossary.p4" k="docs.glossary.p4" />,
              <T key="docs.glossary.p5" k="docs.glossary.p5" />,
            ],
            [
              <T key="docs.glossary.p6" k="docs.glossary.p6" />,
              <T key="docs.glossary.p7" k="docs.glossary.p7" />,
            ],
            [
              <T key="docs.glossary.p8" k="docs.glossary.p8" />,
              <T key="docs.glossary.p9" k="docs.glossary.p9" />,
            ],
            [
              <T key="docs.glossary.p10" k="docs.glossary.p10" />,
              <T key="docs.glossary.p11" k="docs.glossary.p11" />,
            ],
            [
              <T key="docs.glossary.p12" k="docs.glossary.p12" />,
              <T key="docs.glossary.p13" k="docs.glossary.p13" />,
            ],
            [
              <T key="docs.glossary.p14" k="docs.glossary.p14" />,
              <T key="docs.glossary.p15" k="docs.glossary.p15" />,
            ],
            [
              <T key="docs.glossary.p16" k="docs.glossary.p16" />,
              <T key="docs.glossary.p17" k="docs.glossary.p17" />,
            ],
            [
              <T key="docs.glossary.p18" k="docs.glossary.p18" />,
              <T key="docs.glossary.p19" k="docs.glossary.p19" />,
            ],
            [
              <T key="docs.glossary.p20" k="docs.glossary.p20" />,
              <T key="docs.glossary.p21" k="docs.glossary.p21" />,
            ],
            [
              <T key="docs.glossary.p22" k="docs.glossary.p22" />,
              <T key="docs.glossary.p23" k="docs.glossary.p23" />,
            ],
            [
              <T key="docs.glossary.p24" k="docs.glossary.p24" />,
              <T key="docs.glossary.p25" k="docs.glossary.p25" />,
            ],
            [
              <T key="docs.glossary.p26" k="docs.glossary.p26" />,
              <T key="docs.glossary.p27" k="docs.glossary.p27" />,
            ],
            [
              <T key="docs.glossary.p28" k="docs.glossary.p28" />,
              <T key="docs.glossary.p29" k="docs.glossary.p29" />,
            ],
            [
              <T key="docs.glossary.p30" k="docs.glossary.p30" />,
              <T key="docs.glossary.p31" k="docs.glossary.p31" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.glossary.a34" />}>
        <DocP>
          <T
            k="docs.glossary.p33"
            links={{ l1: "/docs/security", l2: "/docs/zero-knowledge", l3: "/docs/architecture" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
