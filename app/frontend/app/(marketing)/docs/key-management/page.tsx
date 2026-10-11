import type { Metadata } from "next";

import { SITE_URL } from "@/lib/site";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Passphrase & key management | zcrypt Docs",
  description:
    "How keys flow through zcrypt: the vault passphrase that never leaves your device, a per-user X25519 sharing keypair whose private half is wrapped under that passphrase, account login secured with bcrypt and TOTP, JWTs with algorithm-confusion defenses and version-based revocation, and hashed refresh tokens.",
  alternates: { canonical: `${SITE_URL}/docs/key-management` },
  openGraph: {
    title: "Passphrase & key management | zcrypt Docs",
    description:
      "The two secrets in zcrypt (your vault passphrase and your account password) plus the X25519 sharing keypair derived from your passphrase, and exactly how each is handled, hardened, and revoked.",
    url: `${SITE_URL}/docs/key-management`,
  },
};

const toc = [
  { id: "two-secrets", k: "docs.key-management.toc.two-secrets" },
  { id: "passphrase", k: "docs.key-management.toc.passphrase" },
  { id: "sharing-keypair", k: "docs.key-management.toc.sharing-keypair" },
  { id: "account", k: "docs.key-management.toc.account" },
  { id: "sessions", k: "docs.key-management.toc.sessions" },
  { id: "revocation", k: "docs.key-management.toc.revocation" },
  { id: "next", k: "docs.key-management.toc.next" },
];

export default function KeyManagementPage() {
  return (
    <DocPage
      href="/docs/key-management"
      title="Passphrase & key management"
      description="zcrypt keeps two secrets cleanly separate: the passphrase that unlocks your encryption, and the password that authenticates your account. This page traces both, and the defenses around the sessions in between."
      toc={toc}
    >
      <DocSection id="two-secrets" title={<T k="docs.key-management.a18" />}>
        <DocP>
          <T k="docs.key-management.p1" />
        </DocP>
        <DocTable
          head={[
            "",
            <T key="docs.key-management.p2" k="docs.key-management.p2" />,
            <T key="docs.key-management.p3" k="docs.key-management.p3" />,
          ]}
          rows={[
            [
              <T key="docs.key-management.p4" k="docs.key-management.p4" />,
              <T key="docs.key-management.p5" k="docs.key-management.p5" />,
              <T key="docs.key-management.p6" k="docs.key-management.p6" />,
            ],
            [
              <T key="docs.key-management.p7" k="docs.key-management.p7" />,
              <T key="docs.key-management.p8" k="docs.key-management.p8" />,
              <T key="docs.key-management.p9" k="docs.key-management.p9" />,
            ],
            [
              <T key="docs.key-management.p10" k="docs.key-management.p10" />,
              <T key="docs.key-management.p11" k="docs.key-management.p11" />,
              <T key="docs.key-management.p12" k="docs.key-management.p12" />,
            ],
            [
              <T key="docs.key-management.p13" k="docs.key-management.p13" />,
              <T key="docs.key-management.p14" k="docs.key-management.p14" />,
              <T key="docs.key-management.p15" k="docs.key-management.p15" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.key-management.a17" />}>
          <T k="docs.key-management.p16" />
        </DocNote>
      </DocSection>

      <DocSection id="passphrase" title={<T k="docs.key-management.a25" />}>
        <DocP>
          <T
            k="docs.key-management.p19"
            links={{ l1: "/docs/security" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocList
          items={[
            <T key="docs.key-management.p20" k="docs.key-management.p20" />,
            <T key="docs.key-management.p21" k="docs.key-management.p21" />,
            <T key="docs.key-management.p22" k="docs.key-management.p22" />,
          ]}
        />
        <DocP>
          <T k="docs.key-management.p62" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.key-management.a24" />}>
          <T k="docs.key-management.p23" />
        </DocNote>
      </DocSection>

      <DocSection id="sharing-keypair" title={<T k="docs.key-management.a35" />}>
        <DocP>
          <T k="docs.key-management.p26" />
        </DocP>
        <DocList
          items={[
            <T key="docs.key-management.p27" k="docs.key-management.p27" />,
            <T key="docs.key-management.p28" k="docs.key-management.p28" />,
            <T key="docs.key-management.p29" k="docs.key-management.p29" />,
          ]}
        />
        <DocP>
          <T k="docs.key-management.p30" />
        </DocP>
        <DocNote type="security" title={<T k="docs.key-management.a32" />}>
          <T
            k="docs.key-management.p31"
            links={{ l1: "/docs/security" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
        <DocNote type="warning" title={<T k="docs.key-management.a34" />}>
          <T k="docs.key-management.p33" />
        </DocNote>
      </DocSection>

      <DocSection id="account" title={<T k="docs.key-management.a42" />}>
        <DocSubsection title={<T k="docs.key-management.a37" />}>
          <DocP>
            <T k="docs.key-management.p36" />
          </DocP>
        </DocSubsection>
        <DocSubsection title={<T k="docs.key-management.a39" />}>
          <DocP>
            <T k="docs.key-management.p38" />
          </DocP>
        </DocSubsection>
        <DocSubsection title={<T k="docs.key-management.a41" />}>
          <DocP>
            <T k="docs.key-management.p40" />
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="sessions" title={<T k="docs.key-management.a48" />}>
        <DocP>
          <T k="docs.key-management.p43" />
        </DocP>
        <DocList
          items={[
            <T key="docs.key-management.p44" k="docs.key-management.p44" />,
            <T key="docs.key-management.p45" k="docs.key-management.p45" />,
            <T key="docs.key-management.p46" k="docs.key-management.p46" />,
            <T key="docs.key-management.p47" k="docs.key-management.p47" />,
          ]}
        />
      </DocSection>

      <DocSection id="revocation" title={<T k="docs.key-management.a55" />}>
        <DocP>
          <T k="docs.key-management.p49" />
        </DocP>
        <DocList
          items={[
            <T key="docs.key-management.p50" k="docs.key-management.p50" />,
            <T key="docs.key-management.p51" k="docs.key-management.p51" />,
            <T key="docs.key-management.p52" k="docs.key-management.p52" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.key-management.a54" />}>
          <T k="docs.key-management.p53" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.key-management.a60" />}>
        <DocList
          items={[
            <T
              key="docs.key-management.p56"
              k="docs.key-management.p56"
              links={{ l1: "/docs/folder-encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.key-management.p57"
              k="docs.key-management.p57"
              links={{ l1: "/docs/shared-vaults" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.key-management.p58"
              k="docs.key-management.p58"
              links={{ l1: "/docs/threat-model" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.key-management.p59"
              k="docs.key-management.p59"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
