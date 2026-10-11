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
  title: "Bring your own storage | zcrypt Docs",
  description:
    "zcrypt has no storage farm of its own. Connect a GitHub, GitLab, Hugging Face, or Telegram account as your encrypted backend: tokens, scopes, and capacities, all explained.",
  alternates: { canonical: `${SITE_URL}/docs/platform-adapters` },
  openGraph: {
    title: "Bring your own storage | zcrypt Docs",
    description:
      "Connect GitHub, GitLab, Hugging Face, or Telegram as your encrypted storage backend: with the tokens, scopes, and capacities for each.",
    url: `${SITE_URL}/docs/platform-adapters`,
  },
};

const toc = [
  { id: "byo", k: "docs.platform-adapters.toc.byo" },
  { id: "backends", k: "docs.platform-adapters.toc.backends" },
  { id: "routing", k: "docs.platform-adapters.toc.routing" },
  { id: "tokens", k: "docs.platform-adapters.toc.tokens" },
  { id: "telegram", k: "docs.platform-adapters.toc.telegram" },
  { id: "reachability", k: "docs.platform-adapters.toc.reachability" },
  { id: "multiple", k: "docs.platform-adapters.toc.multiple" },
  { id: "next", k: "docs.platform-adapters.toc.next" },
];

export default function PlatformAdaptersDocPage() {
  return (
    <DocPage
      href="/docs/platform-adapters"
      title="Bring your own storage"
      description="zcrypt runs no storage farm of its own. Your encrypted chunks live inside accounts you already own (GitHub, GitLab, Hugging Face, or Telegram) so your capacity is whatever free space those platforms give you, and the infrastructure stays under your control."
      toc={toc}
    >
      <DocSection id="byo" title={<T k="docs.platform-adapters.a3" />}>
        <DocP>
          <T k="docs.platform-adapters.p1" />
        </DocP>
        <DocP>
          <T k="docs.platform-adapters.p2" />
        </DocP>
      </DocSection>

      <DocSection id="backends" title={<T k="docs.platform-adapters.a29" />}>
        <DocP>
          <T
            k="docs.platform-adapters.p4"
            links={{ l1: "/docs/repo-pool" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
        <DocTable
          head={[
            <T key="docs.platform-adapters.p5" k="docs.platform-adapters.p5" />,
            <T key="docs.platform-adapters.p6" k="docs.platform-adapters.p6" />,
            <T key="docs.platform-adapters.p7" k="docs.platform-adapters.p7" />,
            <T key="docs.platform-adapters.p8" k="docs.platform-adapters.p8" />,
          ]}
          rows={[
            [
              <T key="docs.platform-adapters.p9" k="docs.platform-adapters.p9" />,
              <T key="docs.platform-adapters.p10" k="docs.platform-adapters.p10" />,
              <T key="docs.platform-adapters.p11" k="docs.platform-adapters.p11" />,
              <T key="docs.platform-adapters.p12" k="docs.platform-adapters.p12" />,
            ],
            [
              <T key="docs.platform-adapters.p13" k="docs.platform-adapters.p13" />,
              <T key="docs.platform-adapters.p14" k="docs.platform-adapters.p14" />,
              <T key="docs.platform-adapters.p15" k="docs.platform-adapters.p15" />,
              <T key="docs.platform-adapters.p16" k="docs.platform-adapters.p16" />,
            ],
            [
              <T key="docs.platform-adapters.p17" k="docs.platform-adapters.p17" />,
              <T key="docs.platform-adapters.p18" k="docs.platform-adapters.p18" />,
              <T key="docs.platform-adapters.p19" k="docs.platform-adapters.p19" />,
              <T key="docs.platform-adapters.p20" k="docs.platform-adapters.p20" />,
            ],
            [
              <T key="docs.platform-adapters.p21" k="docs.platform-adapters.p21" />,
              <T key="docs.platform-adapters.p22" k="docs.platform-adapters.p22" />,
              <T key="docs.platform-adapters.p23" k="docs.platform-adapters.p23" />,
              <T key="docs.platform-adapters.p24" k="docs.platform-adapters.p24" />,
            ],
          ]}
        />
        <DocNote type="info" title={<T k="docs.platform-adapters.a26" />}>
          <T k="docs.platform-adapters.p25" />
        </DocNote>
        <DocNote type="warning" title={<T k="docs.platform-adapters.a28" />}>
          <T k="docs.platform-adapters.p27" />
        </DocNote>
      </DocSection>

      <DocSection id="routing" title={<T k="docs.platform-adapters.a37" />}>
        <DocP>
          <T k="docs.platform-adapters.p30" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.platform-adapters.p31" k="docs.platform-adapters.p31" />,
            <T key="docs.platform-adapters.p32" k="docs.platform-adapters.p32" />,
            <T key="docs.platform-adapters.p33" k="docs.platform-adapters.p33" />,
          ]}
        />
        <DocP>
          <T k="docs.platform-adapters.p34" />
        </DocP>
        <DocNote type="info" title={<T k="docs.platform-adapters.a36" />}>
          <T k="docs.platform-adapters.p35" />
        </DocNote>
      </DocSection>

      <DocSection id="tokens" title={<T k="docs.platform-adapters.a54" />}>
        <DocP>
          <T k="docs.platform-adapters.p38" />
        </DocP>
        <DocTable
          head={[
            <T key="docs.platform-adapters.p39" k="docs.platform-adapters.p39" />,
            <T key="docs.platform-adapters.p40" k="docs.platform-adapters.p40" />,
            <T key="docs.platform-adapters.p41" k="docs.platform-adapters.p41" />,
          ]}
          rows={[
            [
              <T key="docs.platform-adapters.p42" k="docs.platform-adapters.p42" />,
              <T key="docs.platform-adapters.p43" k="docs.platform-adapters.p43" />,
              <code key="s">repo</code>,
            ],
            [
              <T key="docs.platform-adapters.p44" k="docs.platform-adapters.p44" />,
              <T key="docs.platform-adapters.p45" k="docs.platform-adapters.p45" />,
              <span key="s">
                <code>api</code> + <code>write_repository</code>
              </span>,
            ],
            [
              <T key="docs.platform-adapters.p46" k="docs.platform-adapters.p46" />,
              <T key="docs.platform-adapters.p47" k="docs.platform-adapters.p47" />,
              <span key="s">
                <code>write</code>
              </span>,
            ],
            [
              <T key="docs.platform-adapters.p48" k="docs.platform-adapters.p48" />,
              <T key="docs.platform-adapters.p49" k="docs.platform-adapters.p49" />,
              <T key="docs.platform-adapters.p50" k="docs.platform-adapters.p50" />,
            ],
          ]}
        />
        <DocP>
          <T k="docs.platform-adapters.p51" />
        </DocP>
        <DocNote type="security" title={<T k="docs.platform-adapters.a53" />}>
          <T k="docs.platform-adapters.p52" />
        </DocNote>
      </DocSection>

      <DocSection id="telegram" title={<T k="docs.platform-adapters.a61" />}>
        <DocP>
          <T k="docs.platform-adapters.p55" />
        </DocP>
        <DocCode label={<T k="docs.platform-adapters.a57" />}>{`BOT_TOKEN|CHAT_ID

# example
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11|@my_zcrypt_vault`}</DocCode>
        <DocList
          items={[
            <T key="docs.platform-adapters.p58" k="docs.platform-adapters.p58" />,
            <T key="docs.platform-adapters.p59" k="docs.platform-adapters.p59" />,
            <T key="docs.platform-adapters.p60" k="docs.platform-adapters.p60" />,
          ]}
        />
      </DocSection>

      <DocSection id="reachability" title={<T k="docs.platform-adapters.a67" />}>
        <DocP>
          <T k="docs.platform-adapters.p62" />
        </DocP>
        <DocList
          items={[
            <T key="docs.platform-adapters.p63" k="docs.platform-adapters.p63" />,
            <T key="docs.platform-adapters.p64" k="docs.platform-adapters.p64" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.platform-adapters.a66" />}>
          <T k="docs.platform-adapters.p65" />
        </DocNote>
      </DocSection>

      <DocSection id="multiple" title={<T k="docs.platform-adapters.a70" />}>
        <DocP>
          <T k="docs.platform-adapters.p68" />
        </DocP>
        <DocP>
          <T k="docs.platform-adapters.p69" />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.platform-adapters.a75" />}>
        <DocList
          items={[
            <T
              key="docs.platform-adapters.p71"
              k="docs.platform-adapters.p71"
              links={{ l1: "/docs/repo-pool" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.platform-adapters.p72"
              k="docs.platform-adapters.p72"
              links={{ l1: "/docs/connect-storage" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.platform-adapters.p73"
              k="docs.platform-adapters.p73"
              links={{ l1: "/docs/obfuscation" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.platform-adapters.p74"
              k="docs.platform-adapters.p74"
              links={{ l1: "/features/bring-your-own-storage" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
