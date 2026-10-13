import { pageMetadata } from "@/lib/page-metadata";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Shared vaults · Docs",
  description:
    "Shared vaults (spaces) let you collaborate on end-to-end encrypted files with people you name. Each space has its own key, sealed to every member's public key with ECIES so the server never sees it; files are re-wrapped under the space key, members are verified by key fingerprint, and removing someone rotates the key for true revocation.",
  path: "/docs/shared-vaults",
  ogDescription:
    "Collaborate on end-to-end encrypted files: per-member sealed key grants, CEK re-wrapping under a space key, fingerprint verification, and true revocation via key rotation.",
});

const toc = [
  { id: "what", k: "docs.shared-vaults.toc.what" },
  { id: "crypto", k: "docs.shared-vaults.toc.crypto" },
  { id: "roles", k: "docs.shared-vaults.toc.roles" },
  { id: "members", k: "docs.shared-vaults.toc.members" },
  { id: "files", k: "docs.shared-vaults.toc.files" },
  { id: "revocation", k: "docs.shared-vaults.toc.revocation" },
  { id: "status", k: "docs.shared-vaults.toc.status" },
  { id: "next", k: "docs.shared-vaults.toc.next" },
];

export default function SharedVaultsDocPage() {
  return (
    <DocPage
      href="/docs/shared-vaults"
      title="Shared vaults"
      description="Shared vaults (spaces) let a group work on the same set of end-to-end encrypted files. Each space carries its own key, sealed to every member so only members can open its files, and the server only ever holds ciphertext it cannot read."
      badge="Beta"
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.shared-vaults.a5" />}>
        <DocP>
          <T k="docs.shared-vaults.p1" />
        </DocP>
        <DocP>
          <T k="docs.shared-vaults.p2" />
        </DocP>
        <DocNote type="security" title={<T k="docs.shared-vaults.a4" />}>
          <T k="docs.shared-vaults.p3" />
        </DocNote>
      </DocSection>

      <DocSection id="crypto" title={<T k="docs.shared-vaults.a16" />}>
        <DocP>
          <T k="docs.shared-vaults.p6" />
        </DocP>

        <DocSubsection title={<T k="docs.shared-vaults.a8" />}>
          <DocP>
            <T k="docs.shared-vaults.p7" />
          </DocP>
        </DocSubsection>

        <DocSubsection title={<T k="docs.shared-vaults.a13" />}>
          <DocP>
            <T k="docs.shared-vaults.p9" />
          </DocP>
          <DocCode label={<T k="docs.shared-vaults.a11" />}>
            {`ephemeralPublicKey[32]  ||  AES-256-GCM( 12B IV || ciphertext || 16B tag )`}
          </DocCode>
          <DocP>
            <T k="docs.shared-vaults.p12" />
          </DocP>
        </DocSubsection>

        <DocSubsection title={<T k="docs.shared-vaults.a15" />}>
          <DocP>
            <T k="docs.shared-vaults.p14" />
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="roles" title={<T k="docs.shared-vaults.a29" />}>
        <DocP>
          <T k="docs.shared-vaults.p17" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.shared-vaults.p18" k="docs.shared-vaults.p18" />,
            <T key="docs.shared-vaults.p19" k="docs.shared-vaults.p19" />,
          ]}
          rows={[
            [
              <T key="docs.shared-vaults.p20" k="docs.shared-vaults.p20" />,
              <T key="docs.shared-vaults.p21" k="docs.shared-vaults.p21" />,
            ],
            [
              <T key="docs.shared-vaults.p22" k="docs.shared-vaults.p22" />,
              <T key="docs.shared-vaults.p23" k="docs.shared-vaults.p23" />,
            ],
            [
              <T key="docs.shared-vaults.p24" k="docs.shared-vaults.p24" />,
              <T key="docs.shared-vaults.p25" k="docs.shared-vaults.p25" />,
            ],
          ]}
        />
        <DocP>
          <T k="docs.shared-vaults.p26" />
        </DocP>
        <DocNote type="info" title={<T k="docs.shared-vaults.a28" />}>
          <T k="docs.shared-vaults.p27" />
        </DocNote>
      </DocSection>

      <DocSection id="members" title={<T k="docs.shared-vaults.a36" />}>
        <DocList
          items={[
            <T key="docs.shared-vaults.p30" k="docs.shared-vaults.p30" />,
            <T key="docs.shared-vaults.p31" k="docs.shared-vaults.p31" />,
            <T key="docs.shared-vaults.p32" k="docs.shared-vaults.p32" />,
            <T key="docs.shared-vaults.p33" k="docs.shared-vaults.p33" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.shared-vaults.a35" />}>
          <T k="docs.shared-vaults.p34" />
        </DocNote>
      </DocSection>

      <DocSection id="files" title={<T k="docs.shared-vaults.a41" />}>
        <DocList
          items={[
            <T key="docs.shared-vaults.p37" k="docs.shared-vaults.p37" />,
            <T key="docs.shared-vaults.p38" k="docs.shared-vaults.p38" />,
            <T key="docs.shared-vaults.p39" k="docs.shared-vaults.p39" />,
          ]}
        />
        <DocP>
          <T k="docs.shared-vaults.p40" />
        </DocP>
      </DocSection>

      <DocSection id="revocation" title={<T k="docs.shared-vaults.a50" />}>
        <DocP>
          <T k="docs.shared-vaults.p42" />
        </DocP>
        <DocList
          items={[
            <T key="docs.shared-vaults.p43" k="docs.shared-vaults.p43" />,
            <T key="docs.shared-vaults.p44" k="docs.shared-vaults.p44" />,
            <T key="docs.shared-vaults.p45" k="docs.shared-vaults.p45" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.shared-vaults.a47" />}>
          <T k="docs.shared-vaults.p46" />
        </DocNote>
        <DocNote type="warning" title={<T k="docs.shared-vaults.a49" />}>
          <T k="docs.shared-vaults.p48" />
        </DocNote>
      </DocSection>

      <DocSection id="status" title={<T k="docs.shared-vaults.a53" />}>
        <DocNote type="info" title={<T k="docs.shared-vaults.a52" />}>
          <T k="docs.shared-vaults.p51" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.shared-vaults.a57" />}>
        <DocList
          items={[
            <T
              key="docs.shared-vaults.p54"
              k="docs.shared-vaults.p54"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.shared-vaults.p55"
              k="docs.shared-vaults.p55"
              links={{ l1: "/docs/sharing" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.shared-vaults.p56"
              k="docs.shared-vaults.p56"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
