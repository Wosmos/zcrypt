import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Sign in with Google or GitHub | zcrypt Docs",
  description:
    "Use Google or GitHub to sign in to zcrypt: how OAuth sign-up and login work, linking and unlinking providers in settings, and signing in from the desktop app via your system browser.",
  alternates: { canonical: `${SITE_URL}/docs/oauth` },
  openGraph: {
    title: "Sign in with Google or GitHub | zcrypt Docs",
    description:
      "OAuth sign-in and sign-up with Google and GitHub, linking and unlinking providers, and the desktop sign-in flow, and why this is not the same as connecting GitHub as storage.",
    url: `${SITE_URL}/docs/oauth`,
  },
};

const toc = [
  { id: "not-storage", k: "docs.oauth.toc.not-storage" },
  { id: "sign-in", k: "docs.oauth.toc.sign-in" },
  { id: "linking", k: "docs.oauth.toc.linking" },
  { id: "desktop", k: "docs.oauth.toc.desktop" },
  { id: "next", k: "docs.oauth.toc.next" },
];

export default function OAuthDocPage() {
  return (
    <DocPage
      href="/docs/oauth"
      title="Sign in with Google or GitHub"
      description="Skip the password and authenticate to zcrypt with an identity you already have. OAuth covers signing in only: your files stay protected by your vault passphrase exactly as they would otherwise."
      toc={toc}
    >
      <DocNote type="warning" title={<T k="docs.oauth.a4" />}>
        <p className="mb-2">
          <T k="docs.oauth.p1" />
        </p>
        <p className="mb-2">
          <T k="docs.oauth.p2" />
        </p>
        <p>
          <T
            k="docs.oauth.p3"
            links={{ l1: "/docs/connect-storage" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </p>
      </DocNote>

      <DocSection id="not-storage" title={<T k="docs.oauth.a6" />}>
        <DocP>
          <T k="docs.oauth.p5" />
        </DocP>
      </DocSection>

      <DocSection id="sign-in" title={<T k="docs.oauth.a13" />}>
        <DocP>
          <T k="docs.oauth.p7" />
        </DocP>
        <DocList
          items={[
            <T key="docs.oauth.p8" k="docs.oauth.p8" />,
            <T key="docs.oauth.p9" k="docs.oauth.p9" />,
            <T key="docs.oauth.p10" k="docs.oauth.p10" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.oauth.a12" />}>
          <T k="docs.oauth.p11" />
        </DocNote>
      </DocSection>

      <DocSection id="linking" title={<T k="docs.oauth.a17" />}>
        <DocP>
          <T k="docs.oauth.p14" />
        </DocP>
        <DocP>
          <T k="docs.oauth.p15" />
        </DocP>
        <DocNote type="info">
          <T k="docs.oauth.p16" />
        </DocNote>
      </DocSection>

      <DocSection id="desktop" title={<T k="docs.oauth.a23" />}>
        <DocP>
          <T k="docs.oauth.p18" />
        </DocP>
        <DocList
          ordered
          items={[
            <T key="docs.oauth.p19" k="docs.oauth.p19" />,
            <T key="docs.oauth.p20" k="docs.oauth.p20" />,
            <T key="docs.oauth.p21" k="docs.oauth.p21" />,
          ]}
        />
        <DocP>
          <T
            k="docs.oauth.p22"
            links={{ l1: "/docs/desktop-app" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="next" title={<T k="docs.oauth.a27" />}>
        <DocList
          items={[
            <T
              key="docs.oauth.p24"
              k="docs.oauth.p24"
              links={{ l1: "/docs/connect-storage" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.oauth.p25"
              k="docs.oauth.p25"
              links={{ l1: "/docs/authentication" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.oauth.p26"
              k="docs.oauth.p26"
              links={{ l1: "/docs/recovery" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
