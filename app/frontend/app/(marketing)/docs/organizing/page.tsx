import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Moving & organizing | zcrypt Docs",
  description:
    "Move files and folders in zcrypt by dragging them onto a folder or breadcrumb, bulk-drag many at once, drop one file onto another to make a folder, use the Move-to-folder picker, multi-select, and bulk download or delete.",
  alternates: { canonical: "https://zcrypt.cloud/docs/organizing" },
  openGraph: {
    title: "Moving & organizing | zcrypt Docs",
    description:
      "Drag-and-drop, the Move-to-folder picker, multi-select, and bulk download or delete in the zcrypt encrypted drive.",
    url: "https://zcrypt.cloud/docs/organizing",
  },
};

const toc = [
  { id: "drag", title: "Drag and drop to move" },
  { id: "bulk-drag", title: "Dragging many items" },
  { id: "drop-to-group", title: "Drop to create a folder" },
  { id: "dialog", title: "The Move-to-folder dialog" },
  { id: "select", title: "Selecting multiple items" },
  { id: "bulk-actions", title: "Bulk download & delete" },
];

export default function OrganizingDocPage() {
  return (
    <DocPage
      href="/docs/organizing"
      title="Moving & organizing"
      description="Rearrange your encrypted drive the way you would expect: drag things where they go, select in bulk, and act on many files at once — all from the unified explorer."
      toc={toc}
    >
      <DocSection id="drag" title="Drag and drop to move">
        <DocP>
          Drag any file or folder onto a <strong>folder</strong> to move it
          inside. You can also drop it onto a <strong>breadcrumb crumb</strong>{" "}
          to move it to that level of the tree — handy for popping an item back
          up several folders at once. Valid drop targets highlight as you drag.
        </DocP>
      </DocSection>

      <DocSection id="bulk-drag" title="Dragging many items">
        <DocP>
          Select several items first, then drag any one of them — the whole
          selection moves together. Drop the group onto a folder or a breadcrumb
          just like a single item.
        </DocP>
      </DocSection>

      <DocSection id="drop-to-group" title="Drop one file onto another">
        <DocP>
          Drop a file directly onto <strong>another file</strong> and zcrypt
          creates a <strong>new folder containing both</strong>. It is the
          fastest way to start grouping related files without making the folder
          first.
        </DocP>
      </DocSection>

      <DocSection id="dialog" title="The Move-to-folder dialog">
        <DocP>
          Prefer a picker to dragging? Choose <strong>Move to folder</strong> on
          any item or selection to open a nested folder browser. Drill into the
          tree, pick a destination, and confirm.
        </DocP>
        <DocNote type="info" title="Cycle protection">
          The picker will not let you move a folder into itself or into one of
          its own descendants — destinations that would create a loop are
          disabled, so you can&apos;t accidentally orphan a branch of your tree.
        </DocNote>
      </DocSection>

      <DocSection id="select" title="Selecting multiple items">
        <DocP>
          The explorer supports the selection gestures you already know, plus
          full keyboard control:
        </DocP>
        <DocTable
          head={["Gesture", "What it does"]}
          rows={[
            [<><kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + click</>, "Add or remove a single item from the selection"],
            [<><kbd>Shift</kbd> + click</>, "Select a contiguous range"],
            [<><kbd>Cmd</kbd>/<kbd>Ctrl</kbd> + <kbd>A</kbd></>, "Select everything in the current folder"],
            [<>Arrow keys</>, "Move the focus between items"],
            [<><kbd>Space</kbd></>, "Toggle the focused item's selection"],
          ]}
        />
      </DocSection>

      <DocSection id="bulk-actions" title="Bulk download & delete">
        <DocP>
          With a selection active, you can act on all of it at once:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Bulk download</strong> packages the selected files into a
              single <strong>ZIP</strong>. Each file is fetched, decrypted, and
              decompressed on your device as the archive is assembled — nothing
              is decrypted server-side.
            </>,
            <>
              <strong>Bulk delete</strong> moves the whole selection to the
              Trash, where it can be{" "}
              <Link href="/docs/trash" className="text-cyan-600 hover:underline dark:text-cyan-400">
                restored or purged later
              </Link>
              .
            </>,
          ]}
        />
        <DocP>
          For more on archives and large multi-file jobs, see{" "}
          <Link href="/docs/bulk" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Bulk operations
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
