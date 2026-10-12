import { pageMetadata } from "@/lib/page-metadata";
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
export const metadata = pageMetadata({
  title: "Encryption model · Docs",
  description:
    "The exact cryptography behind zcrypt: AES-256-GCM with envelope encryption, PBKDF2-HMAC-SHA256 at 600,000 iterations, a random per-file content key, X25519 ECIES sealed-boxes for zero-knowledge sharing, and client-side zstd compression: all performed on your device before anything leaves it.",
  path: "/docs/security",
  ogDescription:
    "AES-256-GCM, envelope encryption, PBKDF2 at 600k iterations, per-file content keys, and X25519 sealed-boxes for sharing: the precise cryptography zcrypt runs on your device.",
});

const toc = [
  { id: "primitives", k: "docs.security.toc.primitives" },
  { id: "envelope", k: "docs.security.toc.envelope" },
  { id: "sharing", k: "docs.security.toc.sharing" },
  { id: "derivation", k: "docs.security.toc.derivation" },
  { id: "pipeline", k: "docs.security.toc.pipeline" },
  { id: "chunks", k: "docs.security.toc.chunks" },
  { id: "next", k: "docs.security.toc.next" },
];

export default function EncryptionModelPage() {
  return (
    <DocPage
      href="/docs/security"
      title="Encryption model"
      description="Everything in zcrypt is encrypted on your device before it touches the network. This page documents exactly which algorithms run, in what order, and where each key lives, no hand-waving."
      toc={toc}
    >
      <DocSection id="primitives" title={<T k="docs.security.a18" />}>
        <DocP>
          <T k="docs.security.p1" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.security.p2" k="docs.security.p2" />,
            <T key="docs.security.p3" k="docs.security.p3" />,
            <T key="docs.security.p4" k="docs.security.p4" />,
          ]}
          rows={[
            [
              <T key="docs.security.p5" k="docs.security.p5" />,
              <span key="a" className="font-mono">
                AES-256-GCM
              </span>,
              <T key="docs.security.p6" k="docs.security.p6" />,
            ],
            [
              <T key="docs.security.p7" k="docs.security.p7" />,
              <span key="b" className="font-mono">
                PBKDF2-HMAC-SHA256
              </span>,
              <T key="docs.security.p8" k="docs.security.p8" />,
            ],
            [
              <T key="docs.security.p9" k="docs.security.p9" />,
              <span key="c" className="font-mono">
                SHA-256
              </span>,
              <T key="docs.security.p10" k="docs.security.p10" />,
            ],
            [
              <T key="docs.security.p11" k="docs.security.p11" />,
              <span key="e" className="font-mono">
                X25519 + AES-256-GCM
              </span>,
              <T key="docs.security.p12" k="docs.security.p12" />,
            ],
            [
              <T key="docs.security.p13" k="docs.security.p13" />,
              <span key="d" className="font-mono">
                HKDF-SHA256 + AES-256-GCM
              </span>,
              <T key="docs.security.p14" k="docs.security.p14" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.security.a16" />}>
          <T k="docs.security.p15" />
        </DocNote>
        <DocP>
          <T
            k="docs.security.p17"
            links={{ l1: "/docs/zero-knowledge" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="envelope" title={<T k="docs.security.a26" />}>
        <DocP>
          <T k="docs.security.p19" />
        </DocP>
        <DocList
          items={[
            <T key="docs.security.p20" k="docs.security.p20" />,
            <T key="docs.security.p21" k="docs.security.p21" />,
            <T key="docs.security.p22" k="docs.security.p22" />,
          ]}
        />
        <DocP>
          <T
            k="docs.security.p23"
            links={{ l1: "/docs/folder-encryption", l2: "#sharing", l3: "/docs/key-management" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocNote type="security" title={<T k="docs.security.a25" />}>
          <T k="docs.security.p24" />
        </DocNote>
      </DocSection>

      <DocSection id="sharing" title={<T k="docs.security.a34" />}>
        <DocP>
          <T k="docs.security.p27" />
        </DocP>
        <DocP>
          <T
            k="docs.security.p28"
            links={{ l1: "/docs/shared-vaults" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocCode
          label={<T k="docs.security.a30" />}
        >{`eph     = X25519 keygen()                          // fresh per seal
shared  = X25519(eph.private, recipientPublicKey)  // ECDH
aesKey  = SHA-256(shared || eph.public || recipientPublicKey)
sealed  = eph.public || AES-256-GCM(key = aesKey, plaintext = spaceKey)`}</DocCode>
        <DocP>
          <T k="docs.security.p31" />
        </DocP>
        <DocNote type="security" title={<T k="docs.security.a33" />}>
          <T
            k="docs.security.p32"
            links={{ l1: "/docs/key-management" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="derivation" title={<T k="docs.security.a39" />}>
        <DocP>
          <T k="docs.security.p35" />
        </DocP>
        <DocCode
          label={<T k="docs.security.a37" />}
        >{`salt = random(32 bytes)                       // unique per file
KEK  = PBKDF2-HMAC-SHA256(passphrase, salt,    // 600,000 iterations
                          iter = 600000,
                          dkLen = 32)
CEK  = random(32 bytes)                        // unique per file
wrappedCEK = AES-256-GCM(key = KEK, plaintext = CEK)`}</DocCode>
        <DocP>
          <T k="docs.security.p38" />
        </DocP>
      </DocSection>

      <DocSection id="pipeline" title={<T k="docs.security.a47" />}>
        <DocP>
          <T k="docs.security.p40" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.security.p41" k="docs.security.p41" />,
            <T key="docs.security.p42" k="docs.security.p42" />,
            <T key="docs.security.p43" k="docs.security.p43" />,
            <T key="docs.security.p44" k="docs.security.p44" />,
          ]}
        />
        <DocNote type="warning" title={<T k="docs.security.a46" />}>
          <T k="docs.security.p45" />
        </DocNote>
      </DocSection>

      <DocSection id="chunks" title={<T k="docs.security.a55" />}>
        <DocP>
          <T k="docs.security.p48" />
        </DocP>
        <DocList
          items={[
            <T key="docs.security.p49" k="docs.security.p49" />,
            <T key="docs.security.p50" k="docs.security.p50" />,
            <T key="docs.security.p51" k="docs.security.p51" />,
            <T key="docs.security.p52" k="docs.security.p52" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.security.a54" />}>
          <T k="docs.security.p53" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.security.a61" />}>
        <DocP>
          <T k="docs.security.p56" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.security.p57"
              k="docs.security.p57"
              links={{ l1: "/docs/zero-knowledge" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.security.p58"
              k="docs.security.p58"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.security.p59"
              k="docs.security.p59"
              links={{ l1: "/docs/threat-model" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.security.p60"
              k="docs.security.p60"
              links={{ l1: "/features/encryption" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
