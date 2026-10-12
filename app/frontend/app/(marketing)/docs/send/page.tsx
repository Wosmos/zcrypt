import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Anonymous Send · Docs",
  description:
    "Send an encrypted file with no account using zcrypt's Anonymous Send: up to about 50 MB, an expiry of 1 to 24 hours, and optional burn-after-read. Files are stored encrypted under a disguised name.",
  path: "/docs/send",
  ogDescription:
    "Send an encrypted file without an account: short-lived, optionally one-time, and encrypted in your browser before upload.",
});

const toc = [
  { id: "what", k: "docs.send.toc.what" },
  { id: "how", k: "docs.send.toc.how" },
  { id: "limits", k: "docs.send.toc.limits" },
  { id: "burn", k: "docs.send.toc.burn" },
  { id: "privacy", k: "docs.send.toc.privacy" },
  { id: "next", k: "docs.send.toc.next" },
];

export default function SendDocPage() {
  return (
    <DocPage
      href="/docs/send"
      title="Anonymous Send"
      description="Drop someone an encrypted file without signing up for anything. Send encrypts in your browser, stores the result under a disguised name for a short window, and can wipe it the moment it's read."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.send.a2" />}>
        <DocP>
          <T k="docs.send.p1" />
        </DocP>
      </DocSection>

      <DocSection id="how" title={<T k="docs.send.a7" />}>
        <DocP>
          <T k="docs.send.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.send.p4" k="docs.send.p4" />,
            <T key="docs.send.p5" k="docs.send.p5" />,
            <T key="docs.send.p6" k="docs.send.p6" />,
          ]}
        />
      </DocSection>

      <DocSection id="limits" title={<T k="docs.send.a13" />}>
        <DocList
          items={[
            <T key="docs.send.p8" k="docs.send.p8" />,
            <T key="docs.send.p9" k="docs.send.p9" />,
            <T key="docs.send.p10" k="docs.send.p10" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.send.a12" />}>
          <T
            k="docs.send.p11"
            links={{ l1: "/docs/sharing" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="burn" title={<T k="docs.send.a15" />}>
        <DocP>
          <T k="docs.send.p14" />
        </DocP>
      </DocSection>

      <DocSection id="privacy" title={<T k="docs.send.a18" />}>
        <DocNote type="security" title={<T k="docs.send.a17" />}>
          <T k="docs.send.p16" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.send.a21" />}>
        <DocList
          items={[
            <T
              key="docs.send.p19"
              k="docs.send.p19"
              links={{ l1: "/docs/pad" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.send.p20"
              k="docs.send.p20"
              links={{ l1: "/docs/sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
