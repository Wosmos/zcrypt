import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Web app · Docs",
  description:
    "zcrypt runs in any modern browser. How the vault lock works (one passphrase per session), the optional 'keep me unlocked on this device' that stores your passphrase encrypted in IndexedDB under a non-extractable key, and background notifications for uploads and downloads.",
  path: "/docs/web-app",
  ogDescription:
    "The zcrypt web app: the session vault lock, an encrypted-at-rest 'keep me unlocked on this device' option, and background transfer notifications, all in your browser.",
});

const toc = [
  { id: "browser", k: "docs.web-app.toc.browser" },
  { id: "vault-lock", k: "docs.web-app.toc.vault-lock" },
  { id: "remember", k: "docs.web-app.toc.remember" },
  { id: "notifications", k: "docs.web-app.toc.notifications" },
  { id: "next", k: "docs.web-app.toc.next" },
];

export default function WebAppDocPage() {
  return (
    <DocPage
      href="/docs/web-app"
      title="Web app"
      description="The zcrypt web app is the full product in a browser tab: a real encrypted drive with client-side encryption, a single session lock, and an optional way to stay unlocked on a device you trust."
      toc={toc}
    >
      <DocSection id="browser" title={<T k="docs.web-app.a2" />}>
        <DocP>
          <T k="docs.web-app.p1" />
        </DocP>
      </DocSection>

      <DocSection id="vault-lock" title={<T k="docs.web-app.a8" />}>
        <DocP>
          <T k="docs.web-app.p3" />
        </DocP>
        <DocList
          items={[
            <T key="docs.web-app.p4" k="docs.web-app.p4" />,
            <T key="docs.web-app.p5" k="docs.web-app.p5" />,
            <T key="docs.web-app.p6" k="docs.web-app.p6" />,
          ]}
        />
        <DocNote type="info">
          <T
            k="docs.web-app.p7"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="remember" title={<T k="docs.web-app.a17" />}>
        <DocP>
          <T k="docs.web-app.p9" />
        </DocP>
        <DocList
          items={[
            <T key="docs.web-app.p10" k="docs.web-app.p10" />,
            <T key="docs.web-app.p11" k="docs.web-app.p11" />,
            <T key="docs.web-app.p12" k="docs.web-app.p12" />,
            <T key="docs.web-app.p13" k="docs.web-app.p13" />,
            <T key="docs.web-app.p14" k="docs.web-app.p14" />,
          ]}
        />
        <DocNote type="security" title={<T k="docs.web-app.a16" />}>
          <T k="docs.web-app.p15" />
        </DocNote>
      </DocSection>

      <DocSection id="notifications" title={<T k="docs.web-app.a20" />}>
        <DocP>
          <T k="docs.web-app.p18" />
        </DocP>
        <DocNote type="info">
          <T k="docs.web-app.p19" />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.web-app.a25" />}>
        <DocList
          items={[
            <T
              key="docs.web-app.p21"
              k="docs.web-app.p21"
              links={{ l1: "/docs/desktop-app" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.web-app.p22"
              k="docs.web-app.p22"
              links={{ l1: "/docs/folders" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.web-app.p23"
              k="docs.web-app.p23"
              links={{ l1: "/docs/key-management" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.web-app.p24"
              k="docs.web-app.p24"
              links={{ l1: "/features/apps" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
