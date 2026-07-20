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
  title: "Folders & the File Explorer | zcrypt Docs",
  description:
    "How folders work in zcrypt: create and nest them, navigate with breadcrumbs, switch between grid and list views, sort, and search — with macOS-style folder icons and folder names encrypted on your device.",
  alternates: { canonical: "https://zcrypt.cloud/docs/folders" },
  openGraph: {
    title: "Folders & the File Explorer | zcrypt Docs",
    description:
      "Create, nest, navigate, sort, and search folders in the zcrypt encrypted drive — with encrypted folder names.",
    url: "https://zcrypt.cloud/docs/folders",
  },
};

const toc = [
  { id: "creating", title: "Creating folders" },
  { id: "navigating", title: "Navigating with breadcrumbs" },
  { id: "views", title: "Grid, list, and sorting" },
  { id: "appearance", title: "How your drive looks" },
  { id: "search", title: "Searching and filtering" },
  { id: "names", title: "Encrypted folder names" },
  { id: "next", title: "Where to go next" },
];

export default function FoldersDocPage() {
  return (
    <DocPage
      href="/docs/folders"
      title="Folders & the file explorer"
      description="zcrypt is a real encrypted drive. Your files live in folders you create and nest, navigate with breadcrumbs, and arrange exactly how you think — all from one unified explorer."
      toc={toc}
    >
      <DocSection id="creating" title="Creating folders">
        <DocP>
          From anywhere in your vault, use <strong>New folder</strong> to create a
          folder in the current location. Folders can be nested as deeply as you
          like — open a folder and create another inside it. Folders always sort
          ahead of files so structure stays easy to scan.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Rename</strong> a folder at any time — the new name is
              re-encrypted on your device.
            </>,
            <>
              <strong>Delete</strong> a folder to move it (and its contents) to the
              Trash, where it can be restored or purged later.
            </>,
            <>
              Drop one file directly onto another to spin up a new folder containing
              both — handy for grouping on the fly.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="navigating" title="Navigating with breadcrumbs">
        <DocP>
          The breadcrumb trail at the top of the explorer always shows where you
          are, starting from <strong>My Vault</strong>. Click any crumb to jump back
          up the tree. Breadcrumbs are also drop targets: drag a file or folder onto
          a crumb to move it to that level.
        </DocP>
      </DocSection>

      <DocSection id="views" title="Grid, list, and sorting">
        <DocP>
          Switch between a <strong>grid</strong> of thumbnail cards and a sortable{" "}
          <strong>list</strong>. In list view, click a column header to sort by name,
          type, size, modified date, or <em>Saved</em> — how much space compression
          reclaimed for each file. A footer tallies the folders and files in the
          current location.
        </DocP>
      </DocSection>

      <DocSection id="appearance" title="How your drive looks">
        <DocP>
          Folders are drawn as big, filled <strong>macOS-style folder
          icons</strong>, tinted with your theme&rsquo;s accent color. zcrypt
          marks each one by name: a folder called <em>Documents</em>,{" "}
          <em>Downloads</em>, <em>Music</em>, <em>Pictures</em>, <em>Code</em>,
          or <em>Work</em> — and dozens of other common names — gets a matching
          glyph, and anything unrecognized falls back to its initial letter. A
          password-protected or locked folder shows a <strong>padlock</strong>{" "}
          instead.
        </DocP>
        <DocP>
          Files sit alongside them as macOS-style tiles: image and video files
          show a live thumbnail, while other types show a page tile with a
          colored type icon and the file&rsquo;s extension. You can also pick a{" "}
          <strong>color theme</strong> for the app in Settings — the choice is
          saved per device — and the interface uses soft <em>squircle</em>{" "}
          corners on browsers that support them, with clean rounded corners
          everywhere else.
        </DocP>
      </DocSection>

      <DocSection id="search" title="Searching and filtering">
        <DocP>
          Use the search box to filter the current folder by name, or the type chips
          to narrow to images, documents, and so on. Search runs entirely on your
          device against decrypted names — the server never receives your query or
          your file names.
        </DocP>
      </DocSection>

      <DocSection id="names" title="Encrypted folder names">
        <DocP>
          Folder names are encrypted client-side with a key derived from your
          passphrase, exactly like file contents. The server only ever stores opaque
          ciphertext, so your folder structure is private too.
        </DocP>
        <DocNote type="security" title="What this means">
          When your vault is locked, folders display as{" "}
          <code>[locked]</code> until you unlock. If you forget your passphrase,
          folder names — like file contents — cannot be recovered, because there is
          nothing readable on our side to recover them from.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>
          Ready to put files in motion and lock things down?
        </DocP>
        <DocList
          items={[
            <Link key="a" href="/docs/organizing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Moving &amp; organizing — drag-and-drop, move-to-folder, and bulk actions
            </Link>,
            <Link key="b" href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Per-folder encryption — give a folder its own password
            </Link>,
            <Link key="c" href="/docs/viewing-files" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Viewing &amp; previewing files — open files without downloading
            </Link>,
            <Link key="d" href="/features/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encrypted folders — the feature tour
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
