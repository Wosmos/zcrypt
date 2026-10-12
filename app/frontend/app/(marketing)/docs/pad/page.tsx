import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Encrypted Pad · Docs",
  description:
    "Share a one-time encrypted note or paste with zcrypt's Encrypted Pad: up to about 1 MB of text, an expiry of 1 hour, 24 hours, or 7 days, and optional burn-after-read. The server stores only ciphertext.",
  path: "/docs/pad",
  ogDescription:
    "Share a one-time encrypted note: encrypted in your browser, expiring on a schedule, optionally readable only once.",
});

const toc = [
  { id: "what", k: "docs.pad.toc.what" },
  { id: "how", k: "docs.pad.toc.how" },
  { id: "limits", k: "docs.pad.toc.limits" },
  { id: "burn", k: "docs.pad.toc.burn" },
  { id: "privacy", k: "docs.pad.toc.privacy" },
  { id: "next", k: "docs.pad.toc.next" },
];

export default function PadDocPage() {
  return (
    <DocPage
      href="/docs/pad"
      title="Encrypted Pad"
      description="Send a snippet of text (a password, a note, a paste) that's encrypted in your browser and can be set to self-destruct after a single read. Think of it as an encrypted, expiring pastebin."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.pad.a2" />}>
        <DocP>
          <T k="docs.pad.p1" />
        </DocP>
      </DocSection>

      <DocSection id="how" title={<T k="docs.pad.a7" />}>
        <DocP>
          <T k="docs.pad.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.pad.p4" k="docs.pad.p4" />,
            <T key="docs.pad.p5" k="docs.pad.p5" />,
            <T key="docs.pad.p6" k="docs.pad.p6" />,
          ]}
        />
      </DocSection>

      <DocSection id="limits" title={<T k="docs.pad.a10" />}>
        <DocList
          items={[
            <T
              key="docs.pad.p8"
              k="docs.pad.p8"
              links={{ l1: "/docs/send" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.pad.p9" k="docs.pad.p9" />,
          ]}
        />
      </DocSection>

      <DocSection id="burn" title={<T k="docs.pad.a12" />}>
        <DocP>
          <T k="docs.pad.p11" />
        </DocP>
      </DocSection>

      <DocSection id="privacy" title={<T k="docs.pad.a15" />}>
        <DocNote type="security" title={<T k="docs.pad.a14" />}>
          <T k="docs.pad.p13" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.pad.a18" />}>
        <DocList
          items={[
            <T
              key="docs.pad.p16"
              k="docs.pad.p16"
              links={{ l1: "/docs/send" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.pad.p17"
              k="docs.pad.p17"
              links={{ l1: "/docs/sync-transfer" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
