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
  title: "Share a folder | zcrypt Docs",
  description:
    "Share a whole folder with a single public link. Everyone with the link can browse and download the files, read-only, with no account, and it stays end-to-end encrypted because the folder key lives only in the URL fragment. Add an optional password that hides the file listing until it's entered.",
  alternates: { canonical: `${SITE_URL}/docs/folder-sharing` },
  openGraph: {
    title: "Share a folder | zcrypt Docs",
    description:
      "One public link for a whole folder: read-only, no account needed, and still end-to-end encrypted: the folder key never leaves the link fragment.",
    url: `${SITE_URL}/docs/folder-sharing`,
  },
};

const toc = [
  { id: "create", k: "docs.folder-sharing.toc.create" },
  { id: "key-in-fragment", k: "docs.folder-sharing.toc.key-in-fragment" },
  { id: "password", k: "docs.folder-sharing.toc.password" },
  { id: "recipient", k: "docs.folder-sharing.toc.recipient" },
  { id: "options", k: "docs.folder-sharing.toc.options" },
  { id: "vs-vaults", k: "docs.folder-sharing.toc.vs-vaults" },
  { id: "counter", k: "docs.folder-sharing.toc.counter" },
  { id: "next", k: "docs.folder-sharing.toc.next" },
];

export default function FolderSharingDocPage() {
  return (
    <DocPage
      href="/docs/folder-sharing"
      title="Share a folder"
      description="Hand someone a whole folder with one public link. Anyone with the link can browse and download the files read-only, no account required, and it stays zero-knowledge, because the folder's decryption key rides in the part of the URL that never reaches our servers."
      toc={toc}
      badge="New"
    >
      <DocSection id="create" title={<T k="docs.folder-sharing.a5" />}>
        <DocP>
          <T k="docs.folder-sharing.p1" />
        </DocP>
        <DocP>
          <T k="docs.folder-sharing.p2" />
        </DocP>
        <DocNote type="info" title={<T k="docs.folder-sharing.a4" />}>
          <T k="docs.folder-sharing.p3" />
        </DocNote>
      </DocSection>

      <DocSection id="key-in-fragment" title={<T k="docs.folder-sharing.a11" />}>
        <DocP>
          <T
            k="docs.folder-sharing.p6"
            links={{ l1: "/docs/sharing" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocCode
          label={<T k="docs.folder-sharing.a7" />}
        >{`${SITE_URL}/f/<token>#key=<folder-share-key>
                       └── sent to server    └── never sent`}</DocCode>
        <DocP>
          <T k="docs.folder-sharing.p8" />
        </DocP>
        <DocNote type="security" title={<T k="docs.folder-sharing.a10" />}>
          <T k="docs.folder-sharing.p9" />
        </DocNote>
      </DocSection>

      <DocSection id="password" title={<T k="docs.folder-sharing.a15" />}>
        <DocP>
          <T k="docs.folder-sharing.p12" />
        </DocP>
        <DocNote type="info" title={<T k="docs.folder-sharing.a14" />}>
          <T k="docs.folder-sharing.p13" />
        </DocNote>
      </DocSection>

      <DocSection id="recipient" title={<T k="docs.folder-sharing.a20" />}>
        <DocP>
          <T k="docs.folder-sharing.p16" />
        </DocP>
        <DocList
          items={[
            <T key="docs.folder-sharing.p17" k="docs.folder-sharing.p17" />,
            <T key="docs.folder-sharing.p18" k="docs.folder-sharing.p18" />,
            <T key="docs.folder-sharing.p19" k="docs.folder-sharing.p19" />,
          ]}
        />
      </DocSection>

      <DocSection id="options" title={<T k="docs.folder-sharing.a30" />}>
        <DocP>
          <T k="docs.folder-sharing.p21" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.folder-sharing.p22" k="docs.folder-sharing.p22" />,
            <T key="docs.folder-sharing.p23" k="docs.folder-sharing.p23" />,
          ]}
          rows={[
            [
              <T key="docs.folder-sharing.p24" k="docs.folder-sharing.p24" />,
              <T key="docs.folder-sharing.p25" k="docs.folder-sharing.p25" />,
            ],
            [
              <T key="docs.folder-sharing.p26" k="docs.folder-sharing.p26" />,
              <T key="docs.folder-sharing.p27" k="docs.folder-sharing.p27" />,
            ],
            [
              <T key="docs.folder-sharing.p28" k="docs.folder-sharing.p28" />,
              <T key="docs.folder-sharing.p29" k="docs.folder-sharing.p29" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="vs-vaults" title={<T k="docs.folder-sharing.a46" />}>
        <DocP>
          <T
            k="docs.folder-sharing.p31"
            links={{ l1: "/docs/shared-vaults" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocTable
          head={[
            "",
            <T key="docs.folder-sharing.p32" k="docs.folder-sharing.p32" />,
            <T key="docs.folder-sharing.p33" k="docs.folder-sharing.p33" />,
          ]}
          rows={[
            [
              <T key="docs.folder-sharing.p34" k="docs.folder-sharing.p34" />,
              <T key="docs.folder-sharing.p35" k="docs.folder-sharing.p35" />,
              <T key="docs.folder-sharing.p36" k="docs.folder-sharing.p36" />,
            ],
            [
              <T key="docs.folder-sharing.p37" k="docs.folder-sharing.p37" />,
              <T key="docs.folder-sharing.p38" k="docs.folder-sharing.p38" />,
              <T key="docs.folder-sharing.p39" k="docs.folder-sharing.p39" />,
            ],
            [
              <T key="docs.folder-sharing.p40" k="docs.folder-sharing.p40" />,
              <T key="docs.folder-sharing.p41" k="docs.folder-sharing.p41" />,
              <T key="docs.folder-sharing.p42" k="docs.folder-sharing.p42" />,
            ],
            [
              <T key="docs.folder-sharing.p43" k="docs.folder-sharing.p43" />,
              <T key="docs.folder-sharing.p44" k="docs.folder-sharing.p44" />,
              <T key="docs.folder-sharing.p45" k="docs.folder-sharing.p45" />,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="counter" title={<T k="docs.folder-sharing.a49" />}>
        <DocNote type="info" title={<T k="docs.folder-sharing.a48" />}>
          <T k="docs.folder-sharing.p47" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.folder-sharing.a54" />}>
        <DocP>
          <T k="docs.folder-sharing.p50" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.folder-sharing.p51"
              k="docs.folder-sharing.p51"
              links={{ l1: "/docs/sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folder-sharing.p52"
              k="docs.folder-sharing.p52"
              links={{ l1: "/docs/shared-vaults" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folder-sharing.p53"
              k="docs.folder-sharing.p53"
              links={{ l1: "/docs/send" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
