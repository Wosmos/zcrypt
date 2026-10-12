import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "Android app · Docs",
  description:
    "The zcrypt Android app is a beta sideload APK built on the same in-process zcrypt-core Rust engine as the desktop app. How to install it, what beta means today, and why the encryption is identical to every other platform.",
  path: "/docs/android-app",
  ogDescription:
    "zcrypt for Android (beta): a sideloaded APK on the same zcrypt-core Rust engine as desktop, with the same zero-knowledge encryption.",
});

const toc = [
  { id: "what", k: "docs.android-app.toc.what" },
  { id: "install", k: "docs.android-app.toc.install" },
  { id: "beta", k: "docs.android-app.toc.beta" },
  { id: "same-core", k: "docs.android-app.toc.same-core" },
  { id: "next", k: "docs.android-app.toc.next" },
];

export default function AndroidAppDocPage() {
  return (
    <DocPage
      href="/docs/android-app"
      title="Android app"
      description="zcrypt on your phone: a beta Android build on the same in-process encryption engine as the desktop app, installed by sideloading an APK rather than through the Play Store."
      toc={toc}
    >
      <DocSection id="what" title={<T k="docs.android-app.a3" />}>
        <DocP>
          <T k="docs.android-app.p1" />
        </DocP>
        <DocP>
          <T k="docs.android-app.p2" />
        </DocP>
      </DocSection>

      <DocSection id="install" title={<T k="docs.android-app.a9" />}>
        <DocP>
          <T k="docs.android-app.p4" />
        </DocP>
        <DocList
          items={[
            <T
              key="docs.android-app.p5"
              k="docs.android-app.p5"
              links={{ l1: "/download#android" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T key="docs.android-app.p6" k="docs.android-app.p6" />,
            <T key="docs.android-app.p7" k="docs.android-app.p7" />,
          ]}
        />
        <DocNote type="info">
          <T k="docs.android-app.p8" />
        </DocNote>
      </DocSection>

      <DocSection id="beta" title={<T k="docs.android-app.a12" />}>
        <DocP>
          <T k="docs.android-app.p10" />
        </DocP>
        <DocNote type="info">
          <T
            k="docs.android-app.p11"
            links={{ l1: "/docs/web-app" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="same-core" title={<T k="docs.android-app.a16" />}>
        <DocP>
          <T k="docs.android-app.p13" />
        </DocP>
        <DocP>
          <T k="docs.android-app.p14" />
        </DocP>
        <DocNote type="security">
          <T
            k="docs.android-app.p15"
            links={{ l1: "/docs/recovery" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocNote>
      </DocSection>

      <DocSection id="next" title={<T k="docs.android-app.a21" />}>
        <DocList
          items={[
            <T
              key="docs.android-app.p17"
              k="docs.android-app.p17"
              links={{ l1: "/docs/desktop-app" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.android-app.p18"
              k="docs.android-app.p18"
              links={{ l1: "/docs/web-app" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.android-app.p19"
              k="docs.android-app.p19"
              links={{ l1: "/download#android" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.android-app.p20"
              k="docs.android-app.p20"
              links={{ l1: "/features/apps" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
