import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Dead man's switch · Docs",
  description:
    "Configure zcrypt to email a trusted contact if you stop checking in. Set a timeout of 7 to 365 days; every login resets the timer. It sends a notification email. It does not deliver your files or keys.",
  path: "/docs/dead-mans-switch",
  ogDescription:
    "Notify a trusted contact if you stop checking in. It sends an email: zero-knowledge means there are no keys for it to hand over.",
});

const toc = [
  { id: "what", k: "docs.dead-mans-switch.toc.what" },
  { id: "setup", k: "docs.dead-mans-switch.toc.setup" },
  { id: "checkin", k: "docs.dead-mans-switch.toc.checkin" },
  { id: "honest", k: "docs.dead-mans-switch.toc.honest" },
  { id: "next", k: "docs.dead-mans-switch.toc.next" },
];

export default function DeadMansSwitchDocPage() {
  return (
    <DocPage
      href="/docs/dead-mans-switch"
      title="Dead man's switch"
      description="A safeguard that watches for your absence. If you stop checking in for a period you choose, zcrypt sends a message to a contact you trust: a way to make sure someone is alerted if something happens to you."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.dead-mans-switch.a2" />}>
        <DocP>
          <T k="docs.dead-mans-switch.p1" />
        </DocP>
      </DocSection>

      <DocSection id="setup" title={<T k="docs.dead-mans-switch.a8" />}>
        <DocP>
          <T k="docs.dead-mans-switch.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.dead-mans-switch.p4" k="docs.dead-mans-switch.p4" />,
            <T key="docs.dead-mans-switch.p5" k="docs.dead-mans-switch.p5" />,
            <T key="docs.dead-mans-switch.p6" k="docs.dead-mans-switch.p6" />,
          ]}
        />
        <DocP>
          <T k="docs.dead-mans-switch.p7" />
        </DocP>
      </DocSection>

      <DocSection id="checkin" title={<T k="docs.dead-mans-switch.a10" />}>
        <DocP>
          <T k="docs.dead-mans-switch.p9" />
        </DocP>
      </DocSection>

      <DocSection id="honest" title={<T k="docs.dead-mans-switch.a15" />}>
        <DocNote type="warning" title={<T k="docs.dead-mans-switch.a14" />}>
          <p className="mb-2">
            <T k="docs.dead-mans-switch.p11" />
          </p>
          <p className="mb-2">
            <T k="docs.dead-mans-switch.p12" />
          </p>
          <p>
            <T k="docs.dead-mans-switch.p13" />
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.dead-mans-switch.a19" />}>
        <DocList
          items={[
            <T
              key="docs.dead-mans-switch.p16"
              k="docs.dead-mans-switch.p16"
              links={{ l1: "/docs/decoy-profile" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.dead-mans-switch.p17"
              k="docs.dead-mans-switch.p17"
              links={{ l1: "/docs/recovery" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.dead-mans-switch.p18"
              k="docs.dead-mans-switch.p18"
              links={{ l1: "/features/privacy" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
