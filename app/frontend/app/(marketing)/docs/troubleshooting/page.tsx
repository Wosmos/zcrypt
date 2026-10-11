import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Troubleshooting | zcrypt Docs",
  description:
    "Fixes for common zcrypt issues: a wrong passphrase or stuck unlock, a protected folder that won't open, a stalled but resumable upload, a file too large for a platform, a disconnected or expired storage token, and rate limiting.",
  alternates: { canonical: `${SITE_URL}/docs/troubleshooting` },
  openGraph: {
    title: "Troubleshooting | zcrypt Docs",
    description:
      "Quick fixes for stuck unlocks, protected folders, stalled uploads, oversized files, disconnected tokens, and rate limits.",
    url: `${SITE_URL}/docs/troubleshooting`,
  },
};

const toc = [
  { id: "wrong-passphrase", k: "docs.troubleshooting.toc.wrong-passphrase" },
  { id: "protected-folder", k: "docs.troubleshooting.toc.protected-folder" },
  { id: "upload-stalled", k: "docs.troubleshooting.toc.upload-stalled" },
  { id: "too-large", k: "docs.troubleshooting.toc.too-large" },
  { id: "disconnected", k: "docs.troubleshooting.toc.disconnected" },
  { id: "rate-limited", k: "docs.troubleshooting.toc.rate-limited" },
];

export default function TroubleshootingDocPage() {
  return (
    <DocPage
      href="/docs/troubleshooting"
      title="Troubleshooting"
      description="The handful of issues people hit most, and how to clear them. Most have a simple cause: the wrong key, a transient network hiccup, or a platform limit doing its job."
      toc={toc}
    >
      <DocSection id="wrong-passphrase" title={<T k="docs.troubleshooting.a7" />}>
        <DocP>
          <T k="docs.troubleshooting.p1" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p2" k="docs.troubleshooting.p2" />,
            <T key="docs.troubleshooting.p3" k="docs.troubleshooting.p3" />,
            <T key="docs.troubleshooting.p4" k="docs.troubleshooting.p4" />,
          ]}
        />
        <DocNote type="warning" title={<T k="docs.troubleshooting.a6" />}>
          <T
            k="docs.troubleshooting.p5"
            links={{ l1: "/docs/recovery" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="protected-folder" title={<T k="docs.troubleshooting.a13" />}>
        <DocP>
          <T k="docs.troubleshooting.p8" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p9" k="docs.troubleshooting.p9" />,
            <T key="docs.troubleshooting.p10" k="docs.troubleshooting.p10" />,
            <T key="docs.troubleshooting.p11" k="docs.troubleshooting.p11" />,
          ]}
        />
        <DocP>
          <T
            k="docs.troubleshooting.p12"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="upload-stalled" title={<T k="docs.troubleshooting.a19" />}>
        <DocP>
          <T k="docs.troubleshooting.p14" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p15" k="docs.troubleshooting.p15" />,
            <T key="docs.troubleshooting.p16" k="docs.troubleshooting.p16" />,
            <T key="docs.troubleshooting.p17" k="docs.troubleshooting.p17" />,
          ]}
        />
        <DocP>
          <T
            k="docs.troubleshooting.p18"
            links={{ l1: "/docs/transfer-manager" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="too-large" title={<T k="docs.troubleshooting.a25" />}>
        <DocP>
          <T k="docs.troubleshooting.p20" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p21" k="docs.troubleshooting.p21" />,
            <T key="docs.troubleshooting.p22" k="docs.troubleshooting.p22" />,
            <T key="docs.troubleshooting.p23" k="docs.troubleshooting.p23" />,
          ]}
        />
        <DocP>
          <T
            k="docs.troubleshooting.p24"
            links={{ l1: "/docs/repo-pool" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="disconnected" title={<T k="docs.troubleshooting.a31" />}>
        <DocP>
          <T k="docs.troubleshooting.p26" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p27" k="docs.troubleshooting.p27" />,
            <T key="docs.troubleshooting.p28" k="docs.troubleshooting.p28" />,
            <T key="docs.troubleshooting.p29" k="docs.troubleshooting.p29" />,
          ]}
        />
        <DocP>
          <T
            k="docs.troubleshooting.p30"
            links={{ l1: "/docs/platform-adapters" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="rate-limited" title={<T k="docs.troubleshooting.a38" />}>
        <DocP>
          <T k="docs.troubleshooting.p32" />
        </DocP>
        <DocList
          items={[
            <T key="docs.troubleshooting.p33" k="docs.troubleshooting.p33" />,
            <T key="docs.troubleshooting.p34" k="docs.troubleshooting.p34" />,
            <T key="docs.troubleshooting.p35" k="docs.troubleshooting.p35" />,
          ]}
        />
        <DocNote type="info" title={<T k="docs.troubleshooting.a37" />}>
          <T k="docs.troubleshooting.p36" />
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
