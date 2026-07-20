import { HardDrive, RefreshCw, Infinity as InfinityIcon, Lock, Server, Layers } from "@/lib/icons";
import type { ReactNode } from "react";

export interface BringYourOwnStoragePageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  adaptersSection: { heading: string; subheading: string; footnote: string };
  capabilities: { Icon: typeof Layers; title: string; desc: string }[];
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

export const bringYourOwnStorage: BringYourOwnStoragePageData = {
  hero: {
    eyebrow: "Bring your own storage",
    headlineTop: "We don't sell you storage.",
    headlineGradient: "You already have it.",
    subtext: (
      <>
        Connect accounts you own — GitHub, GitLab, Hugging Face, Telegram — and your
        encrypted files are stored as disguised chunks in repos you own. Repos
        rotate automatically as they fill, so your space grows on its own. Your
        data, your infrastructure, no lock-in.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/platform-adapters",
  },

  adaptersSection: {
    heading: "Connect what you already pay for",
    subheading: "Four platforms, each with its own generous limits. Mix and match — the more you connect, the more room you have.",
    footnote: "Capacities are approximate, per-repo or per-file platform limits and can change at the providers' discretion. zcrypt works within whatever each platform currently allows.",
  },

  capabilities: [
    {
      Icon: Layers,
      title: "Split, encrypted, disguised",
      desc: "Each file is encrypted on your device, then split into ~10 MB chunks stored as ordinary build-cache objects in a repo you own. Across your whole library, files spread over the accounts you've connected.",
    },
    {
      Icon: RefreshCw,
      title: "Automatic repo rotation",
      desc: "When a repo nears its platform's ceiling, zcrypt rotates to a fresh one on its own. Your usable space grows without you lifting a finger.",
    },
    {
      Icon: InfinityIcon,
      title: "Space that grows",
      desc: "Connect more accounts, get more room. There's no zcrypt-sold quota to bump against — your capacity is whatever you already have.",
    },
    {
      Icon: Lock,
      title: "Disguised on arrival",
      desc: "Chunks are stored looking like ordinary build-cache files — unremarkable artifacts in a code repo, not obvious encrypted blobs.",
    },
    {
      Icon: Server,
      title: "Your infrastructure",
      desc: "The bytes sit in accounts you control and can walk away with. zcrypt orchestrates; it doesn't hold your storage hostage.",
    },
    {
      Icon: HardDrive,
      title: "No lock-in",
      desc: "Disconnect a platform or leave entirely — your accounts are yours. Open source, so the mechanics are never a black box.",
    },
  ],

  tieIn: {
    eyebrow: "Your data, your infrastructure",
    heading: "Nothing to be locked into",
    body: (
      <>
        Most cloud storage rents you space on the provider&apos;s servers, on the
        provider&apos;s terms. zcrypt flips that: it&apos;s an encryption and
        orchestration layer over storage you already own. Everything is encrypted
        on your device first, then chunks are disguised as ordinary build-cache
        files in repos you own — your library spread across the accounts you
        connect. Walk away whenever you like — the accounts, and the bytes in
        them, were always yours.
      </>
    ),
    checklistItems: [
      "Encrypted on your device before any upload",
      "Chunks disguised as routine build-cache artifacts",
      "Stored in repos across accounts you control",
      "Disconnect or leave anytime — no captive data",
    ],
    linkLabel: "How the repo pool rotates",
    linkHref: "/docs/repo-pool",
  },

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "What sits on top of your storage — a real, sealed file explorer.",
    },
    {
      href: "/docs/platform-adapters",
      title: "Docs: Platform adapters",
      desc: "Connect GitHub, GitLab, Hugging Face, and Telegram accounts.",
    },
    {
      href: "/docs/repo-pool",
      title: "Docs: Repo pool",
      desc: "How chunks distribute and repos auto-rotate as they fill.",
    },
  ],

  cta: {
    heading: "Storage you own, encryption you trust",
    subtext: "Free and open source. Connect an account you already have and start in under a minute.",
  },
};
