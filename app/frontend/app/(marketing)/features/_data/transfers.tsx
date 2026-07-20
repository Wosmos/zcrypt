import { Clock, Pause, Play, RefreshCw, Archive, Upload } from "@/lib/icons";
import type { ReactNode } from "react";

export interface TransfersPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  capabilitiesSection: { heading: string; subheading: string };
  capabilities: { Icon: typeof Clock; title: string; desc: string }[];
  tieIn: {
    eyebrow: string;
    heading: string;
    body: ReactNode;
    checklistItems: string[];
    linkLabel: string;
    linkHref: string;
  };
  deviceToDevice: {
    eyebrow: string;
    heading: string;
    body: ReactNode;
    checklistItems: string[];
  };
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const transfers: TransfersPageData = {
  hero: {
    eyebrow: "The transfer manager",
    headlineTop: "Start it. Walk away.",
    headlineGradient: "It picks up where it stopped.",
    subtext: (
      <>
        One docked panel tracks every upload and download. Live progress and
        ETA, pause and resume without re-encrypting, retry on failure, and
        bulk ZIP downloads — and it keeps running as you move around the app.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/transfer-manager",
  },

  capabilitiesSection: {
    heading: "Built for big files and flaky networks",
    subheading: "Because everything is encrypted on your device first, transfers have to be resilient. So they are.",
  },
  capabilities: [
    {
      Icon: Clock,
      title: "Live progress & ETA",
      desc: "Watch every transfer move in real time — per-file percentage, current stage, and a running estimate of time remaining.",
    },
    {
      Icon: Pause,
      title: "Pause without losing work",
      desc: "Pause an upload at a chunk boundary and walk away. The session stays intact, so nothing already encrypted is thrown out.",
    },
    {
      Icon: Play,
      title: "Resume where it left off",
      desc: "Resuming reuses the same encryption key and skips chunks the server already has. No re-encrypting, no starting over.",
    },
    {
      Icon: RefreshCw,
      title: "Retry on failure",
      desc: "A dropped connection doesn't mean a restart. Retry picks the transfer back up from the last confirmed chunk.",
    },
    {
      Icon: Archive,
      title: "Bulk ZIP downloads",
      desc: "Select many files and download them as a single ZIP — each one decrypted in your browser and packed locally.",
    },
    {
      Icon: Upload,
      title: "Survives navigation",
      desc: "The manager is docked once and persists as you move around the app. Browse, open files, and start more work while transfers run.",
    },
  ],

  tieIn: {
    eyebrow: "Resume that actually resumes",
    heading: "No re-encrypting. No re-uploading.",
    body: (
      <>
        When you pause or hit a network hiccup, the upload stops at a clean
        chunk boundary and holds onto its session. Resuming reuses the very
        same content key, so the chunks already on the server still line up
        — it simply continues with the chunks that are missing.
      </>
    ),
    checklistItems: [
      "Pauses at a chunk boundary, keeps the session alive",
      "Resumes with the same key — already-encrypted chunks stay valid",
      "Skips chunks the server already confirmed",
      "Retry after a failure continues from the last confirmed chunk",
    ],
    linkLabel: "How uploading works",
    linkHref: "/docs/uploading",
  },

  deviceToDevice: {
    eyebrow: "Also: device-to-device",
    heading: "Send a file straight to another device",
    body: (
      <>
        Separate from the vault, zcrypt can stream a file directly from
        one device to another. The sender gets a six-digit code; whoever
        enters it on the other end starts receiving. The data is
        end-to-end encrypted — our server is a blind relay that passes
        along ciphertext it can&apos;t read.
      </>
    ),
    checklistItems: [
      "Pair with a 6-digit code",
      "End-to-end encrypted, the relay only sees ciphertext",
      "Nothing has to land in your vault first",
    ],
  },

  related: [
    { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "Where your transfers land — real folders, search, and previews." },
    { href: "/docs/transfer-manager", title: "Transfer manager docs", desc: "Every control in the docked panel, explained." },
    { href: "/docs/uploading", title: "Uploading guide", desc: "How files are compressed, encrypted, chunked, and sent." },
  ],

  cta: {
    heading: "Move big files without babysitting them",
    subtext: "Free and open source. Bring a storage account you already own and start your first upload in under a minute.",
  },
};
