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
  title: "Trash & restore | zcrypt Docs",
  description:
    "Deleting a file in zcrypt moves it to Trash as a soft delete. Restore it, preview it, or delete it forever to purge its chunks from every connected storage platform. Bulk selection supported.",
  alternates: { canonical: "https://zcrypt.cloud/docs/trash" },
  openGraph: {
    title: "Trash & restore | zcrypt Docs",
    description:
      "Soft-delete, restore, preview, and permanently purge files in zcrypt — including bulk actions.",
    url: "https://zcrypt.cloud/docs/trash",
  },
};

const toc = [
  { id: "soft-delete", title: "Deleting is a soft delete" },
  { id: "restore", title: "Restoring" },
  { id: "purge", title: "Deleting forever" },
  { id: "preview", title: "Previewing in Trash" },
  { id: "bulk", title: "Bulk select" },
];

export default function TrashDocPage() {
  return (
    <DocPage
      href="/docs/trash"
      title="Trash & restore"
      description="Deletes are reversible by default. Items go to Trash first, so a mis-click is a quick restore — until you decide to purge them for good."
      toc={toc}
    >
      <DocSection id="soft-delete" title="Deleting is a soft delete">
        <DocP>
          Deleting a file moves it to <strong>Trash</strong> rather than removing
          it outright — a <strong>soft delete</strong>. The file leaves your
          folders but its encrypted chunks stay on your storage platform,
          untouched, so it can be brought back.
        </DocP>
      </DocSection>

      <DocSection id="restore" title="Restoring">
        <DocP>
          From Trash, <strong>restore</strong> an item to return it to your
          vault. Because nothing was actually purged, a restore is instant and
          complete — the file comes back exactly as it was.
        </DocP>
      </DocSection>

      <DocSection id="purge" title="Deleting forever">
        <DocP>
          To reclaim space, choose <strong>delete forever</strong>. This is the
          irreversible step: zcrypt <strong>purges the file&apos;s chunks from
          every connected storage platform</strong> they live on. After a purge
          there is nothing left to restore.
        </DocP>
        <DocNote type="warning" title="Permanent and unrecoverable">
          Delete-forever cannot be undone. Once the chunks are purged from your
          platforms, the file is gone for good — restore anything you might still
          want before you purge.
        </DocNote>
      </DocSection>

      <DocSection id="preview" title="Previewing in Trash">
        <DocP>
          Not sure whether to keep something? You can <strong>preview items in
          Trash</strong> with the same full-screen viewer used elsewhere, so you
          can confirm exactly what a file is before restoring or purging it. See{" "}
          <Link href="/docs/viewing-files" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Viewing &amp; previewing files
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="bulk" title="Bulk select">
        <DocP>
          Trash supports <strong>bulk selection</strong>, so you can clear out or
          recover many items in one pass:
        </DocP>
        <DocList
          items={[
            "Select multiple items, then restore the whole group at once.",
            "Or delete the selection forever to purge several files' chunks together.",
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
