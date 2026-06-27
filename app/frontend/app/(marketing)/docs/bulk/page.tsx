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
  title: "Bulk operations | zcrypt Docs",
  description:
    "Select many files in zcrypt to download them as a single ZIP (decrypted on your device, up to a ~2 GB cap) or to delete them in bulk — with mouse and keyboard multi-select.",
  alternates: { canonical: "https://zcrypt.cloud/docs/bulk" },
  openGraph: {
    title: "Bulk operations | zcrypt Docs",
    description:
      "Multi-select files in zcrypt to download as a ZIP or delete in bulk, with mouse and keyboard selection.",
    url: "https://zcrypt.cloud/docs/bulk",
  },
};

const toc = [
  { id: "select", title: "Selecting multiple files" },
  { id: "zip", title: "Download as a ZIP" },
  { id: "delete", title: "Bulk delete" },
  { id: "next", title: "Where to go next" },
];

export default function BulkDocPage() {
  return (
    <DocPage
      href="/docs/bulk"
      title="Bulk operations"
      description="Act on many files at once: select a batch and download it as a single ZIP, or move it to the Trash together. Selection works the way you expect with both mouse and keyboard."
      toc={toc}
    >
      <DocSection id="select" title="Selecting multiple files">
        <DocP>
          Multi-select is built into the explorer. Use your mouse to pick out
          files, and the usual keyboard modifiers to extend a selection — add
          individual files, or select a contiguous range — then keep going with
          the keyboard to grow or shrink it. The toolbar updates to show how many
          items are selected and which bulk actions apply.
        </DocP>
      </DocSection>

      <DocSection id="zip" title="Download as a ZIP">
        <DocP>
          With several files selected, download them together as a single ZIP
          archive. Each file is fetched, verified, decrypted, and decompressed{" "}
          <strong>on your device</strong> — exactly like a normal download — and
          then packed into the ZIP locally. Nothing is ever assembled or
          decrypted on the server. Files from{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">protected folders</Link>{" "}
          are decrypted with their folder password as part of the same pass.
        </DocP>
        <DocNote type="info" title="~2 GB cap">
          ZIP creation happens in the browser, so the combined size is capped at
          roughly 2 GB. If your selection totals more than that, zcrypt asks you
          to download the larger files individually instead of building one
          oversized archive.
        </DocNote>
      </DocSection>

      <DocSection id="delete" title="Bulk delete">
        <DocP>
          Select a batch and delete it in one action. Like single deletes, this
          moves the files to the{" "}
          <Link href="/docs/trash" className="text-cyan-600 hover:underline dark:text-cyan-400">Trash</Link>,
          where they can be restored or purged later — so a bulk delete is
          recoverable until you empty the Trash.
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Downloading — what happens to each file inside the ZIP
            </Link>,
            <Link key="b" href="/docs/organizing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Moving &amp; organizing — drag-and-drop and move-to-folder
            </Link>,
            <Link key="c" href="/docs/trash" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Trash &amp; restore — recovering bulk-deleted files
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
