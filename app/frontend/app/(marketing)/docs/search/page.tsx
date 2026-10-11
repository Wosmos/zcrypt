import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Search & filters | zcrypt Docs",
  description:
    "Search the current folder in zcrypt against file and folder names (entirely on your device, so your query never reaches the server) and narrow results with type-filter chips.",
  alternates: { canonical: `${SITE_URL}/docs/search` },
  openGraph: {
    title: "Search & filters | zcrypt Docs",
    description:
      "Find files fast with a per-folder search box that runs locally on decrypted names, plus type-filter chips.",
    url: `${SITE_URL}/docs/search`,
  },
};

const toc = [
  { id: "box", k: "docs.search.toc.box" },
  { id: "local", k: "docs.search.toc.local" },
  { id: "filters", k: "docs.search.toc.filters" },
];

export default function SearchDocPage() {
  return (
    <DocPage
      href="/docs/search"
      title="Search & filters"
      description="Find what you need inside a folder fast, without your search ever leaving your device."
      toc={toc}
    >
      <DocSection id="box" title={<T k="docs.search.a2" />}>
        <DocP>
          <T k="docs.search.p1" />
        </DocP>
      </DocSection>

      <DocSection id="local" title={<T k="docs.search.a6" />}>
        <DocP>
          <T k="docs.search.p3" />
        </DocP>
        <DocNote type="security" title={<T k="docs.search.a5" />}>
          <T k="docs.search.p4" />
        </DocNote>
      </DocSection>

      <DocSection id="filters" title={<T k="docs.search.a11" />}>
        <DocP>
          <T k="docs.search.p7" />
        </DocP>
        <DocList
          items={[
            <T key="docs.search.p8" k="docs.search.p8" />,
            <T key="docs.search.p9" k="docs.search.p9" />,
          ]}
        />
        <DocP>
          <T
            k="docs.search.p10"
            links={{ l1: "/docs/folders" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
