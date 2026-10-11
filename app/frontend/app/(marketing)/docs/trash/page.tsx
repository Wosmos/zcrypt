import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Trash & restore | zcrypt Docs",
  description:
    "Deleting a file in zcrypt moves it to Trash as a soft delete. Restore it, preview it, or delete it forever to purge its chunks from every connected storage platform. Bulk selection supported.",
  alternates: { canonical: `${SITE_URL}/docs/trash` },
  openGraph: {
    title: "Trash & restore | zcrypt Docs",
    description:
      "Soft-delete, restore, preview, and permanently purge files in zcrypt, including bulk actions.",
    url: `${SITE_URL}/docs/trash`,
  },
};

const toc = [
  { id: "soft-delete", k: "docs.trash.toc.soft-delete" },
  { id: "restore", k: "docs.trash.toc.restore" },
  { id: "purge", k: "docs.trash.toc.purge" },
  { id: "preview", k: "docs.trash.toc.preview" },
  { id: "bulk", k: "docs.trash.toc.bulk" },
];

export default function TrashDocPage() {
  return (
    <DocPage
      href="/docs/trash"
      title="Trash & restore"
      description="Deletes are reversible by default. Items go to Trash first, so a mis-click is a quick restore, until you decide to purge them for good."
      toc={toc}
    >
      <DocSection id="soft-delete" title={<T k="docs.trash.a2" />}>
        <DocP>
          <T k="docs.trash.p1" />
        </DocP>
      </DocSection>

      <DocSection id="restore" title={<T k="docs.trash.a4" />}>
        <DocP>
          <T k="docs.trash.p3" />
        </DocP>
      </DocSection>

      <DocSection id="purge" title={<T k="docs.trash.a8" />}>
        <DocP>
          <T k="docs.trash.p5" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.trash.a7" />}>
          <T k="docs.trash.p6" />
        </DocNote>
      </DocSection>

      <DocSection id="preview" title={<T k="docs.trash.a10" />}>
        <DocP>
          <T
            k="docs.trash.p9"
            links={{ l1: "/docs/viewing-files" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="bulk" title={<T k="docs.trash.a14" />}>
        <DocP>
          <T k="docs.trash.p11" />
        </DocP>
        <DocList
          items={[
            <T key="docs.trash.p12" k="docs.trash.p12" />,
            <T key="docs.trash.p13" k="docs.trash.p13" />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
