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
  title: "Search & filters | zcrypt Docs",
  description:
    "Search the current folder in zcrypt against file and folder names — entirely on your device, so your query never reaches the server — and narrow results with type-filter chips.",
  alternates: { canonical: "https://zcrypt.cloud/docs/search" },
  openGraph: {
    title: "Search & filters | zcrypt Docs",
    description:
      "Find files fast with a per-folder search box that runs locally on decrypted names, plus type-filter chips.",
    url: "https://zcrypt.cloud/docs/search",
  },
};

const toc = [
  { id: "box", title: "The search box" },
  { id: "local", title: "Search stays on your device" },
  { id: "filters", title: "Type-filter chips" },
];

export default function SearchDocPage() {
  return (
    <DocPage
      href="/docs/search"
      title="Search & filters"
      description="Find what you need inside a folder fast — without your search ever leaving your device."
      toc={toc}
    >
      <DocSection id="box" title="The search box">
        <DocP>
          Each folder has a <strong>search box</strong> that filters the current
          location as you type. It matches both <strong>file names</strong> and{" "}
          <strong>folder names</strong>, so you can narrow a busy folder to just
          the items you mean in a few keystrokes.
        </DocP>
      </DocSection>

      <DocSection id="local" title="Search stays on your device">
        <DocP>
          zcrypt matches against the <strong>decrypted</strong> names held in
          your browser after the vault is unlocked. The matching runs entirely{" "}
          <strong>locally</strong>; your query is never sent anywhere. The server
          only ever stores encrypted names, so there is nothing for it to search
          even if it wanted to.
        </DocP>
        <DocNote type="security" title="Why this matters">
          A search term can be as revealing as a file name. Keeping the match on
          your device means neither your file names nor what you look for ever
          reach our servers.
        </DocNote>
      </DocSection>

      <DocSection id="filters" title="Type-filter chips">
        <DocP>
          Alongside the search box, <strong>type-filter chips</strong> narrow the
          view by category — images, documents, and so on — and stack with
          whatever you have typed. Use them to sweep a folder down to one kind of
          file, then refine by name.
        </DocP>
        <DocList
          items={[
            "Filters apply to the current folder, on top of any active search text.",
            "Clear the chips to return to the full listing.",
          ]}
        />
        <DocP>
          Search and filtering also appear inside the file explorer — see{" "}
          <Link href="/docs/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Folders &amp; the file explorer
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
