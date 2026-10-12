import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Bulk operations · Docs",
  description:
    "Select many files in zcrypt to download them as a single ZIP (decrypted on your device, with browser limits on archive size) or to delete them in bulk: with mouse and keyboard multi-select.",
  path: "/docs/bulk",
  ogDescription:
    "Multi-select files in zcrypt to download as a ZIP or delete in bulk, with mouse and keyboard selection.",
});

const toc = [
  { id: "select", k: "docs.bulk.toc.select" },
  { id: "zip", k: "docs.bulk.toc.zip" },
  { id: "delete", k: "docs.bulk.toc.delete" },
  { id: "next", k: "docs.bulk.toc.next" },
];

export default function BulkDocPage() {
  return (
    <DocPage
      href="/docs/bulk"
      title="Bulk operations"
      description="Act on many files at once: select a batch and download it as a single ZIP, or move it to the Trash together. Selection works the way you expect with both mouse and keyboard."
      toc={toc}
    >
      <DocSection id="select" title={<T k="docs.bulk.a2" />}>
        <DocP>
          <T k="docs.bulk.p1" />
        </DocP>
      </DocSection>

      <DocSection id="zip" title={<T k="docs.bulk.a6" />}>
        <DocP>
          <T
            k="docs.bulk.p3"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocNote type="info" title={<T k="docs.bulk.a5" />}>
          <T k="docs.bulk.p4" />
        </DocNote>
      </DocSection>

      <DocSection id="delete" title={<T k="docs.bulk.a8" />}>
        <DocP>
          <T
            k="docs.bulk.p7"
            links={{ l1: "/docs/trash" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.bulk.a12" />}>
        <DocList
          items={[
            <T
              key="docs.bulk.p9"
              k="docs.bulk.p9"
              links={{ l1: "/docs/downloading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.bulk.p10"
              k="docs.bulk.p10"
              links={{ l1: "/docs/organizing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.bulk.p11"
              k="docs.bulk.p11"
              links={{ l1: "/docs/trash" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
