import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Sync & device transfer · Docs",
  description:
    "How zcrypt moves data between your own devices: offline pins that keep chosen files on hand per device, end-to-end encrypted clipboard sync pushed live over SSE, folder sync configured for the zcrypt desktop client, and real-time device-to-device file transfer over a 6-digit room code.",
  path: "/docs/sync-transfer",
  ogDescription:
    "Offline pins, encrypted clipboard sync, folder sync, and device-to-device transfer: the server holds ciphertext and metadata, never your plaintext.",
});

const toc = [
  { id: "offline", k: "docs.sync-transfer.toc.offline" },
  { id: "clipboard", k: "docs.sync-transfer.toc.clipboard" },
  { id: "clipboard-how", k: "docs.sync-transfer.toc.clipboard-how" },
  { id: "folders", k: "docs.sync-transfer.toc.folders" },
  { id: "transfer", k: "docs.sync-transfer.toc.transfer" },
  { id: "next", k: "docs.sync-transfer.toc.next" },
];

export default function SyncTransferDocPage() {
  return (
    <DocPage
      href="/docs/sync-transfer"
      title="Sync & device transfer"
      description="Keep your own devices in step without handing anyone your plaintext. The Sync & Offline tab holds three tools (offline pins, encrypted clipboard sync, and folder sync) while a separate Transfer tab streams a file straight from one device to another."
      toc={toc}
    >
      <DocSection id="offline" title={<T k="docs.sync-transfer.a5" />}>
        <DocP>
          <T k="docs.sync-transfer.p1" />
        </DocP>
        <DocList
          items={[
            <T key="docs.sync-transfer.p2" k="docs.sync-transfer.p2" />,
            <T key="docs.sync-transfer.p3" k="docs.sync-transfer.p3" />,
            <T key="docs.sync-transfer.p4" k="docs.sync-transfer.p4" />,
          ]}
        />
      </DocSection>

      <DocSection id="clipboard" title={<T k="docs.sync-transfer.a10" />}>
        <DocP>
          <T k="docs.sync-transfer.p6" />
        </DocP>
        <DocList
          items={[
            <T key="docs.sync-transfer.p7" k="docs.sync-transfer.p7" />,
            <T key="docs.sync-transfer.p8" k="docs.sync-transfer.p8" />,
            <T key="docs.sync-transfer.p9" k="docs.sync-transfer.p9" />,
          ]}
        />
      </DocSection>

      <DocSection id="clipboard-how" title={<T k="docs.sync-transfer.a16" />}>
        <DocP>
          <T k="docs.sync-transfer.p11" />
        </DocP>
        <DocNote type="security" title={<T k="docs.sync-transfer.a13" />}>
          <T k="docs.sync-transfer.p12" />
        </DocNote>
        <DocNote type="info" title={<T k="docs.sync-transfer.a15" />}>
          <T k="docs.sync-transfer.p14" />
        </DocNote>
      </DocSection>

      <DocSection id="folders" title={<T k="docs.sync-transfer.a21" />}>
        <DocP>
          <T k="docs.sync-transfer.p17" />
        </DocP>
        <DocP>
          <T k="docs.sync-transfer.p18" />
        </DocP>
        <DocNote type="info" title={<T k="docs.sync-transfer.a20" />}>
          <T k="docs.sync-transfer.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="transfer" title={<T k="docs.sync-transfer.a29" />}>
        <DocP>
          <T k="docs.sync-transfer.p22" />
        </DocP>
        <DocList
          items={[
            <T key="docs.sync-transfer.p23" k="docs.sync-transfer.p23" />,
            <T key="docs.sync-transfer.p24" k="docs.sync-transfer.p24" />,
            <T key="docs.sync-transfer.p25" k="docs.sync-transfer.p25" />,
            <T key="docs.sync-transfer.p26" k="docs.sync-transfer.p26" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.sync-transfer.a28" />}>
          <T
            k="docs.sync-transfer.p27"
            links={{ l1: "/docs/send", l2: "/docs/sharing" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.sync-transfer.a33" />}>
        <DocList
          items={[
            <T
              key="docs.sync-transfer.p30"
              k="docs.sync-transfer.p30"
              links={{ l1: "/docs/send" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sync-transfer.p31"
              k="docs.sync-transfer.p31"
              links={{ l1: "/docs/sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sync-transfer.p32"
              k="docs.sync-transfer.p32"
              links={{ l1: "/docs/pad" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
