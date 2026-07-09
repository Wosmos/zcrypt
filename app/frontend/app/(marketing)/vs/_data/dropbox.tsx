import { Lock, Shield, HardDrive, Eye, FolderOpen, Github } from "@/lib/icons";
import type { ComparisonRow } from "@/components/marketing/features/comparison-table";
import type { CapabilityItem } from "@/components/marketing/features/capability-grid";
import type { RelatedLinkItem } from "@/components/marketing/features/related-links";
import type { ReactNode } from "react";
// RelatedLinkItem is used in the VsData interface below.

export interface VsData {
  slug: string;
  otherName: string;
  hero: {
    eyebrow: string;
    headlineTop: ReactNode;
    headlineGradient: ReactNode;
    subtext: ReactNode;
    secondaryLabel: ReactNode;
    secondaryHref: string;
  };
  respectNote?: ReactNode;
  pillarsHeading?: ReactNode;
  pillarsSubheading?: ReactNode;
  pillars: CapabilityItem[];
  table: {
    heading: ReactNode;
    subheading: ReactNode;
    footnote: ReactNode;
    rows: ComparisonRow[];
  };
  whenBetter: { eyebrow?: ReactNode; heading: ReactNode; paragraphs: ReactNode[] };
  related: RelatedLinkItem[];
  closing: { heading: ReactNode; subtext: ReactNode };
  breadcrumb: { name: string; url: string }[];
}

const rows: ComparisonRow[] = [
  {
    label: "Encryption model & who holds the keys",
    zcrypt: {
      good: true,
      note: "AES-256-GCM, keys derived on your device (PBKDF2, 600k iterations). Only you hold them.",
    },
    other: {
      good: false,
      note: "Encrypted in transit and at rest, but Dropbox manages the keys and can decrypt your files.",
    },
  },
  {
    label: "Zero-knowledge",
    zcrypt: {
      good: true,
      note: "Yes, by default. File contents are zero-knowledge and folder names are encrypted client-side. (File names are currently stored as metadata.)",
    },
    other: {
      good: false,
      note: "No. Dropbox can technically access file contents for previews, search, and scanning.",
    },
  },
  {
    label: "Storage model",
    zcrypt: {
      good: true,
      note: "Bring your own: GitHub, GitLab, Hugging Face, or Telegram accounts you already control.",
    },
    other: {
      good: true,
      note: "Dropbox-hosted storage on their infrastructure. Simple, but you don't own the backend.",
    },
  },
  {
    label: "Free tier & pricing",
    zcrypt: {
      good: true,
      note: "Free. You supply the storage, so there's no per-gigabyte fee from us.",
    },
    other: {
      good: false,
      note: "Limited free tier (a few GB); meaningful capacity requires a paid Plus/Professional plan.",
    },
  },
  {
    label: "Open source",
    zcrypt: { good: true, note: "Fully open source — audit the client and server yourself." },
    other: { good: false, note: "Proprietary, closed-source clients and backend." },
  },
  {
    label: "Self-hostable",
    zcrypt: { good: true, note: "Run the entire stack yourself." },
    other: { good: false, note: "Hosted service only." },
  },
  {
    label: "File organization & folders",
    zcrypt: {
      good: true,
      note: "Real nestable folders with encrypted folder names and per-folder passwords.",
    },
    other: {
      good: true,
      note: "Mature, polished folders and sync. Excellent organization — but names are visible to Dropbox.",
    },
  },
  {
    label: "In-browser previews",
    zcrypt: {
      good: true,
      note: "Images, video, audio, PDFs, docs, and code — decrypted in your browser, never on the server.",
    },
    other: {
      good: true,
      note: "Rich previews and editing, generated server-side because Dropbox can read the files.",
    },
  },
  {
    label: "File sharing",
    zcrypt: {
      good: true,
      note: "Encrypted share links with expiry. Shared vaults are in beta.",
    },
    other: {
      good: true,
      note: "Very mature sharing, links, and collaboration — at the cost of provider access.",
    },
  },
  {
    label: "Vendor lock-in",
    zcrypt: {
      good: true,
      note: "Minimal. Your data lives in your own accounts and the format is open.",
    },
    other: {
      good: false,
      note: "Higher. Data and workflows live inside Dropbox's ecosystem.",
    },
  },
];

const pillars: CapabilityItem[] = [
  {
    Icon: Lock,
    title: "You hold the keys",
    desc: "Your passphrase derives the encryption keys on your device with PBKDF2 (600k iterations). We never see them. Lose the passphrase and even we can't recover your files — that's the point.",
  },
  {
    Icon: Shield,
    title: "Zero-knowledge by default",
    desc: "Files are encrypted with AES-256-GCM before they leave your device. Even folder names are sealed, so the server stores opaque ciphertext and nothing else.",
  },
  {
    Icon: HardDrive,
    title: "Bring your own storage",
    desc: "Point zcrypt at a GitHub, GitLab, Hugging Face, or Telegram account you already own. No per-gigabyte fees from us, and no artificial caps.",
  },
  {
    Icon: Github,
    title: "Open source & self-hostable",
    desc: "Read the code, audit the crypto, or run the whole thing yourself. Nothing about how your files are handled is hidden behind a proprietary client.",
  },
];

/** "Go deeper" links shown at the bottom of every vs/* page — the same two
 *  feature deep-dives regardless of which competitor the page compares against. */
export const VS_RELATED_LINKS: RelatedLinkItem[] = [
  {
    href: "/features/encrypted-drive",
    Icon: FolderOpen,
    title: "The encrypted drive",
    desc: "Real folders, search, and previews — with a zero-knowledge layer underneath.",
  },
  {
    href: "/features/encryption",
    Icon: Eye,
    title: "How the encryption works",
    desc: "AES-256-GCM, client-side keys, and what the server can and can't see.",
  },
];

export const dropbox: VsData = {
  slug: "dropbox",
  otherName: "Dropbox",
  hero: {
    eyebrow: "zcrypt vs Dropbox",
    headlineTop: "Dropbox is convenient.",
    headlineGradient: "zcrypt is private.",
    subtext: (
      <>
        Dropbox is a polished, friction-free place to keep files — but it holds
        the keys and can read what you store. zcrypt is a real encrypted drive
        where everything is encrypted on your device, stored in accounts you
        already own, and the code is open for anyone to audit.
      </>
    ),
    secondaryLabel: "See the encrypted drive",
    secondaryHref: "/features/encrypted-drive",
  },
  pillars,
  table: {
    heading: "zcrypt vs Dropbox, side by side",
    subheading: (
      <>
        An honest look at where each one fits. Dropbox wins on polish and
        ecosystem; zcrypt wins on privacy, ownership, and openness.
      </>
    ),
    footnote: (
      <>
        Comparison reflects each product&apos;s standard offering as of 2026.
        Dropbox is a trademark of Dropbox, Inc.; we&apos;re not affiliated with
        or endorsed by them.
      </>
    ),
    rows,
  },
  whenBetter: {
    heading: "When Dropbox is the better choice",
    paragraphs: [
      <>
        We&apos;re not going to pretend zcrypt wins for everyone. Dropbox is
        genuinely excellent at what it does, and there are real situations where
        it&apos;s the right tool.
      </>,
      <>
        If you need{" "}
        <strong className="text-[var(--color-text)]">
          real-time collaborative editing
        </strong>
        , deep integrations with Office or Google Workspace, or a decade-mature
        desktop sync client that just works across every device your team owns,
        Dropbox is hard to beat. Its previews, commenting, and version history
        are more polished than ours today.
      </>,
      <>
        If you specifically{" "}
        <strong className="text-[var(--color-text)]">
          want the provider to host and manage storage for you
        </strong>{" "}
        — no accounts to connect, no keys to remember — Dropbox removes that
        responsibility entirely. With zcrypt, if you lose your passphrase, your
        data is unrecoverable. That trade-off is the price of zero-knowledge,
        and it isn&apos;t for everyone.
      </>,
      <>
        And if you need polished mobile apps today,{" "}
        <strong className="text-[var(--color-text)]">
          zcrypt&apos;s native mobile apps are still on the roadmap
        </strong>{" "}
        — we ship web, desktop, and a terminal app right now. Dropbox&apos;s
        mobile experience is mature and complete.
      </>,
      <>
        zcrypt is the better fit when privacy is non-negotiable: when you want to
        be the only party who can read your files, keep them in storage you
        already own, and verify exactly how the encryption works.
      </>,
    ],
  },
  related: VS_RELATED_LINKS,
  closing: {
    heading: "Keep the convenience. Drop the access.",
    subtext:
      "Free and open source. Bring a storage account you already own and start in under a minute.",
  },
  breadcrumb: [
    { name: "Home", url: "https://zcrypt.cloud" },
    { name: "Compare", url: "https://zcrypt.cloud/vs/dropbox" },
    { name: "zcrypt vs Dropbox", url: "https://zcrypt.cloud/vs/dropbox" },
  ],
};
