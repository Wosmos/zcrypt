import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Moving & organizing | zcrypt Docs",
  description:
    "Move files and folders in zcrypt by dragging them onto a folder or breadcrumb, bulk-drag many at once, drop one file onto another to make a folder, use the Move-to-folder picker, multi-select, and bulk download or delete.",
  alternates: { canonical: `${SITE_URL}/docs/organizing` },
  openGraph: {
    title: "Moving & organizing | zcrypt Docs",
    description:
      "Drag-and-drop, the Move-to-folder picker, multi-select, and bulk download or delete in the zcrypt encrypted drive.",
    url: `${SITE_URL}/docs/organizing`,
  },
};

const toc = [
  { id: "drag", k: "docs.organizing.toc.drag" },
  { id: "bulk-drag", k: "docs.organizing.toc.bulk-drag" },
  { id: "drop-to-group", k: "docs.organizing.toc.drop-to-group" },
  { id: "dialog", k: "docs.organizing.toc.dialog" },
  { id: "select", k: "docs.organizing.toc.select" },
  { id: "bulk-actions", k: "docs.organizing.toc.bulk-actions" },
];

export default function OrganizingDocPage() {
  return (
    <DocPage
      href="/docs/organizing"
      title="Moving & organizing"
      description="Rearrange your encrypted drive the way you would expect: drag things where they go, select in bulk, and act on many files at once: all from the unified explorer."
      toc={toc}
    >
      <DocSection id="drag" title={<T k="docs.organizing.a2" />}>
        <DocP>
          <T k="docs.organizing.p1" />
        </DocP>
      </DocSection>

      <DocSection id="bulk-drag" title={<T k="docs.organizing.a4" />}>
        <DocP>
          <T k="docs.organizing.p3" />
        </DocP>
      </DocSection>

      <DocSection id="drop-to-group" title={<T k="docs.organizing.a6" />}>
        <DocP>
          <T k="docs.organizing.p5" />
        </DocP>
      </DocSection>

      <DocSection id="dialog" title={<T k="docs.organizing.a10" />}>
        <DocP>
          <T k="docs.organizing.p7" />
        </DocP>
        <DocNote type="info" title={<T k="docs.organizing.a9" />}>
          <T k="docs.organizing.p8" />
        </DocNote>
      </DocSection>

      <DocSection id="select" title={<T k="docs.organizing.a22" />}>
        <DocP>
          <T k="docs.organizing.p11" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.organizing.p12" k="docs.organizing.p12" />,
            <T key="docs.organizing.p13" k="docs.organizing.p13" />,
          ]}
          rows={[
            [
              <T key="docs.organizing.p14" k="docs.organizing.p14" />,
              <T key="docs.organizing.p15" k="docs.organizing.p15" />,
            ],
            [
              <T key="docs.organizing.p16" k="docs.organizing.p16" />,
              <T key="docs.organizing.p17" k="docs.organizing.p17" />,
            ],
            [
              <>
                <kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd>
              </>,
              <T key="docs.organizing.p18" k="docs.organizing.p18" />,
            ],
            [
              <T key="docs.organizing.p19" k="docs.organizing.p19" />,
              <T key="docs.organizing.p20" k="docs.organizing.p20" />,
            ],
            [
              <>
                <kbd>Space</kbd>
              </>,
              <T key="docs.organizing.p21" k="docs.organizing.p21" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="bulk-actions" title={<T k="docs.organizing.a27" />}>
        <DocP>
          <T k="docs.organizing.p23" />
        </DocP>
        <DocList
          items={[
            <T key="docs.organizing.p24" k="docs.organizing.p24" />,
            <T
              key="docs.organizing.p25"
              k="docs.organizing.p25"
              links={{ l1: "/docs/trash" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
        <DocP>
          <T
            k="docs.organizing.p26"
            links={{ l1: "/docs/bulk" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
