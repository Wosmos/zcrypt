import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Limits & transfer allowance · Docs",
  description:
    "What zcrypt caps and what it doesn't: your own storage is yours, and only what passes through zcrypt's server counts against a daily and a monthly transfer allowance. What happens when Telegram is blocked.",
  path: "/docs/limits",
  ogDescription:
    "Your own storage is never capped. Transfers through zcrypt's server use a daily and a monthly allowance, and a blocked Telegram pauses a transfer until a VPN is on.",
});

const toc = [
  { id: "own", k: "docs.limits.toc.own" },
  { id: "allowance", k: "docs.limits.toc.allowance" },
  { id: "counts", k: "docs.limits.toc.counts" },
  { id: "blocked", k: "docs.limits.toc.blocked" },
  { id: "where", k: "docs.limits.toc.where" },
  { id: "next", k: "docs.limits.toc.next" },
];

const link = "text-cyan-600 hover:underline dark:text-cyan-400";

export default function LimitsDocPage() {
  return (
    <DocPage
      href="/docs/limits"
      title="Limits & transfer allowance"
      description="Your own storage is yours and zcrypt doesn't cap it. What is capped is what passes through our server, with a daily and a monthly transfer allowance."
      toc={toc}
    >
      <DocSection id="own" title={<T k="docs.limits.a1" />}>
        <DocP>
          <T k="docs.limits.p1" />
        </DocP>
      </DocSection>

      <DocSection id="allowance" title={<T k="docs.limits.a2" />}>
        <DocP>
          <T k="docs.limits.p2" />
        </DocP>
        <DocP>
          <T k="docs.limits.p3" />
        </DocP>
      </DocSection>

      <DocSection id="counts" title={<T k="docs.limits.a3" />}>
        <DocList
          items={[
            <T key="docs.limits.p4" k="docs.limits.p4" />,
            <T key="docs.limits.p5" k="docs.limits.p5" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.limits.a4" />}>
          <T k="docs.limits.p6" />
        </DocNote>
      </DocSection>

      <DocSection id="blocked" title={<T k="docs.limits.a5" />}>
        <DocP>
          <T k="docs.limits.p7" />
        </DocP>
        <DocList
          items={[
            <T key="docs.limits.p8" k="docs.limits.p8" />,
            <T key="docs.limits.p9" k="docs.limits.p9" />,
            <T key="docs.limits.p10" k="docs.limits.p10" />,
          ]}
        />
      </DocSection>

      <DocSection id="where" title={<T k="docs.limits.a6" />}>
        <DocP>
          <T k="docs.limits.p11" links={{ l1: "/settings?tab=storage" }} linkClassName={link} />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.limits.a7" />}>
        <DocList
          items={[
            <T
              key="docs.limits.p12"
              k="docs.limits.p12"
              links={{ l1: "/docs/uploading" }}
              linkClassName={link}
            />,
            <T
              key="docs.limits.p13"
              k="docs.limits.p13"
              links={{ l1: "/docs/transfer-manager" }}
              linkClassName={link}
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
