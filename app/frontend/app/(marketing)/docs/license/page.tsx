import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "License · Docs",
  description:
    "zcrypt is MIT-licensed: free to use, modify, and distribute, including commercially, with no warranty. Read the full license text on GitHub.",
  path: "/docs/license",
  ogDescription:
    "zcrypt is MIT-licensed: free to use, modify, and distribute, including commercially, with no warranty.",
});

const toc = [
  { id: "overview", k: "docs.license.toc.overview" },
  { id: "permits", k: "docs.license.toc.permits" },
  { id: "warranty", k: "docs.license.toc.warranty" },
  { id: "text", k: "docs.license.toc.text" },
];

export default function LicenseDocPage() {
  return (
    <DocPage
      href="/docs/license"
      title="License"
      description="zcrypt is open source under the MIT License: one of the most permissive licenses there is."
      toc={toc}
    >
      <DocSection id="overview" title={<T k="docs.license.a2" />}>
        <DocP>
          <T k="docs.license.p1" />
        </DocP>
      </DocSection>

      <DocSection id="permits" title={<T k="docs.license.a9" />}>
        <DocP>
          <T k="docs.license.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.license.p4" k="docs.license.p4" />,
            <T key="docs.license.p5" k="docs.license.p5" />,
            <T key="docs.license.p6" k="docs.license.p6" />,
            <T key="docs.license.p7" k="docs.license.p7" />,
          ]}
        />
        <DocP>
          <T k="docs.license.p8" />
        </DocP>
      </DocSection>

      <DocSection id="warranty" title={<T k="docs.license.a12" />}>
        <DocNote type="info" title={<T k="docs.license.a11" />}>
          <T k="docs.license.p10" />
        </DocNote>
      </DocSection>

      <DocSection id="text" title={<T k="docs.license.a14" />}>
        <DocP>
          <T
            k="docs.license.p13"
            links={{ l1: "https://github.com/Wosmos/zcrypt/blob/main/LICENSE" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
