import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote, DocTable } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Connect your storage · Docs",
  description:
    "zcrypt brings your own backend. Connect a GitHub, GitLab, Hugging Face, or Telegram account in Settings, hand it a token, and zcrypt auto-creates and rotates repositories so your space grows on its own.",
  path: "/docs/connect-storage",
  ogDescription:
    "Link a GitHub, GitLab, Hugging Face, or Telegram account as your encrypted storage backend. Tokens are encrypted at rest; capacity grows automatically.",
});

const toc = [
  { id: "byo", k: "docs.connect-storage.toc.byo" },
  { id: "connect", k: "docs.connect-storage.toc.connect" },
  { id: "tokens", k: "docs.connect-storage.toc.tokens" },
  { id: "at-rest", k: "docs.connect-storage.toc.at-rest" },
  { id: "grows", k: "docs.connect-storage.toc.grows" },
  { id: "next", k: "docs.connect-storage.toc.next" },
];

export default function ConnectStorageDocPage() {
  return (
    <DocPage
      href="/docs/connect-storage"
      title="Connect your storage"
      description="zcrypt doesn't sell you storage: you bring an account you already have. Connect a backend once and your encrypted files live there, under your control."
      toc={toc}
    >
      <DocSection id="byo" title={<T k="docs.connect-storage.a2" />}>
        <DocP>
          <T k="docs.connect-storage.p1" />
        </DocP>
      </DocSection>

      <DocSection id="connect" title={<T k="docs.connect-storage.a4" />}>
        <DocP>
          <T k="docs.connect-storage.p3" />
        </DocP>
      </DocSection>

      <DocSection id="tokens" title={<T k="docs.connect-storage.a17" />}>
        <DocP>
          <T k="docs.connect-storage.p5" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.connect-storage.p6" k="docs.connect-storage.p6" />,
            <T key="docs.connect-storage.p7" k="docs.connect-storage.p7" />,
          ]}
          rows={[
            [
              <T key="docs.connect-storage.p8" k="docs.connect-storage.p8" />,
              <T key="docs.connect-storage.p9" k="docs.connect-storage.p9" />,
            ],
            [
              <T key="docs.connect-storage.p10" k="docs.connect-storage.p10" />,
              <T key="docs.connect-storage.p11" k="docs.connect-storage.p11" />,
            ],
            [
              <T key="docs.connect-storage.p12" k="docs.connect-storage.p12" />,
              <T key="docs.connect-storage.p13" k="docs.connect-storage.p13" />,
            ],
            [
              <T key="docs.connect-storage.p14" k="docs.connect-storage.p14" />,
              <T key="docs.connect-storage.p15" k="docs.connect-storage.p15" />,
            ],
          ]}
        />
        <DocP>
          <T
            k="docs.connect-storage.p16"
            links={{ l1: "/docs/platform-adapters" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="at-rest" title={<T k="docs.connect-storage.a21" />}>
        <DocP>
          <T k="docs.connect-storage.p18" />
        </DocP>
        <DocNote type="security" title={<T k="docs.connect-storage.a20" />}>
          <T k="docs.connect-storage.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="grows" title={<T k="docs.connect-storage.a26" />}>
        <DocP>
          <T k="docs.connect-storage.p22" />
        </DocP>
        <DocList
          items={[
            <T key="docs.connect-storage.p23" k="docs.connect-storage.p23" />,
            <T key="docs.connect-storage.p24" k="docs.connect-storage.p24" />,
            <T key="docs.connect-storage.p25" k="docs.connect-storage.p25" />,
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.connect-storage.a29" />}>
        <DocList
          items={[
            <T
              key="docs.connect-storage.p27"
              k="docs.connect-storage.p27"
              links={{ l1: "/docs/platform-adapters" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.connect-storage.p28"
              k="docs.connect-storage.p28"
              links={{ l1: "/docs/repo-pool" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
