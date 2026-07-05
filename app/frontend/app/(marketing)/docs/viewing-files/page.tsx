import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Viewing & previewing files | zcrypt Docs",
  description:
    "See image and video thumbnails generated on your device, then open images, video, audio, PDF, DOCX, HTML, Markdown, CSV, and code in zcrypt's full-screen viewer — decrypted on the fly, with keyboard paging, so plaintext never leaves your device.",
  alternates: { canonical: "https://zcrypt.cloud/docs/viewing-files" },
  openGraph: {
    title: "Viewing & previewing files | zcrypt Docs",
    description:
      "A full-screen viewer that previews images, video, audio, PDFs, documents, and code by decrypting on the fly — zero-knowledge, with prev/next and keyboard control.",
    url: "https://zcrypt.cloud/docs/viewing-files",
  },
};

const toc = [
  { id: "thumbnails", title: "Thumbnails & type icons" },
  { id: "overlay", title: "The full-screen viewer" },
  { id: "types", title: "What it can preview" },
  { id: "zero-knowledge", title: "Decrypted on the fly" },
  { id: "navigate", title: "Paging & keyboard" },
];

export default function ViewingFilesDocPage() {
  return (
    <DocPage
      href="/docs/viewing-files"
      title="Viewing & previewing files"
      description="Open a file to read or watch it right in the browser — no download, no plaintext leaving your device."
      toc={toc}
    >
      <DocSection id="thumbnails" title="Thumbnails & type icons">
        <DocP>
          Before you even open a file, the grid shows you what it is. Images and
          videos get a real <strong>thumbnail</strong> — a small preview of the
          file itself — and everything else gets a crisp, macOS-style{" "}
          <strong>type icon</strong>: a colored glyph and label (Document,
          Image, Video, Audio, Spreadsheet, Code, Archive, and so on) on a little
          page tile.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Generated on your device.</strong> A thumbnail is built by
              decrypting the file in your browser, drawing it to a canvas, and
              encoding a tiny preview — the same zero-knowledge path as the
              viewer. For a video, zcrypt grabs a frame a little way in so you get
              a representative still rather than a black opening frame.
            </>,
            <>
              <strong>Lazy and cached.</strong> Each preview is generated the
              first time its card comes into view, then cached locally on your
              device — so it appears instantly next time without decrypting the
              file again.
            </>,
            <>
              <strong>Icons for the rest.</strong> Files that aren&rsquo;t images
              or video — and very large files that aren&rsquo;t worth decrypting
              just for a preview — fall back to their type icon instead.
            </>,
          ]}
        />
        <DocNote type="security" title="Previews never leave your device">
          Thumbnails are made from the decrypted file{" "}
          <strong>in your browser</strong> and kept only in your browser&rsquo;s
          local cache. They are never uploaded — your storage platform and our
          servers only ever hold the encrypted chunks.
        </DocNote>
      </DocSection>

      <DocSection id="overlay" title="The full-screen viewer">
        <DocP>
          Click a file to open the <strong>full-screen viewer</strong>, an
          overlay that renders the file in place. It is the quickest way to check
          a document, scrub a video, or skim a folder of images without saving
          anything to disk.
        </DocP>
      </DocSection>

      <DocSection id="types" title="What it can preview">
        <DocP>
          The viewer handles a wide range of formats directly in the browser:
        </DocP>
        <DocList
          items={[
            <><strong>Images</strong>, <strong>video</strong>, and <strong>audio</strong> with native playback controls.</>,
            <><strong>PDF</strong> documents, page by page.</>,
            <><strong>DOCX</strong> word-processing documents.</>,
            <><strong>HTML</strong> — rendered <strong>sanitized, with scripts disabled</strong>.</>,
            <><strong>Markdown</strong>, rendered to formatted text.</>,
            <><strong>CSV</strong> and <strong>TSV</strong> as tables.</>,
            <><strong>Text and code</strong> files.</>,
          ]}
        />
        <DocNote type="security" title="HTML is rendered safely">
          HTML previews are sanitized and have scripting disabled before they are
          shown, so opening an HTML file can&apos;t run code or phone home from
          inside your vault.
        </DocNote>
      </DocSection>

      <DocSection id="zero-knowledge" title="Decrypted on the fly">
        <DocP>
          Previewing is <strong>zero-knowledge</strong>. zcrypt fetches the
          encrypted chunks, then decrypts and decompresses them{" "}
          <strong>in your browser</strong> just long enough to render the
          preview. The plaintext <strong>stays local</strong> — it is never
          written to your storage platform and never sent to our servers.
        </DocP>
      </DocSection>

      <DocSection id="navigate" title="Paging & keyboard">
        <DocP>
          Once open, the viewer steps through the whole folder. Move{" "}
          <strong>prev/next</strong> across files, watch the{" "}
          <strong>counter</strong> track your position, and go{" "}
          <strong>fullscreen</strong> for media. Everything is reachable from the
          keyboard:
        </DocP>
        <DocTable
          head={["Key", "Action"]}
          rows={[
            [<><kbd>Esc</kbd></>, "Close the viewer"],
            [<><kbd>&larr;</kbd></>, "Previous file in the folder"],
            [<><kbd>&rarr;</kbd></>, "Next file in the folder"],
            [<><kbd>f</kbd></>, "Toggle fullscreen"],
          ]}
        />
        <DocP>
          For the complete list of supported formats and how each renderer works,
          see{" "}
          <Link href="/features/file-viewers" className="text-cyan-600 hover:underline dark:text-cyan-400">
            File viewers
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
