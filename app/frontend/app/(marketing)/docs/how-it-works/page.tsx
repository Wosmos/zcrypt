import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocCode, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "How it works · Docs",
  description:
    "Follow a file through zcrypt end to end: on your device it is split into device-tiered chunks (4 to 16 MiB), each chunk is compressed with zstd and encrypted with AES-256-GCM under a random per-file key, and the result is pushed to your own storage. Downloading reverses every step.",
  path: "/docs/how-it-works",
  ogDescription:
    "A file's journey through zcrypt: chunk, compress, encrypt, and upload, all client-side and zero-knowledge.",
});

const toc = [
  { id: "short", k: "docs.how-it-works.toc.short" },
  { id: "chunk", k: "docs.how-it-works.toc.chunk" },
  { id: "compress", k: "docs.how-it-works.toc.compress" },
  { id: "encrypt", k: "docs.how-it-works.toc.encrypt" },
  { id: "upload", k: "docs.how-it-works.toc.upload" },
  { id: "download", k: "docs.how-it-works.toc.download" },
  { id: "next", k: "docs.how-it-works.toc.next" },
];

export default function HowItWorksDocPage() {
  return (
    <DocPage
      href="/docs/how-it-works"
      title="How it works"
      description="Every transformation that protects a file happens on your device, in order, before a single byte leaves it. This is the whole journey, and downloading runs it precisely in reverse."
      toc={toc}
    >
      <DocSection id="short" title={<T k="docs.how-it-works.a4" />}>
        <DocP>
          <T k="docs.how-it-works.p1" />
        </DocP>
        <DocCode
          label={<T k="docs.how-it-works.a3" />}
        >{`chunk (4 to 16 MiB)  →  compress (zstd)  →  encrypt (AES-256-GCM)  →  upload to your storage`}</DocCode>
      </DocSection>

      <DocSection id="chunk" title={<T k="docs.how-it-works.a14" />}>
        <DocP>
          <T k="docs.how-it-works.p11" />
        </DocP>
        <DocNote type="info" title={<T k="docs.how-it-works.a13" />}>
          <T k="docs.how-it-works.p12" />
        </DocNote>
      </DocSection>

      <DocSection id="compress" title={<T k="docs.how-it-works.a6" />}>
        <DocP>
          <T k="docs.how-it-works.p5" />
        </DocP>
      </DocSection>

      <DocSection id="encrypt" title={<T k="docs.how-it-works.a10" />}>
        <DocP>
          <T k="docs.how-it-works.p7" />
        </DocP>
        <DocNote type="security" title={<T k="docs.how-it-works.a9" />}>
          <T k="docs.how-it-works.p8" />
        </DocNote>
      </DocSection>

      <DocSection id="upload" title={<T k="docs.how-it-works.a17" />}>
        <DocP>
          <T k="docs.how-it-works.p15" />
        </DocP>
        <DocP>
          <T k="docs.how-it-works.p16" />
        </DocP>
      </DocSection>

      <DocSection id="download" title={<T k="docs.how-it-works.a23" />}>
        <DocP>
          <T k="docs.how-it-works.p18" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.how-it-works.p19" k="docs.how-it-works.p19" />,
            <T key="docs.how-it-works.p20" k="docs.how-it-works.p20" />,
            <T key="docs.how-it-works.p21" k="docs.how-it-works.p21" />,
            <T key="docs.how-it-works.p22" k="docs.how-it-works.p22" />,
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.how-it-works.a27" />}>
        <DocList
          items={[
            <T
              key="docs.how-it-works.p24"
              k="docs.how-it-works.p24"
              links={{ l1: "/docs/uploading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.how-it-works.p25"
              k="docs.how-it-works.p25"
              links={{ l1: "/docs/downloading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.how-it-works.p26"
              k="docs.how-it-works.p26"
              links={{ l1: "/docs/security" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
