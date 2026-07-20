import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "License | zcrypt Docs",
  description:
    "zcrypt is MIT-licensed — free to use, modify, and distribute, including commercially, with no warranty. Read the full license text on GitHub.",
  alternates: { canonical: "https://zcrypt.cloud/docs/license" },
  openGraph: {
    title: "License | zcrypt Docs",
    description:
      "zcrypt is MIT-licensed — free to use, modify, and distribute, including commercially, with no warranty.",
    url: "https://zcrypt.cloud/docs/license",
  },
};

const toc = [
  { id: "overview", title: "Overview" },
  { id: "permits", title: "What MIT permits" },
  { id: "warranty", title: "No warranty" },
  { id: "text", title: "Full license text" },
];

export default function LicenseDocPage() {
  return (
    <DocPage
      href="/docs/license"
      title="License"
      description="zcrypt is open source under the MIT License — one of the most permissive licenses there is."
      toc={toc}
    >
      <DocSection id="overview" title="Overview">
        <DocP>
          The entire zcrypt codebase — backend, frontend, TUI, and everything
          else in the repository — is released under the{" "}
          <strong>MIT License</strong>. It&apos;s a short, permissive license:
          you can do almost anything with the code as long as you keep the
          copyright notice attached.
        </DocP>
      </DocSection>

      <DocSection id="permits" title="What MIT permits">
        <DocP>In plain terms, the MIT License lets anyone:</DocP>
        <DocList
          items={[
            <>
              <strong>Use</strong> the software for any purpose, private or
              commercial.
            </>,
            <>
              <strong>Modify</strong> the source code however they like.
            </>,
            <>
              <strong>Distribute</strong> copies of the original or modified
              software.
            </>,
            <>
              <strong>Sell</strong> it, bundle it into a paid product, or
              self-host it as part of a commercial service.
            </>,
          ]}
        />
        <DocP>
          The only real condition is that the original copyright notice and
          the license text stay included in any copy or substantial portion
          of the software you redistribute.
        </DocP>
      </DocSection>

      <DocSection id="warranty" title="No warranty">
        <DocNote type="info" title="Provided as-is">
          The software is provided &quot;as is&quot;, without warranty of any
          kind. The authors are not liable for any claim, damages, or other
          liability arising from its use. Run it, fork it, ship it — but the
          risk is yours.
        </DocNote>
      </DocSection>

      <DocSection id="text" title="Full license text">
        <DocP>
          Read the complete, unmodified license in the repository:{" "}
          <Link
            href="https://github.com/Wosmos/zcrypt/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            LICENSE on GitHub
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
