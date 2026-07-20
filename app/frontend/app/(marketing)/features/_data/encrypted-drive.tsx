import { ChevronRight, Search, Eye, Lock, FolderOpen, LayoutGrid } from "@/lib/icons";
import type { ReactNode } from "react";

export interface EncryptedDrivePageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  capabilitiesSection: { heading: string; subheading: string };
  capabilities: { Icon: typeof FolderOpen; title: string; desc: string }[];
  tieIn: {
    eyebrow: string;
    heading: string;
    body: ReactNode;
    checklistItems: string[];
    linkLabel: string;
    linkHref: string;
  };
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const encryptedDrive: EncryptedDrivePageData = {
  hero: {
    eyebrow: "The encrypted drive",
    headlineTop: "A real drive.",
    headlineGradient: "Encrypted end to end.",
    subtext: (
      <>
        Most &ldquo;encrypted storage&rdquo; gives you a flat list of files. zcrypt
        gives you a real file explorer — folders, search, previews, drag-and-drop —
        where everything is encrypted on your device before it leaves.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/folders",
  },

  capabilitiesSection: {
    heading: "Everything a drive should do",
    subheading: "The organization you expect from Finder or Google Drive — with a zero-knowledge encryption layer underneath all of it.",
  },
  capabilities: [
    {
      Icon: FolderOpen,
      title: "Real, nestable folders",
      desc: "Create folders inside folders, as deep as you like. Organize the way you already think — not a flat list of blobs.",
    },
    {
      Icon: ChevronRight,
      title: "Breadcrumb navigation",
      desc: "Always know where you are. Click any crumb to jump back up, or drag a file onto one to move it there.",
    },
    {
      Icon: LayoutGrid,
      title: "Grid & list views",
      desc: "Switch between a thumbnail grid and a sortable list. Sort by name, size, type, date — or by how much space compression saved.",
    },
    {
      Icon: Search,
      title: "Search & filter",
      desc: "Find files fast within the current folder, and filter by type. Search matches decrypted names locally, never on the server.",
    },
    {
      Icon: Eye,
      title: "Preview without downloading",
      desc: "Open images, video, audio, PDFs, documents, and code right in the browser — decrypted on the fly, then gone.",
    },
    {
      Icon: Lock,
      title: "Encrypted folder names",
      desc: "Folder names are encrypted on your device too. Even your structure stays private — the server only ever sees ciphertext.",
    },
  ],

  tieIn: {
    eyebrow: "Organized, never exposed",
    heading: "The structure is yours alone",
    body: (
      <>
        A nicer file manager usually means handing the provider more metadata.
        Not here. Folder names are encrypted on your device with your passphrase,
        so the server stores opaque ciphertext — it can&apos;t read your files,
        your folder names, or how you&apos;ve arranged them.
      </>
    ),
    checklistItems: [
      "Folder names encrypted client-side",
      "Previews decrypted in your browser, never on our servers",
      "Lose your passphrase and even we can't recover it",
    ],
    linkLabel: "How the encryption works",
    linkHref: "/features/encryption",
  },

  related: [
    { href: "/features/folders", title: "Password-protected folders", desc: "Give a folder its own password, separate from your vault." },
    { href: "/features/file-viewers", title: "In-browser file viewers", desc: "Preview images, video, PDFs, docs, and code — decrypted locally." },
    { href: "/features/transfers", title: "Transfer manager", desc: "Pause, resume, and track every upload and download." },
  ],

  cta: {
    heading: "Your files, organized and sealed",
    subtext: "Free and open source. Bring a storage account you already own and start in under a minute.",
  },
};
