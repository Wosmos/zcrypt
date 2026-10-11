import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Account recovery | zcrypt Docs",
  description:
    "What zcrypt can and cannot recover. Account access can be restored through email password reset and two-factor. Your vault passphrase and folder passwords are zero-knowledge: lose them and no one (including us) can decrypt your files.",
  alternates: { canonical: `${SITE_URL}/docs/recovery` },
  openGraph: {
    title: "Account recovery | zcrypt Docs",
    description:
      "Account access is recoverable; your vault passphrase and folder passwords are not. The exact line between the two, and how to protect what can't be recovered.",
    url: `${SITE_URL}/docs/recovery`,
  },
};

const toc = [
  { id: "two-things", k: "docs.recovery.toc.two-things" },
  { id: "recoverable", k: "docs.recovery.toc.recoverable" },
  { id: "not-recoverable", k: "docs.recovery.toc.not-recoverable" },
  { id: "protect", k: "docs.recovery.toc.protect" },
  { id: "next", k: "docs.recovery.toc.next" },
];

export default function RecoveryDocPage() {
  return (
    <DocPage
      href="/docs/recovery"
      title="Account recovery"
      description="zcrypt is zero-knowledge by design, which makes recovery a two-sided story: getting back into your account is routine, but getting back the secret that decrypts your files is impossible if you lose it."
      toc={toc}
    >
      <DocSection id="two-things" title={<T k="docs.recovery.a13" />}>
        <DocP>
          <T k="docs.recovery.p1" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.recovery.p2" k="docs.recovery.p2" />,
            <T key="docs.recovery.p3" k="docs.recovery.p3" />,
            <T key="docs.recovery.p4" k="docs.recovery.p4" />,
          ]}
          rows={[
            [
              <T key="docs.recovery.p5" k="docs.recovery.p5" />,
              <span key="a2" className="text-cyan-600 dark:text-cyan-400">
                <T k="docs.recovery.yes" />
              </span>,
              <T key="docs.recovery.p6" k="docs.recovery.p6" />,
            ],
            [
              <T key="docs.recovery.p7" k="docs.recovery.p7" />,
              <span key="b2" className="text-cyan-600 dark:text-cyan-400">
                <T k="docs.recovery.yesCare" />
              </span>,
              <T key="docs.recovery.p8" k="docs.recovery.p8" />,
            ],
            [
              <T key="docs.recovery.p9" k="docs.recovery.p9" />,
              <span key="c2" className="text-amber-600 dark:text-amber-400">
                <T k="docs.recovery.no" />
              </span>,
              <T key="docs.recovery.p10" k="docs.recovery.p10" />,
            ],
            [
              <T key="docs.recovery.p11" k="docs.recovery.p11" />,
              <span key="d2" className="text-amber-600 dark:text-amber-400">
                <T k="docs.recovery.no" />
              </span>,
              <T key="docs.recovery.p12" k="docs.recovery.p12" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="recoverable" title={<T k="docs.recovery.a19" />}>
        <DocP>
          <T k="docs.recovery.p14" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.recovery.p15"
              k="docs.recovery.p15"
              links={{ l1: "/docs/authentication" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.recovery.p16"
              k="docs.recovery.p16"
              links={{ l1: "/docs/oauth" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.recovery.p17" k="docs.recovery.p17" />,
          ]}
        />
        <DocP>
          <T k="docs.recovery.p18" />
        </DocP>
      </DocSection>

      <DocSection id="not-recoverable" title={<T k="docs.recovery.a24" />}>
        <DocP>
          <T k="docs.recovery.p20" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.recovery.a23" />}>
          <p className="mb-2">
            <T k="docs.recovery.p21" />
          </p>
          <p>
            <T k="docs.recovery.p22" />
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="protect" title={<T k="docs.recovery.a31" />}>
        <DocP>
          <T k="docs.recovery.p25" />
        </DocP>
        <DocList
          items={[
            <T key="docs.recovery.p26" k="docs.recovery.p26" />,
            <T key="docs.recovery.p27" k="docs.recovery.p27" />,
            <T key="docs.recovery.p28" k="docs.recovery.p28" />,
            <T key="docs.recovery.p29" k="docs.recovery.p29" />,
          ]}
        />
        <DocNote type="info">
          <T k="docs.recovery.p30" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.recovery.a35" />}>
        <DocList
          items={[
            <T
              key="docs.recovery.p32"
              k="docs.recovery.p32"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.recovery.p33"
              k="docs.recovery.p33"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.recovery.p34"
              k="docs.recovery.p34"
              links={{ l1: "/docs/authentication" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
