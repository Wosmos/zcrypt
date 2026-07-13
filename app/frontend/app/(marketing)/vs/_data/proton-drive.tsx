import { Lock, HardDrive, Github, Terminal } from "@/lib/icons";
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
      good: true,
      note: "End-to-end encrypted with keys derived from your password. Proton can't read your files either.",
    },
  },
  {
    label: "Zero-knowledge",
    zcrypt: {
      good: true,
      note: "Yes, by default. File contents are zero-knowledge, and folder and file names are encrypted client-side. Proton is a mature zero-knowledge product that also encrypts file metadata.",
    },
    other: {
      good: true,
      note: "Yes. Proton Drive is genuinely zero-knowledge and encrypts file metadata as well.",
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
      note: "Proton-hosted in Swiss/EU data centers. Reputable and managed — but Proton runs the storage.",
    },
  },
  {
    label: "Free tier & pricing",
    zcrypt: {
      good: true,
      note: "Free. You supply the storage, so capacity isn't metered or sold by the gigabyte.",
    },
    other: {
      good: true,
      note: "Generous free tier; larger storage and bundles require a paid Proton plan.",
    },
  },
  {
    label: "Open source",
    zcrypt: {
      good: true,
      note: "Client and server are fully open source.",
    },
    other: {
      good: true,
      note: "Proton open-sources its apps and publishes independent security audits.",
    },
  },
  {
    label: "Self-hostable",
    zcrypt: {
      good: true,
      note: "Run the entire stack yourself — client, server, and storage.",
    },
    other: {
      good: false,
      note: "Hosted Proton service only; you can't run your own Proton Drive server.",
    },
  },
  {
    label: "File organization & folders",
    zcrypt: {
      good: true,
      note: "Real nestable folders with encrypted names, plus optional per-folder passwords.",
    },
    other: {
      good: true,
      note: "Solid encrypted folders and a clean drive experience.",
    },
  },
  {
    label: "In-browser previews",
    zcrypt: {
      good: true,
      note: "Images, video, audio, PDFs, docs, and code — decrypted locally in the browser.",
    },
    other: {
      good: true,
      note: "In-browser previews with client-side decryption, similar approach.",
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
      note: "Mature encrypted sharing with password-protected and expiring links.",
    },
  },
  {
    label: "Vendor lock-in",
    zcrypt: {
      good: true,
      note: "Minimal. Data lives in storage you already own and the format is open.",
    },
    other: {
      good: false,
      note: "Moderate. Your encrypted data lives within Proton's hosted ecosystem.",
    },
  },
];

const pillars: CapabilityItem[] = [
  {
    Icon: Github,
    title: "Open source, top to bottom",
    desc: "Like Proton, our apps are open source — and so is the server. You can audit, fork, or run the whole thing. There's no closed component you have to trust on faith.",
  },
  {
    Icon: HardDrive,
    title: "Bring your own storage",
    desc: "This is the big one. Instead of a Proton-hosted quota, point zcrypt at a GitHub, GitLab, Hugging Face, or Telegram account you already own. No gigabyte caps from us, no separate storage bill.",
  },
  {
    Icon: Lock,
    title: "Self-host the entire stack",
    desc: "Run your own zcrypt server and keep both the keys and the infrastructure under your control. Proton Drive is hosted only — you can't operate your own instance.",
  },
  {
    Icon: Terminal,
    title: "A real terminal app",
    desc: "zcrypt ships a full TUI alongside web and desktop, so you can manage an encrypted vault straight from the command line — handy for servers and power users.",
  },
];

export const protonDrive: VsData = {
  slug: "proton-drive",
  otherName: "Proton Drive",
  hero: {
    eyebrow: "zcrypt vs Proton Drive",
    headlineTop: "Both are end-to-end encrypted.",
    headlineGradient: "Only one is yours to run.",
    subtext: (
      <>
        Proton Drive is a genuinely excellent, audited, zero-knowledge drive —
        and we respect it. The differences are narrower here and more about
        philosophy: zcrypt is open source <em>and</em> self-hostable, stores
        files in accounts you already own, has no artificial caps, and even ships
        a terminal app.
      </>
    ),
    secondaryLabel: "How the encryption works",
    secondaryHref: "/features/encryption",
  },
  respectNote: (
    <>
      <strong className="text-[var(--color-text)]">
        Credit where it&apos;s due.
      </strong>{" "}
      Proton Drive is end-to-end encrypted, independently audited, backed by an
      established privacy company, and has mature mobile apps. If you&apos;re
      weighing it against zcrypt, you&apos;re already making a privacy-respecting
      choice. This page is about which trade-offs suit you — not about claiming
      Proton gets anything wrong.
    </>
  ),
  pillarsHeading: "Where zcrypt is different",
  pillarsSubheading: (
    <>
      The encryption story is similar. These four things are where zcrypt takes a
      different path.
    </>
  ),
  pillars,
  table: {
    heading: "zcrypt vs Proton Drive, side by side",
    subheading: (
      <>
        Both check the privacy boxes. The differences cluster around hosting,
        storage ownership, and tooling.
      </>
    ),
    footnote: (
      <>
        Comparison reflects each product&apos;s standard offering as of 2026.
        Proton Drive is a trademark of Proton AG; we&apos;re not affiliated with
        or endorsed by them.
      </>
    ),
    rows,
  },
  whenBetter: {
    heading: "When Proton Drive is the better choice",
    paragraphs: [
      <>
        Proton Drive is a serious, well-built product, and for many people
        it&apos;s the smarter pick. We&apos;d rather you choose the right tool
        than the one with our name on it.
      </>,
      <>
        If you want{" "}
        <strong className="text-[var(--color-text)]">
          polished native mobile apps today
        </strong>
        , Proton has them and zcrypt does not — our mobile apps are still on the
        roadmap. For people who manage files primarily from a phone, that
        difference alone may settle it.
      </>,
      <>
        If you value a{" "}
        <strong className="text-[var(--color-text)]">
          single, fully managed privacy suite
        </strong>{" "}
        — Drive, Mail, Calendar, and VPN under one audited provider in Swiss/EU
        jurisdiction — Proton delivers that as a cohesive package. zcrypt is
        focused on being an encrypted drive, not an ecosystem.
      </>,
      <>
        If you&apos;d rather{" "}
        <strong className="text-[var(--color-text)]">
          not manage your own storage or infrastructure at all
        </strong>
        , Proton handles everything for you. zcrypt&apos;s
        bring-your-own-storage model is powerful, but it does ask you to connect
        an account and take responsibility for your passphrase. And some of our
        more advanced collaboration features, like shared vaults, are still in
        beta.
      </>,
      <>
        zcrypt is the better fit when you want an encrypted drive you can fully
        self-host, store in accounts you already own, scale without artificial
        caps, and drive from the terminal — all open source and free.
      </>,
    ],
  },
  related: VS_RELATED_LINKS,
  closing: {
    heading: "End-to-end encrypted, and entirely yours",
    subtext:
      "Open source and free. Bring a storage account you already own, or self-host the whole stack.",
  },
  breadcrumb: [
    { name: "Home", url: "https://zcrypt.cloud" },
    { name: "Compare", url: "https://zcrypt.cloud/vs/proton-drive" },
    { name: "zcrypt vs Proton Drive", url: "https://zcrypt.cloud/vs/proton-drive" },
  ],
};
