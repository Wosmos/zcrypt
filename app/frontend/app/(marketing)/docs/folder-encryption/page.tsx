import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocCode, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Per-folder encryption | zcrypt Docs",
  description:
    "Give a folder its own password, distinct from your vault passphrase. zcrypt verifies it locally with no server round-trip, re-wraps each file's content key under a folder-derived key, and re-keys files automatically when they cross the boundary.",
  alternates: { canonical: `${SITE_URL}/docs/folder-encryption` },
  openGraph: {
    title: "Per-folder encryption | zcrypt Docs",
    description:
      "A second password layer for sensitive folders: verified on-device, never sent to the server, with automatic re-keying across the boundary.",
    url: `${SITE_URL}/docs/folder-encryption`,
  },
};

const toc = [
  { id: "what", k: "docs.folder-encryption.toc.what" },
  { id: "verify", k: "docs.folder-encryption.toc.verify" },
  { id: "rekey", k: "docs.folder-encryption.toc.rekey" },
  { id: "server", k: "docs.folder-encryption.toc.server" },
  { id: "caveats", k: "docs.folder-encryption.toc.caveats" },
  { id: "next", k: "docs.folder-encryption.toc.next" },
];

export default function FolderEncryptionPage() {
  return (
    <DocPage
      href="/docs/folder-encryption"
      title="Per-folder encryption"
      description="A folder can have its own password, separate from your vault passphrase: a second lock for the things that need one. It is built entirely on the same envelope primitive, and the folder password never leaves your device."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.folder-encryption.a3" />}>
        <DocP>
          <T k="docs.folder-encryption.p1" />
        </DocP>
        <DocP>
          <T
            k="docs.folder-encryption.p2"
            links={{ l1: "/docs/security" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="verify" title={<T k="docs.folder-encryption.a9" />}>
        <DocP>
          <T k="docs.folder-encryption.p4" />
        </DocP>
        <DocCode
          label={<T k="docs.folder-encryption.a6" />}
        >{`pw_salt     = random(32 bytes)                       // per folder
KEK_pw      = PBKDF2-HMAC-SHA256(folder_password, pw_salt, 600000, 32)
pw_verifier = AES-256-GCM(key = KEK_pw, plaintext = "zcrypt-folder-verify-v1")

// later, to verify a typed password, entirely on-device:
AES-256-GCM-open(KEK_pw', pw_verifier) == "zcrypt-folder-verify-v1" ?`}</DocCode>
        <DocNote type="info" title={<T k="docs.folder-encryption.a8" />}>
          <T k="docs.folder-encryption.p7" />
        </DocNote>
      </DocSection>

      <DocSection id="rekey" title={<T k="docs.folder-encryption.a15" />}>
        <DocP>
          <T k="docs.folder-encryption.p10" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.folder-encryption.p11" k="docs.folder-encryption.p11" />,
            <T key="docs.folder-encryption.p12" k="docs.folder-encryption.p12" />,
            <T key="docs.folder-encryption.p13" k="docs.folder-encryption.p13" />,
          ]}
        />
        <DocP>
          <T k="docs.folder-encryption.p14" />
        </DocP>
      </DocSection>

      <DocSection id="server" title={<T k="docs.folder-encryption.a21" />}>
        <DocP>
          <T k="docs.folder-encryption.p16" />
        </DocP>
        <DocList
          items={[
            <T key="docs.folder-encryption.p17" k="docs.folder-encryption.p17" />,
            <T key="docs.folder-encryption.p18" k="docs.folder-encryption.p18" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.folder-encryption.a20" />}>
          <T k="docs.folder-encryption.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="caveats" title={<T k="docs.folder-encryption.a25" />}>
        <DocList
          items={[
            <T key="docs.folder-encryption.p22" k="docs.folder-encryption.p22" />,
            <T key="docs.folder-encryption.p23" k="docs.folder-encryption.p23" />,
            <T key="docs.folder-encryption.p24" k="docs.folder-encryption.p24" />,
          ]}
        />
      </DocSection>

      <DocSection id="next" title={<T k="docs.folder-encryption.a30" />}>
        <DocList
          items={[
            <T
              key="docs.folder-encryption.p26"
              k="docs.folder-encryption.p26"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folder-encryption.p27"
              k="docs.folder-encryption.p27"
              links={{ l1: "/docs/folders" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folder-encryption.p28"
              k="docs.folder-encryption.p28"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.folder-encryption.p29"
              k="docs.folder-encryption.p29"
              links={{ l1: "/features/folders" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
