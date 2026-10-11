import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Decoy profile | zcrypt Docs",
  description:
    "Set a second decoy password in zcrypt that, at login, opens an innocent-looking vault of fake files instead of your real one: for coercion or border situations where you may be forced to unlock.",
  alternates: { canonical: `${SITE_URL}/docs/decoy-profile` },
  openGraph: {
    title: "Decoy profile | zcrypt Docs",
    description:
      "A second password that opens a believable decoy vault of fake files: plausible deniability for high-pressure situations.",
    url: `${SITE_URL}/docs/decoy-profile`,
  },
};

const toc = [
  { id: "what", k: "docs.decoy-profile.toc.what" },
  { id: "setup", k: "docs.decoy-profile.toc.setup" },
  { id: "files", k: "docs.decoy-profile.toc.files" },
  { id: "login", k: "docs.decoy-profile.toc.login" },
  { id: "caveats", k: "docs.decoy-profile.toc.caveats" },
  { id: "next", k: "docs.decoy-profile.toc.next" },
];

export default function DecoyProfileDocPage() {
  return (
    <DocPage
      href="/docs/decoy-profile"
      title="Decoy profile"
      description="A second password that opens a believable, innocent-looking vault instead of your real one. If you're ever pressured (at a border, in a search, under coercion) you can unlock something that looks complete without exposing what actually matters."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.decoy-profile.a3" />}>
        <DocP>
          <T k="docs.decoy-profile.p1" />
        </DocP>
        <DocP>
          <T k="docs.decoy-profile.p2" />
        </DocP>
      </DocSection>

      <DocSection id="setup" title={<T k="docs.decoy-profile.a8" />}>
        <DocP>
          <T k="docs.decoy-profile.p4" />
        </DocP>
        <DocList
          items={[
            <T key="docs.decoy-profile.p5" k="docs.decoy-profile.p5" />,
            <T key="docs.decoy-profile.p6" k="docs.decoy-profile.p6" />,
            <T key="docs.decoy-profile.p7" k="docs.decoy-profile.p7" />,
          ]}
        />
      </DocSection>

      <DocSection id="files" title={<T k="docs.decoy-profile.a10" />}>
        <DocP>
          <T k="docs.decoy-profile.p9" />
        </DocP>
      </DocSection>

      <DocSection id="login" title={<T k="docs.decoy-profile.a12" />}>
        <DocP>
          <T k="docs.decoy-profile.p11" />
        </DocP>
      </DocSection>

      <DocSection id="caveats" title={<T k="docs.decoy-profile.a15" />}>
        <DocNote type="warning" title={<T k="docs.decoy-profile.a14" />}>
          <T k="docs.decoy-profile.p13" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.decoy-profile.a19" />}>
        <DocList
          items={[
            <T
              key="docs.decoy-profile.p16"
              k="docs.decoy-profile.p16"
              links={{ l1: "/docs/dead-mans-switch" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.decoy-profile.p17"
              k="docs.decoy-profile.p17"
              links={{ l1: "/docs/authentication" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.decoy-profile.p18"
              k="docs.decoy-profile.p18"
              links={{ l1: "/features/privacy" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
