import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Uploading · Docs",
  description:
    "How zcrypt uploads: client-side compression and encryption, device-sized chunks, durable resumable sessions that survive reloads and device switches, a real pause distinct from cancel, honest never-backwards progress, relay vs. direct (presigned) upload, and parallel batches on mobile too.",
  path: "/docs/uploading",
  ogDescription:
    "Chunked, client-encrypted, resumable uploads in zcrypt: surviving reloads, real pause vs. cancel, honest progress, relay and direct modes, and parallel batches.",
});

const toc = [
  { id: "chunked", k: "docs.uploading.toc.chunked" },
  { id: "resumable", k: "docs.uploading.toc.resumable" },
  { id: "reloads", k: "docs.uploading.toc.reloads" },
  { id: "unfinished", k: "docs.uploading.toc.unfinished" },
  { id: "pause", k: "docs.uploading.toc.pause" },
  { id: "modes", k: "docs.uploading.toc.modes" },
  { id: "parallel", k: "docs.uploading.toc.parallel" },
  { id: "folders", k: "docs.uploading.toc.folders" },
  { id: "next", k: "docs.uploading.toc.next" },
];

export default function UploadingDocPage() {
  return (
    <DocPage
      href="/docs/uploading"
      title="Uploading"
      description="Files are compressed, encrypted, and chunked on your device, then streamed to your storage one chunk at a time. The upload survives refreshes, drops, and even a switch to another device, and it lands exactly where you are in your drive."
      toc={toc}
    >
      <DocSection id="chunked" title={<T k="docs.uploading.a4" />}>
        <DocP>
          <T
            k="docs.uploading.p1"
            links={{ l1: "/docs/how-it-works" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocP>
          <T k="docs.uploading.p2" />
        </DocP>
        <DocP>
          <T k="docs.uploading.p3" />
        </DocP>
      </DocSection>

      <DocSection id="resumable" title={<T k="docs.uploading.a12" />}>
        <DocP>
          <T k="docs.uploading.p5" />
        </DocP>
        <DocList
          items={[
            <T key="docs.uploading.p6" k="docs.uploading.p6" />,
            <T key="docs.uploading.p7" k="docs.uploading.p7" />,
            <T key="docs.uploading.p8" k="docs.uploading.p8" />,
            <T key="docs.uploading.p9" k="docs.uploading.p9" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.uploading.a11" />}>
          <T k="docs.uploading.p10" />
        </DocNote>
      </DocSection>

      <DocSection id="reloads" title={<T k="docs.uploading.a17" />}>
        <DocP>
          <T k="docs.uploading.p13" />
        </DocP>
        <DocP>
          <T k="docs.uploading.p14" />
        </DocP>
        <DocNote type="info" title={<T k="docs.uploading.a16" />}>
          <T k="docs.uploading.p15" />
        </DocNote>
      </DocSection>

      <DocSection id="unfinished" title={<T k="docs.uploading.a22" />}>
        <DocP>
          <T k="docs.uploading.p18" />
        </DocP>
        <DocList
          items={[
            <T key="docs.uploading.p19" k="docs.uploading.p19" />,
            <T key="docs.uploading.p20" k="docs.uploading.p20" />,
          ]}
        />
        <DocP>
          <T k="docs.uploading.p21" />
        </DocP>
      </DocSection>

      <DocSection id="pause" title={<T k="docs.uploading.a27" />}>
        <DocP>
          <T k="docs.uploading.p23" />
        </DocP>
        <DocNote type="info" title={<T k="docs.uploading.a25" />}>
          <T k="docs.uploading.p24" />
        </DocNote>
        <DocP>
          <T k="docs.uploading.p26" />
        </DocP>
      </DocSection>

      <DocSection id="modes" title={<T k="docs.uploading.a33" />}>
        <DocP>
          <T k="docs.uploading.p28" />
        </DocP>
        <DocList
          items={[
            <T key="docs.uploading.p29" k="docs.uploading.p29" />,
            <T key="docs.uploading.p30" k="docs.uploading.p30" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.uploading.a32" />}>
          <T k="docs.uploading.p31" />
        </DocNote>
      </DocSection>

      <DocSection id="parallel" title={<T k="docs.uploading.a36" />}>
        <DocP>
          <T k="docs.uploading.p34" />
        </DocP>
        <DocP>
          <T k="docs.uploading.p35" />
        </DocP>
      </DocSection>

      <DocSection id="folders" title={<T k="docs.uploading.a40" />}>
        <DocP>
          <T k="docs.uploading.p37" />
        </DocP>
        <DocP>
          <T
            k="docs.uploading.p38"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocP>
          <T
            k="docs.uploading.p39"
            links={{ l1: "/docs/platform-adapters" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.uploading.a45" />}>
        <DocList
          items={[
            <T
              key="docs.uploading.p41"
              k="docs.uploading.p41"
              links={{ l1: "/docs/transfer-manager" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.uploading.p42"
              k="docs.uploading.p42"
              links={{ l1: "/docs/downloading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.uploading.p43"
              k="docs.uploading.p43"
              links={{ l1: "/docs/repo-pool" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.uploading.p44"
              k="docs.uploading.p44"
              links={{ l1: "/features/transfers" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
