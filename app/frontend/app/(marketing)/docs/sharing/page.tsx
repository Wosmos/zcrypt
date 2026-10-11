import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Share links | zcrypt Docs",
  description:
    "Create a share link for any file in zcrypt. The decryption key lives only in the URL fragment, so the server never sees it. Add an optional password, expiry, and download limit, and revoke anytime.",
  alternates: { canonical: `${SITE_URL}/docs/sharing` },
  openGraph: {
    title: "Share links | zcrypt Docs",
    description:
      "Share a file with an optional password, expiry, and download limit: the decryption key stays in the link fragment, never on the server.",
    url: `${SITE_URL}/docs/sharing`,
  },
};

const toc = [
  { id: "create", k: "docs.sharing.toc.create" },
  { id: "key-in-fragment", k: "docs.sharing.toc.key-in-fragment" },
  { id: "options", k: "docs.sharing.toc.options" },
  { id: "recipient", k: "docs.sharing.toc.recipient" },
  { id: "revoke", k: "docs.sharing.toc.revoke" },
  { id: "counter", k: "docs.sharing.toc.counter" },
  { id: "next", k: "docs.sharing.toc.next" },
];

export default function SharingDocPage() {
  return (
    <DocPage
      href="/docs/sharing"
      title="Share links"
      description="Hand a single file to someone with a link. zcrypt puts the decryption key in the part of the URL that never reaches our servers, so the share stays zero-knowledge, and you stay in control with optional passwords, expiry, limits, and instant revocation."
      toc={toc}
    >
      <DocSection id="create" title={<T k="docs.sharing.a5" />}>
        <DocP>
          <T k="docs.sharing.p1" />
        </DocP>
        <DocP>
          <T k="docs.sharing.p2" />
        </DocP>
        <DocCode label={<T k="docs.sharing.a3" />}>{`${SITE_URL}/s/<token>#<decryption-key>
                         └── sent to server   └── never sent`}</DocCode>
        <DocP>
          <T
            k="docs.sharing.p4"
            links={{ l1: "/docs/folder-sharing" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="key-in-fragment" title={<T k="docs.sharing.a9" />}>
        <DocP>
          <T k="docs.sharing.p6" />
        </DocP>
        <DocNote type="security" title={<T k="docs.sharing.a8" />}>
          <T k="docs.sharing.p7" />
        </DocNote>
      </DocSection>

      <DocSection id="options" title={<T k="docs.sharing.a19" />}>
        <DocP>
          <T k="docs.sharing.p10" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.sharing.p11" k="docs.sharing.p11" />,
            <T key="docs.sharing.p12" k="docs.sharing.p12" />,
          ]}
          rows={[
            [
              <T key="docs.sharing.p13" k="docs.sharing.p13" />,
              <T key="docs.sharing.p14" k="docs.sharing.p14" />,
            ],
            [
              <T key="docs.sharing.p15" k="docs.sharing.p15" />,
              <T key="docs.sharing.p16" k="docs.sharing.p16" />,
            ],
            [
              <T key="docs.sharing.p17" k="docs.sharing.p17" />,
              <T key="docs.sharing.p18" k="docs.sharing.p18" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="recipient" title={<T k="docs.sharing.a23" />}>
        <DocP>
          <T k="docs.sharing.p20" />
        </DocP>
        <DocList
          items={[
            <T key="docs.sharing.p21" k="docs.sharing.p21" />,
            <T key="docs.sharing.p22" k="docs.sharing.p22" />,
          ]}
        />
      </DocSection>

      <DocSection id="revoke" title={<T k="docs.sharing.a25" />}>
        <DocP>
          <T k="docs.sharing.p24" />
        </DocP>
      </DocSection>

      <DocSection id="counter" title={<T k="docs.sharing.a28" />}>
        <DocNote type="info" title={<T k="docs.sharing.a27" />}>
          <T k="docs.sharing.p26" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.sharing.a35" />}>
        <DocP>
          <T k="docs.sharing.p29" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.sharing.p30"
              k="docs.sharing.p30"
              links={{ l1: "/docs/folder-sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sharing.p31"
              k="docs.sharing.p31"
              links={{ l1: "/docs/send" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sharing.p32"
              k="docs.sharing.p32"
              links={{ l1: "/docs/pad" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sharing.p33"
              k="docs.sharing.p33"
              links={{ l1: "/docs/sync-transfer" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.sharing.p34"
              k="docs.sharing.p34"
              links={{ l1: "/features/sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
