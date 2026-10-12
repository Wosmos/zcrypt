import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocNote, DocTable } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Core concepts · Docs",
  description:
    "The handful of ideas that make zcrypt work: your vault, your passphrase, folders, per-file keys and envelope encryption, encrypted chunks, the vault lock, and staying unlocked on a device.",
  path: "/docs/concepts",
  ogDescription:
    "Vault, passphrase, folders, per-file keys, chunks, and the vault lock: how the pieces of zcrypt fit together.",
});

const toc = [
  { id: "vault", k: "docs.concepts.toc.vault" },
  { id: "passphrase", k: "docs.concepts.toc.passphrase" },
  { id: "folders", k: "docs.concepts.toc.folders" },
  { id: "files", k: "docs.concepts.toc.files" },
  { id: "chunks", k: "docs.concepts.toc.chunks" },
  { id: "lock", k: "docs.concepts.toc.lock" },
  { id: "stay-unlocked", k: "docs.concepts.toc.stay-unlocked" },
];

export default function ConceptsDocPage() {
  return (
    <DocPage
      href="/docs/concepts"
      title="Core concepts"
      description="A few ideas explain almost everything about how zcrypt works. Understand these and the rest of the product reads itself."
      toc={toc}
    >
      <DocSection id="vault" title={<T k="docs.concepts.a2" />}>
        <DocP>
          <T k="docs.concepts.p1" />
        </DocP>
      </DocSection>

      <DocSection id="passphrase" title={<T k="docs.concepts.a6" />}>
        <DocP>
          <T k="docs.concepts.p3" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.concepts.a5" />}>
          <T
            k="docs.concepts.p4"
            links={{ l1: "/docs/key-management" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="folders" title={<T k="docs.concepts.a9" />}>
        <DocP>
          <T k="docs.concepts.p7" />
        </DocP>
        <DocP>
          <T
            k="docs.concepts.p8"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="files" title={<T k="docs.concepts.a12" />}>
        <DocP>
          <T k="docs.concepts.p10" />
        </DocP>
        <DocP>
          <T k="docs.concepts.p11" />
        </DocP>
      </DocSection>

      <DocSection id="chunks" title={<T k="docs.concepts.a14" />}>
        <DocP>
          <T k="docs.concepts.p13" />
        </DocP>
      </DocSection>

      <DocSection id="lock" title={<T k="docs.concepts.a17" />}>
        <DocP>
          <T k="docs.concepts.p15" />
        </DocP>
        <DocP>
          <T k="docs.concepts.p16" />
        </DocP>
      </DocSection>

      <DocSection id="stay-unlocked" title={<T k="docs.concepts.a31" />}>
        <DocP>
          <T k="docs.concepts.p18" />
        </DocP>
        <DocTable
          head={[
            "",
            <T key="docs.concepts.p19" k="docs.concepts.p19" />,
            <T key="docs.concepts.p20" k="docs.concepts.p20" />,
          ]}
          rows={[
            [
              <T key="docs.concepts.p21" k="docs.concepts.p21" />,
              <T key="docs.concepts.p22" k="docs.concepts.p22" />,
              <T key="docs.concepts.p23" k="docs.concepts.p23" />,
            ],
            [
              <T key="docs.concepts.p24" k="docs.concepts.p24" />,
              <T key="docs.concepts.p25" k="docs.concepts.p25" />,
              <T key="docs.concepts.p26" k="docs.concepts.p26" />,
            ],
            [
              <T key="docs.concepts.p27" k="docs.concepts.p27" />,
              "n/a",
              <T key="docs.concepts.p28" k="docs.concepts.p28" />,
            ],
          ]}
        />
        <DocNote type="security" title={<T k="docs.concepts.a30" />}>
          <T k="docs.concepts.p29" />
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
