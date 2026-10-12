import { pageMetadata } from "@/lib/page-metadata";
import { DocPage, DocSection, DocP, DocNote } from "@/components/docs/doc-page";

import { T } from "@/components/i18n/t";
export const metadata = pageMetadata({
  title: "FAQ · Docs",
  description:
    "Common questions about zcrypt: what it costs, how much storage you get, how the AES-256-GCM zero-knowledge encryption works, multi-device access, real folders, previewing files, password-protected folders, and what happens if you forget your passphrase.",
  path: "/docs/faq",
  ogDescription:
    "Cost, storage, encryption, multi-device, folders, previews, and passphrase recovery, answered plainly.",
});

const toc = [
  { id: "cost", k: "docs.faq.toc.cost" },
  { id: "storage", k: "docs.faq.toc.storage" },
  { id: "encryption", k: "docs.faq.toc.encryption" },
  { id: "devices", k: "docs.faq.toc.devices" },
  { id: "folders", k: "docs.faq.toc.folders" },
  { id: "preview", k: "docs.faq.toc.preview" },
  { id: "folder-password", k: "docs.faq.toc.folder-password" },
  { id: "forgot", k: "docs.faq.toc.forgot" },
];

export default function FaqDocPage() {
  return (
    <DocPage
      href="/docs/faq"
      title="FAQ"
      description="Short, honest answers to the questions people ask most about zcrypt."
      toc={toc}
    >
      <DocSection id="cost" title={<T k="docs.faq.a2" />}>
        <DocP>
          <T k="docs.faq.p1" />
        </DocP>
      </DocSection>

      <DocSection id="storage" title={<T k="docs.faq.a4" />}>
        <DocP>
          <T k="docs.faq.p3" />
        </DocP>
      </DocSection>

      <DocSection id="encryption" title={<T k="docs.faq.a6" />}>
        <DocP>
          <T k="docs.faq.p5" />
        </DocP>
      </DocSection>

      <DocSection id="devices" title={<T k="docs.faq.a8" />}>
        <DocP>
          <T k="docs.faq.p7" />
        </DocP>
      </DocSection>

      <DocSection id="folders" title={<T k="docs.faq.a10" />}>
        <DocP>
          <T
            k="docs.faq.p9"
            links={{ l1: "/docs/folders" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="preview" title={<T k="docs.faq.a12" />}>
        <DocP>
          <T
            k="docs.faq.p11"
            links={{ l1: "/docs/viewing-files" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="folder-password" title={<T k="docs.faq.a14" />}>
        <DocP>
          <T
            k="docs.faq.p13"
            links={{ l1: "/docs/folder-encryption" }}
            linkClassName="text-cyan-600 hover:underline dark:text-cyan-400"
          />
        </DocP>
      </DocSection>

      <DocSection id="forgot" title={<T k="docs.faq.a18" />}>
        <DocP>
          <T k="docs.faq.p15" />
        </DocP>
        <DocNote type="warning" title={<T k="docs.faq.a17" />}>
          <T k="docs.faq.p16" />
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
