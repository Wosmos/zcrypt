import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Downloading · Docs",
  description:
    "How zcrypt downloads: your browser fetches encrypted chunks, decrypts and decompresses them in a Web Worker pool, verifies the file's SHA-256, and (for very large files) streams straight to disk. Every step runs on your device; the server never sees plaintext or your passphrase.",
  path: "/docs/downloading",
  ogDescription:
    "Fetching, decrypting, and verifying your files locally in zcrypt: with a worker pool, streaming-to-disk for large files, and pause/resume.",
});

const toc = [
  { id: "local", k: "docs.downloading.toc.local" },
  { id: "steps", k: "docs.downloading.toc.steps" },
  { id: "streaming", k: "docs.downloading.toc.streaming" },
  { id: "resume", k: "docs.downloading.toc.resume" },
  { id: "integrity", k: "docs.downloading.toc.integrity" },
  { id: "protected", k: "docs.downloading.toc.protected" },
  { id: "next", k: "docs.downloading.toc.next" },
];

export default function DownloadingDocPage() {
  return (
    <DocPage
      href="/docs/downloading"
      title="Downloading"
      description="Getting a file back is the upload pipeline in reverse. Your browser pulls the encrypted chunks, decrypts them, and rebuilds the original, and the plaintext is reconstructed only on your device."
      toc={toc}
    >
      <DocSection id="local" title={<T k="docs.downloading.a3" />}>
        <DocP>
          <T k="docs.downloading.p1" />
        </DocP>
        <DocP>
          <T k="docs.downloading.p2" />
        </DocP>
      </DocSection>

      <DocSection id="steps" title={<T k="docs.downloading.a8" />}>
        <DocList
          ordered
          items={[
            <T key="docs.downloading.p4" k="docs.downloading.p4" />,
            <T key="docs.downloading.p5" k="docs.downloading.p5" />,
            <T key="docs.downloading.p6" k="docs.downloading.p6" />,
            <T key="docs.downloading.p7" k="docs.downloading.p7" />,
          ]}
        />
      </DocSection>

      <DocSection id="streaming" title={<T k="docs.downloading.a13" />}>
        <DocP>
          <T k="docs.downloading.p9" />
        </DocP>
        <DocNote type="info" title={<T k="docs.downloading.a11" />}>
          <T k="docs.downloading.p10" />
        </DocNote>
        <DocP>
          <T k="docs.downloading.p12" />
        </DocP>
      </DocSection>

      <DocSection id="resume" title={<T k="docs.downloading.a18" />}>
        <DocP>
          <T k="docs.downloading.p14" />
        </DocP>
        <DocP>
          <T
            k="docs.downloading.p15"
            links={{ l1: "/docs/bulk" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocNote type="warning" title={<T k="docs.downloading.a17" />}>
          <T
            k="docs.downloading.p16"
            links={{ l1: "/docs/uploading", l2: "/docs/transfer-manager" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="integrity" title={<T k="docs.downloading.a22" />}>
        <DocP>
          <T k="docs.downloading.p19" />
        </DocP>
        <DocNote type="security" title={<T k="docs.downloading.a21" />}>
          <T k="docs.downloading.p20" />
        </DocNote>
      </DocSection>

      <DocSection id="protected" title={<T k="docs.downloading.a24" />}>
        <DocP>
          <T
            k="docs.downloading.p23"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.downloading.a28" />}>
        <DocList
          items={[
            <T
              key="docs.downloading.p25"
              k="docs.downloading.p25"
              links={{ l1: "/docs/transfer-manager" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.downloading.p26"
              k="docs.downloading.p26"
              links={{ l1: "/docs/bulk" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.downloading.p27"
              k="docs.downloading.p27"
              links={{ l1: "/docs/viewing-files" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
