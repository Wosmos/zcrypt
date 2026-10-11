import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote, DocCode } from "@/components/docs/doc-page";
import { SITE_URL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Desktop app | zcrypt Docs",
  description:
    "The native zcrypt desktop build for macOS, Windows, and Linux, built with Tauri. A native file picker, OAuth sign-in through your system browser, and the same zero-knowledge encryption as the web app.",
  alternates: { canonical: `${SITE_URL}/docs/desktop-app` },
  openGraph: {
    title: "Desktop app | zcrypt Docs",
    description:
      "A native desktop build of zcrypt (Tauri) for macOS, Windows, and Linux: native file picker, system-browser OAuth, same zero-knowledge core.",
    url: `${SITE_URL}/docs/desktop-app`,
  },
};

const toc = [
  { id: "what", k: "docs.desktop-app.toc.what" },
  { id: "native", k: "docs.desktop-app.toc.native" },
  { id: "same-core", k: "docs.desktop-app.toc.same-core" },
  { id: "download", k: "docs.desktop-app.toc.download" },
  { id: "next", k: "docs.desktop-app.toc.next" },
];

export default function DesktopAppDocPage() {
  return (
    <DocPage
      href="/docs/desktop-app"
      title="Desktop app"
      description="A native desktop build of zcrypt for people who'd rather have a real app window than a browser tab: with OS-level file handling and the exact same client-side encryption."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.desktop-app.a3" />}>
        <DocP>
          <T k="docs.desktop-app.p1" />
        </DocP>
        <DocP>
          <T k="docs.desktop-app.p2" />
        </DocP>
      </DocSection>

      <DocSection id="native" title={<T k="docs.desktop-app.a8" />}>
        <DocP>
          <T k="docs.desktop-app.p4" />
        </DocP>
        <DocList
          items={[
            <T key="docs.desktop-app.p5" k="docs.desktop-app.p5" />,
            <T
              key="docs.desktop-app.p6"
              k="docs.desktop-app.p6"
              links={{ l1: "/docs/oauth" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.desktop-app.p7" k="docs.desktop-app.p7" />,
          ]}
        />
      </DocSection>

      <DocSection id="same-core" title={<T k="docs.desktop-app.a12" />}>
        <DocP>
          <T k="docs.desktop-app.p9" />
        </DocP>
        <DocP>
          <T k="docs.desktop-app.p10" />
        </DocP>
        <DocNote type="security">
          <T
            k="docs.desktop-app.p11"
            links={{ l1: "/docs/recovery" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="download" title={<T k="docs.desktop-app.a25" />}>
        <DocP>
          <T k="docs.desktop-app.p13" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.desktop-app.p14"
              k="docs.desktop-app.p14"
              links={{ l1: "/download" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
        <DocP>
          <T k="docs.desktop-app.p15" />
        </DocP>
        <DocCode
          label={<T k="docs.desktop-app.a17" />}
        >{`curl -fsSL https://zcrypt.cloud/install.sh | sh`}</DocCode>
        <DocCode
          label={<T k="docs.desktop-app.a19" />}
        >{`irm https://zcrypt.cloud/install.ps1 | iex`}</DocCode>
        <DocCode label={<T k="docs.desktop-app.a21" />}>{`brew tap wosmos/zcrypt
brew trust wosmos/zcrypt
brew install --cask zcrypt`}</DocCode>
        <DocNote type="info" title={<T k="docs.desktop-app.a23" />}>
          <T k="docs.desktop-app.p22" />
        </DocNote>
        <DocNote type="info">
          <T
            k="docs.desktop-app.p24"
            links={{ l1: "/docs/web-app" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.desktop-app.a30" />}>
        <DocList
          items={[
            <T
              key="docs.desktop-app.p26"
              k="docs.desktop-app.p26"
              links={{ l1: "/docs/web-app" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.desktop-app.p27"
              k="docs.desktop-app.p27"
              links={{ l1: "/download#android" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.desktop-app.p28"
              k="docs.desktop-app.p28"
              links={{ l1: "/docs/oauth" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.desktop-app.p29"
              k="docs.desktop-app.p29"
              links={{ l1: "/features/apps" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
