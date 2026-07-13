import { Lock, Shield, HardDrive, Github } from "@/lib/icons";
import type { ComparisonRow } from "@/components/marketing/features/comparison-table";
import type { CapabilityItem } from "@/components/marketing/features/capability-grid";
import { type VsData, VS_RELATED_LINKS } from "./dropbox";

const rows: ComparisonRow[] = [
  {
    label: "Encryption model & who holds the keys",
    zcrypt: {
      good: true,
      note: "AES-256-GCM, keys derived on your device (PBKDF2, 600k iterations). Only you hold them.",
    },
    other: {
      good: false,
      note: "Encrypted in transit and at rest with Google-managed keys. Google can decrypt your files.",
    },
  },
  {
    label: "Zero-knowledge",
    zcrypt: {
      good: true,
      note: "Yes, by default. File contents are zero-knowledge, and folder and file names are encrypted client-side (a legacy plaintext name column is being retired).",
    },
    other: {
      good: false,
      note: "No. Content is processed for search, previews, smart features, and policy scanning.",
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
      note: "Google-hosted, pooled across Drive, Gmail, and Photos. Convenient, but you don't own it.",
    },
  },
  {
    label: "Free tier & pricing",
    zcrypt: {
      good: true,
      note: "Free. You supply the storage, so there's no per-gigabyte fee from us.",
    },
    other: {
      good: true,
      note: "15 GB free (shared across Google services); more requires a paid Google One plan.",
    },
  },
  {
    label: "Open source",
    zcrypt: { good: true, note: "Fully open source — audit the client and server yourself." },
    other: { good: false, note: "Proprietary, closed-source." },
  },
  {
    label: "Self-hostable",
    zcrypt: { good: true, note: "Run the entire stack yourself." },
    other: { good: false, note: "Hosted Google service only." },
  },
  {
    label: "File organization & folders",
    zcrypt: {
      good: true,
      note: "Real nestable folders with encrypted folder names and per-folder passwords.",
    },
    other: {
      good: true,
      note: "Excellent folders, search, and shared drives — but names and contents are visible to Google.",
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
      note: "Best-in-class previews and Docs/Sheets editing, generated because Google can read the files.",
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
      note: "Very mature sharing and real-time collaboration — at the cost of provider access.",
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
      note: "High. Files, formats, and workflows are tied into the Google ecosystem.",
    },
  },
];

const pillars: CapabilityItem[] = [
  {
    Icon: Lock,
    title: "Only you can read it",
    desc: "Your passphrase derives the encryption keys on your device with PBKDF2 (600k iterations). Nothing — not search, not smart features, not us — can read your files, because nobody else has the keys.",
  },
  {
    Icon: Shield,
    title: "No scanning, ever",
    desc: "Because content is encrypted with AES-256-GCM before it leaves your device, there's nothing to scan, index, or analyze. The server stores opaque ciphertext, including folder names.",
  },
  {
    Icon: HardDrive,
    title: "Bring your own storage",
    desc: "Connect a GitHub, GitLab, Hugging Face, or Telegram account you already own. No shared 15 GB pool, no per-gigabyte fees from us, no artificial caps.",
  },
  {
    Icon: Github,
    title: "Open source & self-hostable",
    desc: "Read the code, audit the crypto, or run the whole thing yourself. How your files are handled isn't a black box.",
  },
];

export const googleDrive: VsData = {
  slug: "google-drive",
  otherName: "Google Drive",
  hero: {
    eyebrow: "zcrypt vs Google Drive",
    headlineTop: "Google Drive can read your files.",
    headlineGradient: "zcrypt can't.",
    subtext: (
      <>
        Google Drive is deeply integrated and incredibly convenient — but it
        processes your content for search, previews, and smart features, and it
        isn&apos;t end-to-end encrypted. zcrypt encrypts everything on your
        device first, stores it in accounts you already own, and is open source
        from top to bottom.
      </>
    ),
    secondaryLabel: "How the encryption works",
    secondaryHref: "/features/encryption",
  },
  pillars,
  table: {
    heading: "zcrypt vs Google Drive, side by side",
    subheading: (
      <>
        An honest look at where each one fits. Google Drive wins on integration
        and collaboration; zcrypt wins on privacy, ownership, and openness.
      </>
    ),
    footnote: (
      <>
        Comparison reflects each product&apos;s standard offering as of 2026.
        Google Drive is a trademark of Google LLC; we&apos;re not affiliated with
        or endorsed by them.
      </>
    ),
    rows,
  },
  whenBetter: {
    heading: "When Google Drive is the better choice",
    paragraphs: [
      <>
        Google Drive is one of the most capable products of its kind, and there
        are plenty of situations where it&apos;s simply the right answer.
      </>,
      <>
        If your work revolves around{" "}
        <strong className="text-[var(--color-text)]">
          real-time collaboration in Docs, Sheets, and Slides
        </strong>
        , or you live inside Gmail, Calendar, and the broader Google ecosystem,
        Drive&apos;s integration is unmatched. Multiple people editing the same
        document live is something an encrypted-at-rest drive fundamentally
        can&apos;t replicate, because that requires the server to read the
        content.
      </>,
      <>
        If you want{" "}
        <strong className="text-[var(--color-text)]">
          powerful search across the contents of your files
        </strong>
        , AI-assisted features, or automatic photo organization, those rely on
        Google being able to read your data. zcrypt can&apos;t offer them
        precisely because it can&apos;t see your files — that&apos;s the
        deliberate trade-off of zero-knowledge.
      </>,
      <>
        And if polished native mobile apps are essential today,{" "}
        <strong className="text-[var(--color-text)]">
          zcrypt&apos;s mobile apps are still on the roadmap
        </strong>
        . We ship web, desktop, and a terminal app now; Google Drive&apos;s
        mobile apps are mature and complete.
      </>,
      <>
        zcrypt is the better fit when you want storage that genuinely can&apos;t
        read your files, lives in accounts you already own, and has nothing
        hidden behind a proprietary client.
      </>,
    ],
  },
  related: VS_RELATED_LINKS,
  closing: {
    heading: "Storage that can't read your files",
    subtext:
      "Free and open source. Bring a storage account you already own and start in under a minute.",
  },
  breadcrumb: [
    { name: "Home", url: "https://zcrypt.cloud" },
    { name: "Compare", url: "https://zcrypt.cloud/vs/google-drive" },
    { name: "zcrypt vs Google Drive", url: "https://zcrypt.cloud/vs/google-drive" },
  ],
};
