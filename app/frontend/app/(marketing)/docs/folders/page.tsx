import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Folders & the File Explorer · Docs",
  description:
    "How folders work in zcrypt: create and nest them, navigate with breadcrumbs, switch between grid and list views, sort, and search: with macOS-style folder icons and folder names encrypted on your device.",
  path: "/docs/folders",
  ogDescription:
    "Create, nest, navigate, sort, and search folders in the zcrypt encrypted drive, with encrypted folder names.",
});

const toc = [
  { id: "creating", k: "docs.folders.toc.creating" },
  { id: "navigating", k: "docs.folders.toc.navigating" },
  { id: "views", k: "docs.folders.toc.views" },
  { id: "appearance", k: "docs.folders.toc.appearance" },
  { id: "search", k: "docs.folders.toc.search" },
  { id: "names", k: "docs.folders.toc.names" },
  { id: "next", k: "docs.folders.toc.next" },
];

export default function FoldersDocPage() {
  return (
    <DocPage
      href="/docs/folders"
      title="Folders & the file explorer"
      description="zcrypt is a real encrypted drive. Your files live in folders you create and nest, navigate with breadcrumbs, and arrange exactly how you think: all from one unified explorer."
      toc={toc}
    >
      <DocSection id="creating" title={<T k="docs.folders.a5" />}>
        <DocP>
          <T k="docs.folders.p1" />
        </DocP>
        <DocList
          items={[
            <T key="docs.folders.p2" k="docs.folders.p2" />,
            <T key="docs.folders.p3" k="docs.folders.p3" />,
            <T key="docs.folders.p4" k="docs.folders.p4" />,
          ]}
        />
      </DocSection>

      <DocSection id="navigating" title={<T k="docs.folders.a7" />}>
        <DocP>
          <T k="docs.folders.p6" />
        </DocP>
      </DocSection>

      <DocSection id="views" title={<T k="docs.folders.a9" />}>
        <DocP>
          <T k="docs.folders.p8" />
        </DocP>
      </DocSection>

      <DocSection id="appearance" title={<T k="docs.folders.a12" />}>
        <DocP>
          <T k="docs.folders.p10" />
        </DocP>
        <DocP>
          <T k="docs.folders.p11" />
        </DocP>
      </DocSection>

      <DocSection id="search" title={<T k="docs.folders.a14" />}>
        <DocP>
          <T k="docs.folders.p13" />
        </DocP>
      </DocSection>

      <DocSection id="names" title={<T k="docs.folders.a18" />}>
        <DocP>
          <T k="docs.folders.p15" />
        </DocP>
        <DocNote type="security" title={<T k="docs.folders.a17" />}>
          <T k="docs.folders.p16" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.folders.a24" />}>
        <DocP>
          <T k="docs.folders.p19" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.folders.p20"
              k="docs.folders.p20"
              links={{ l1: "/docs/organizing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folders.p21"
              k="docs.folders.p21"
              links={{ l1: "/docs/folder-encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folders.p22"
              k="docs.folders.p22"
              links={{ l1: "/docs/viewing-files" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folders.p23"
              k="docs.folders.p23"
              links={{ l1: "/features/folders" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
