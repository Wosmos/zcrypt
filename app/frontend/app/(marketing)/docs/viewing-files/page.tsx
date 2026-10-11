import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Viewing & previewing files | zcrypt Docs",
  description:
    "See image and video thumbnails generated on your device, then open images, video, audio, PDF, DOCX, HTML, Markdown, CSV, and code in zcrypt's full-screen viewer: decrypted on the fly, with keyboard paging, so plaintext never leaves your device.",
  alternates: { canonical: `${SITE_URL}/docs/viewing-files` },
  openGraph: {
    title: "Viewing & previewing files | zcrypt Docs",
    description:
      "A full-screen viewer that previews images, video, audio, PDFs, documents, and code by decrypting on the fly: zero-knowledge, with prev/next and keyboard control.",
    url: `${SITE_URL}/docs/viewing-files`,
  },
};

const toc = [
  { id: "thumbnails", k: "docs.viewing-files.toc.thumbnails" },
  { id: "overlay", k: "docs.viewing-files.toc.overlay" },
  { id: "types", k: "docs.viewing-files.toc.types" },
  { id: "zero-knowledge", k: "docs.viewing-files.toc.zero-knowledge" },
  { id: "navigate", k: "docs.viewing-files.toc.navigate" },
];

export default function ViewingFilesDocPage() {
  return (
    <DocPage
      href="/docs/viewing-files"
      title="Viewing & previewing files"
      description="Open a file to read or watch it right in the browser, no download, no plaintext leaving your device."
      toc={toc}
    >
      <DocSection id="thumbnails" title={<T k="docs.viewing-files.a7" />}>
        <DocP>
          <T k="docs.viewing-files.p1" />
        </DocP>
        <DocList
          items={[
            <T key="docs.viewing-files.p2" k="docs.viewing-files.p2" />,
            <T key="docs.viewing-files.p3" k="docs.viewing-files.p3" />,
            <T key="docs.viewing-files.p4" k="docs.viewing-files.p4" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.viewing-files.a6" />}>
          <T k="docs.viewing-files.p5" />
        </DocNote>
      </DocSection>

      <DocSection id="overlay" title={<T k="docs.viewing-files.a9" />}>
        <DocP>
          <T k="docs.viewing-files.p8" />
        </DocP>
      </DocSection>

      <DocSection id="types" title={<T k="docs.viewing-files.a20" />}>
        <DocP>
          <T k="docs.viewing-files.p10" />
        </DocP>
        <DocList
          items={[
            <T key="docs.viewing-files.p11" k="docs.viewing-files.p11" />,
            <T key="docs.viewing-files.p12" k="docs.viewing-files.p12" />,
            <T key="docs.viewing-files.p13" k="docs.viewing-files.p13" />,
            <T key="docs.viewing-files.p14" k="docs.viewing-files.p14" />,
            <T key="docs.viewing-files.p15" k="docs.viewing-files.p15" />,
            <T key="docs.viewing-files.p16" k="docs.viewing-files.p16" />,
            <T key="docs.viewing-files.p17" k="docs.viewing-files.p17" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.viewing-files.a19" />}>
          <T k="docs.viewing-files.p18" />
        </DocNote>
      </DocSection>

      <DocSection id="zero-knowledge" title={<T k="docs.viewing-files.a22" />}>
        <DocP>
          <T k="docs.viewing-files.p21" />
        </DocP>
      </DocSection>

      <DocSection id="navigate" title={<T k="docs.viewing-files.a31" />}>
        <DocP>
          <T k="docs.viewing-files.p23" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.viewing-files.p24" k="docs.viewing-files.p24" />,
            <T key="docs.viewing-files.p25" k="docs.viewing-files.p25" />,
          ]}
          rows={[
            [
              <>
                <kbd>Esc</kbd>
              </>,
              <T key="docs.viewing-files.p26" k="docs.viewing-files.p26" />,
            ],
            [
              <>
                <kbd>&larr;</kbd>
              </>,
              <T key="docs.viewing-files.p27" k="docs.viewing-files.p27" />,
            ],
            [
              <>
                <kbd>&rarr;</kbd>
              </>,
              <T key="docs.viewing-files.p28" k="docs.viewing-files.p28" />,
            ],
            [
              <>
                <kbd>f</kbd>
              </>,
              <T key="docs.viewing-files.p29" k="docs.viewing-files.p29" />,
            ],
          ]}
        />
        <DocP>
          <T
            k="docs.viewing-files.p30"
            links={{ l1: "/features/file-viewers" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>
    </DocPage>
  );
}
