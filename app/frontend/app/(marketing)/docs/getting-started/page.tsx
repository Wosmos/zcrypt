import type { Metadata } from "next";

import { DocPage, DocSection, DocP, DocList, DocNote } from "@/components/docs/doc-page";
import { SITE_URL, SITE_DOMAIN } from "@/lib/site";

import { T } from "@/components/i18n/t";
export const metadata: Metadata = {
  title: "Quickstart | zcrypt Docs",
  description:
    "Create a free account, set your passphrase, connect a storage platform, and upload your first encrypted file to zcrypt in a few minutes. No credit card.",
  alternates: { canonical: `${SITE_URL}/docs/getting-started` },
  openGraph: {
    title: "Quickstart | zcrypt Docs",
    description:
      "Sign up, understand your passphrase, connect storage, and upload your first encrypted file to zcrypt, free and open source.",
    url: `${SITE_URL}/docs/getting-started`,
  },
};

const toc = [
  { id: "account", k: "docs.getting-started.toc.account" },
  { id: "passphrase", k: "docs.getting-started.toc.passphrase" },
  { id: "storage", k: "docs.getting-started.toc.storage" },
  { id: "upload", k: "docs.getting-started.toc.upload" },
  { id: "open", k: "docs.getting-started.toc.open" },
  { id: "next", k: "docs.getting-started.toc.next" },
];

/** One rung of the quickstart timeline: a numbered badge with a connector line
 *  running to the next step. Carries the TOC id so scroll-spy still anchors. */
function Step({
  id,
  n,
  title,
  last,
  children,
}: {
  id: string;
  n: number;
  title: React.ReactNode;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative flex scroll-mt-24 gap-4 sm:gap-5">
      {/* Badge + connector rail */}
      <div className="relative flex flex-col items-center">
        <span className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 font-heading text-sm font-bold text-cyan-600 dark:text-cyan-400">
          {n}
        </span>
        {!last && (
          <span
            aria-hidden
            className="mt-1 w-px flex-1 bg-gradient-to-b from-[var(--color-border)] to-transparent"
          />
        )}
      </div>
      {/* Content: last step drops the trailing space the connector needed */}
      <div className={`min-w-0 flex-1 pt-0.5 ${last ? "" : "pb-9"}`}>
        <h2 className="font-heading text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        <div className="mt-3 space-y-4">{children}</div>
      </div>
    </section>
  );
}

export default function GettingStartedPage() {
  return (
    <DocPage
      href="/docs/getting-started"
      title="Quickstart"
      description="Sign up, set your passphrase, connect a storage platform you already use, and upload your first encrypted file, in a few minutes."
      toc={toc}
    >
      <DocNote type="info" title={<T k="docs.getting-started.a2" />}>
        <T k="docs.getting-started.p1" />
      </DocNote>

      <div className="mt-8">
        <Step id="account" n={1} title={<T k="docs.getting-started.a5" />}>
          <DocP>
            <T k="docs.getting-started.p3" values={{ v1: SITE_DOMAIN }} />
          </DocP>
          <DocP>
            <T k="docs.getting-started.p4" />
          </DocP>
        </Step>

        <Step id="passphrase" n={2} title={<T k="docs.getting-started.a10" />}>
          <DocP>
            <T k="docs.getting-started.p6" />
          </DocP>
          <DocP>
            <T
              k="docs.getting-started.p7"
              links={{ l1: "/docs/concepts" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />
          </DocP>
          <DocNote type="warning" title={<T k="docs.getting-started.a9" />}>
            <T k="docs.getting-started.p8" />
          </DocNote>
        </Step>

        <Step id="storage" n={3} title={<T k="docs.getting-started.a13" />}>
          <DocP>
            <T k="docs.getting-started.p11" />
          </DocP>
          <DocP>
            <T
              k="docs.getting-started.p12"
              links={{ l1: "/docs/connect-storage" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />
          </DocP>
        </Step>

        <Step id="upload" n={4} title={<T k="docs.getting-started.a19" />}>
          <DocP>
            <T k="docs.getting-started.p14" />
          </DocP>
          <DocList
            items={[
              <T key="docs.getting-started.p15" k="docs.getting-started.p15" />,
              <T key="docs.getting-started.p16" k="docs.getting-started.p16" />,
              <T key="docs.getting-started.p17" k="docs.getting-started.p17" />,
            ]}
          />
          <DocP>
            <T k="docs.getting-started.p18" />
          </DocP>
        </Step>

        <Step id="open" n={5} title={<T k="docs.getting-started.a22" />} last>
          <DocP>
            <T k="docs.getting-started.p20" />
          </DocP>
          <DocP>
            <T k="docs.getting-started.p21" />
          </DocP>
        </Step>
      </div>

      <DocSection id="next" title={<T k="docs.getting-started.a26" />}>
        <DocList
          items={[
            <T
              key="docs.getting-started.p23"
              k="docs.getting-started.p23"
              links={{ l1: "/docs/concepts" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.getting-started.p24"
              k="docs.getting-started.p24"
              links={{ l1: "/docs/connect-storage" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
            <T
              key="docs.getting-started.p25"
              k="docs.getting-started.p25"
              links={{ l1: "/docs/folders" }}
              linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
            />,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
