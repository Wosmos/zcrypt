import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Transfer manager · Docs",
  description:
    "The docked transfer manager unifies every upload and download in zcrypt: per-item progress, speed and ETA, a direction cue, pause/resume and retry for both directions, and a non-destructive dismiss: all in a panel that survives navigation and stays put while work is in flight. Distinct from device transfer.",
  path: "/docs/transfer-manager",
  ogDescription:
    "Pause, resume, retry, stop, and track every upload and download from one docked panel that survives navigation and never hides work in flight.",
});

const toc = [
  { id: "panel", k: "docs.transfer-manager.toc.panel" },
  { id: "controls", k: "docs.transfer-manager.toc.controls" },
  { id: "pause", k: "docs.transfer-manager.toc.pause" },
  { id: "dismiss", k: "docs.transfer-manager.toc.dismiss" },
  { id: "collapse", k: "docs.transfer-manager.toc.collapse" },
  { id: "not-device", k: "docs.transfer-manager.toc.not-device" },
  { id: "next", k: "docs.transfer-manager.toc.next" },
];

export default function TransferManagerDocPage() {
  return (
    <DocPage
      href="/docs/transfer-manager"
      title="Transfer manager"
      description="A single docked panel, pinned to the corner of the app, that gathers every upload and download in one place, and keeps running, and stays visible, as you move around your drive."
      toc={toc}
    >
      <DocSection id="panel" title={<T k="docs.transfer-manager.a4" />}>
        <DocP>
          <T k="docs.transfer-manager.p1" />
        </DocP>
        <DocP>
          <T k="docs.transfer-manager.p2" />
        </DocP>
        <DocP>
          <T k="docs.transfer-manager.p3" />
        </DocP>
      </DocSection>

      <DocSection id="controls" title={<T k="docs.transfer-manager.a12" />}>
        <DocP>
          <T k="docs.transfer-manager.p5" />
        </DocP>
        <DocList
          items={[
            <T key="docs.transfer-manager.p6" k="docs.transfer-manager.p6" />,
            <T key="docs.transfer-manager.p7" k="docs.transfer-manager.p7" />,
            <T key="docs.transfer-manager.p8" k="docs.transfer-manager.p8" />,
            <T key="docs.transfer-manager.p9" k="docs.transfer-manager.p9" />,
            <T key="docs.transfer-manager.p10" k="docs.transfer-manager.p10" />,
            <T key="docs.transfer-manager.p11" k="docs.transfer-manager.p11" />,
          ]}
        />
      </DocSection>

      <DocSection id="pause" title={<T k="docs.transfer-manager.a17" />}>
        <DocP>
          <T k="docs.transfer-manager.p13" />
        </DocP>
        <DocP>
          <T
            k="docs.transfer-manager.p14"
            links={{ l1: "/docs/downloading" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocNote type="security" title={<T k="docs.transfer-manager.a16" />}>
          <T
            k="docs.transfer-manager.p15"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="dismiss" title={<T k="docs.transfer-manager.a21" />}>
        <DocP>
          <T k="docs.transfer-manager.p18" />
        </DocP>
        <DocNote type="info" title={<T k="docs.transfer-manager.a20" />}>
          <T k="docs.transfer-manager.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="collapse" title={<T k="docs.transfer-manager.a23" />}>
        <DocP>
          <T k="docs.transfer-manager.p22" />
        </DocP>
      </DocSection>

      <DocSection id="not-device" title={<T k="docs.transfer-manager.a26" />}>
        <DocNote type="warning" title={<T k="docs.transfer-manager.a25" />}>
          <T
            k="docs.transfer-manager.p24"
            links={{ l1: "/docs/sync-transfer" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.transfer-manager.a31" />}>
        <DocList
          items={[
            <T
              key="docs.transfer-manager.p27"
              k="docs.transfer-manager.p27"
              links={{ l1: "/docs/uploading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.transfer-manager.p28"
              k="docs.transfer-manager.p28"
              links={{ l1: "/docs/downloading" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.transfer-manager.p29"
              k="docs.transfer-manager.p29"
              links={{ l1: "/docs/sync-transfer" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.transfer-manager.p30"
              k="docs.transfer-manager.p30"
              links={{ l1: "/features/transfers" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
