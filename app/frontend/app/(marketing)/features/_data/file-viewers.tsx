import {
  Image as ImageIcon,
  Video,
  FileText,
  Code,
  Table,
  Play,
  Search,
  Download,
  Layers,
  RefreshCcw,
  Monitor,
} from "@/lib/icons";
import type { ReactNode } from "react";

export interface FileViewersPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  viewersSection: { heading: string; subheading: string };
  viewers: { Icon: typeof ImageIcon; title: string; desc: string; accent: string; color: string }[];
  zeroKnowledgeSection: { eyebrow: string; heading: string; subheading: string };
  pipeline: { step: string; title: string; desc: string }[];
  memoryNote: ReactNode;
  overlaySection: { heading: string; subheading: string };
  overlayFeatures: { Icon: typeof Layers; title: string; desc: string }[];
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const fileViewers: FileViewersPageData = {
  hero: {
    eyebrow: "In-browser file viewers",
    headlineTop: "See your files.",
    headlineGradient: "Don't hand them over.",
    subtext: (
      <>
        Most encrypted storage makes you download a file and trust a server to
        show it. zcrypt previews images, video, PDFs, documents, and code right
        in your browser — decrypted on the fly, then gone.
      </>
    ),
    secondaryLabel: "How decryption works",
    secondaryHref: "/docs/how-it-works",
  },

  viewersSection: {
    heading: "A viewer for almost everything",
    subheading: "Pick a file and it opens in a viewer built for its type — every one of them fed by plaintext that only ever exists in your browser.",
  },
  // Mirrors the real dispatch in components/viewers/viewer-kind.ts.
  viewers: [
    {
      Icon: ImageIcon,
      title: "Images",
      desc: "Zoom, pan, and rotate JPG, PNG, GIF, WebP, SVG, and more. A cached low-res thumbnail shows instantly while the full image decrypts.",
      accent: "from-cyan-500/15 to-cyan-500/5",
      color: "text-cyan-500",
    },
    {
      Icon: Video,
      title: "Video & audio",
      desc: "A custom player for MP4, MOV, WebM, MP3, FLAC, and more — with a playlist of the other media in the same folder.",
      accent: "from-violet-500/15 to-violet-500/5",
      color: "text-violet-500",
    },
    {
      Icon: FileText,
      title: "PDF",
      desc: "Rendered natively, page by page, with lazy loading — no browser plugin and no third-party PDF service.",
      accent: "from-rose-500/15 to-rose-500/5",
      color: "text-rose-500",
    },
    {
      Icon: FileText,
      title: "DOCX documents",
      desc: "Word documents are rendered to clean HTML and sanitized before display, so you read the content without opening an editor.",
      accent: "from-blue-500/15 to-blue-500/5",
      color: "text-blue-500",
    },
    {
      Icon: Code,
      title: "HTML",
      desc: "Sanitized and shown in a sandboxed frame with scripts disabled — preview a page safely without it phoning home.",
      accent: "from-amber-500/15 to-amber-500/5",
      color: "text-amber-500",
    },
    {
      Icon: FileText,
      title: "Markdown",
      desc: "Rendered to formatted, sanitized HTML — headings, lists, links, and code blocks, the way you wrote them.",
      accent: "from-emerald-500/15 to-emerald-500/5",
      color: "text-emerald-500",
    },
    {
      Icon: Table,
      title: "CSV & TSV",
      desc: "Comma- and tab-separated data laid out as a readable table instead of a wall of raw text.",
      accent: "from-teal-500/15 to-teal-500/5",
      color: "text-teal-500",
    },
    {
      Icon: Code,
      title: "Text & source code",
      desc: "Around 40 languages — JS, TS, Python, Go, Rust, SQL, YAML, and more — with syntax highlighting and a line-wrap toggle.",
      accent: "from-indigo-500/15 to-indigo-500/5",
      color: "text-indigo-500",
    },
  ],

  zeroKnowledgeSection: {
    eyebrow: "Decrypted on your device, never on ours",
    heading: "Preview without trusting a server",
    subheading: "Every preview runs through the same client-side pipeline as a full download. The server hands over sealed bytes and nothing else.",
  },
  // Matches the real client path (lib/decrypt-cache.ts: fetch chunks → AES-256-GCM → zstd → SHA-256 verify).
  pipeline: [
    {
      step: "01",
      title: "Fetch the encrypted chunks",
      desc: "The browser pulls the file's ciphertext chunks straight from your own storage backend. The server only ever handles sealed bytes.",
    },
    {
      step: "02",
      title: "Decrypt with AES-256-GCM",
      desc: "Your passphrase-derived key decrypts each chunk locally. The key is never sent anywhere — there is nothing on the server to decrypt with.",
    },
    {
      step: "03",
      title: "Decompress & verify",
      desc: "Chunks are zstd-decompressed and checked against a SHA-256 hash, so a corrupted or tampered file is caught before you ever see it.",
    },
    {
      step: "04",
      title: "Render from a local blob URL",
      desc: "The plaintext becomes an in-memory blob URL that feeds the viewer — then it's revoked the moment you close or move to the next file.",
    },
  ],
  memoryNote: (
    <>
      The decrypted blob lives only in memory and is{" "}
      <span className="font-semibold text-[var(--color-text)]">
        revoked the moment you close or navigate away
      </span>
      . It is never written to disk and never uploaded — so a preview leaves
      nothing behind on your machine or our servers.
    </>
  ),

  overlaySection: {
    heading: "One overlay, the whole folder",
    subheading: "The viewer is a full-screen overlay you drive from the keyboard — built to move through a folder, not just stare at one file.",
  },
  overlayFeatures: [
    {
      Icon: Layers,
      title: "Walk the whole folder",
      desc: "Prev/next moves through every file in the folder, with a clear 3 / 18 counter — no closing and reopening.",
    },
    {
      Icon: Monitor,
      title: "Fullscreen, keyboard-first",
      desc: "Esc to close, arrow keys to move, f for fullscreen. Focus stays trapped in the dialog and returns where it was on close.",
    },
    {
      Icon: Play,
      title: "Media playlist",
      desc: "Open one track and the player lists the other audio and video in the folder, so a folder becomes a playlist.",
    },
    {
      Icon: RefreshCcw,
      title: "Honest errors & retry",
      desc: "Wrong password, failed integrity check, or an unsupported type each get a clear message — with Retry and Download to fall back to.",
    },
    {
      Icon: Search,
      title: "Instant navigation",
      desc: "A session blob cache and neighbour prefetch mean the next and previous files are usually decrypted before you ask for them.",
    },
    {
      Icon: Download,
      title: "Download when you want",
      desc: "Previewing never forces a download. When you do want the file on disk, one click reuses the blob already decrypted.",
    },
  ],

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "Real, nestable folders and a file explorer — every name encrypted on your device.",
    },
    {
      href: "/docs/how-it-works",
      title: "How it works",
      desc: "The full client-side pipeline: compress, encrypt, chunk, and verify.",
    },
    {
      href: "/docs/folders",
      title: "Password-protected folders",
      desc: "Give a folder its own password — previews unlock only after you enter it.",
    },
  ],

  cta: {
    heading: "See your files without downloading",
    subtext: "Free and open source. Bring a storage account you already own and preview your first encrypted file in under a minute.",
  },
};
