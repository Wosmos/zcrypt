import { Layers, Users, ShieldCheck } from "@/lib/icons";
import type { ReactNode } from "react";

export interface PrivacyPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
    trustLine: ReactNode;
  };
  decoy: {
    eyebrow: string;
    heading: string;
    body: string;
    points: string[];
  };
  deadMansSwitch: {
    eyebrow: string;
    heading: string;
    body: string;
    does: string[];
    doesNot: string[];
    doesNotFootnote: string;
  };
  betaSection: { heading: string; subheading: string };
  betaTools: { Icon: typeof Layers; title: string; desc: string; caveat: string; href: string }[];
  zeroKnowledgeTieIn: { heading: string; body: string };
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const privacy: PrivacyPageData = {
  hero: {
    eyebrow: "Privacy tools",
    headlineTop: "Privacy for the",
    headlineGradient: "moments that matter.",
    subtext: (
      <>
        Encryption keeps your files unreadable. These tools go a step further —
        for being pressured to unlock, for going quiet unexpectedly, and for the
        edge cases real privacy has to plan for. Built on the same zero-knowledge
        core, and honest about what each one actually does.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/decoy-profile",
    trustLine: (
      <>
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        Zero-knowledge by design — we never hold your keys or your plaintext.
      </>
    ),
  },

  decoy: {
    eyebrow: "Plausible deniability",
    heading: "A decoy profile for when you're forced to open up",
    body: "Set a second “decoy” password. When you log in with it, zcrypt opens an innocent-looking vault full of harmless files — not your real one. Under coercion, at a border crossing, or anywhere you can't say no, you can unlock something real-looking without exposing what actually matters.",
    points: [
      "A second decoy password you set yourself, separate from your real one.",
      "Logging in with it opens an innocent-looking vault with believable filler files.",
      "Nothing in the decoy hints that a real vault exists behind a different password.",
    ],
  },

  deadMansSwitch: {
    eyebrow: "If you go quiet",
    heading: "A dead man's switch that reaches a person",
    body: "Choose a trusted contact and a check-in window. If you don't log in for that long, zcrypt emails them a notification. It's a safety net for journalists, activists, and anyone who needs someone alerted if they suddenly can't check in.",
    does: [
      "Emails a trusted contact you choose if you don't log in for a set window.",
      "Timeout is configurable from 7 to 365 days — you decide the check-in cadence.",
      "Every login automatically resets the countdown, so normal use keeps it quiet.",
    ],
    doesNot: [
      "It does not hand over your files.",
      "It does not release your passphrase or any keys.",
      "It is a heads-up to a person — not an automated handover of access.",
    ],
    doesNotFootnote: "Because zcrypt is zero-knowledge, there are no keys for us to hand over — so the switch alerts a person rather than releasing your data.",
  },

  betaSection: {
    heading: "Maturing, and honestly labelled",
    subheading: "These two are real and usable, but still evolving. We'd rather tell you exactly where they stand than oversell them.",
  },
  // Beta tools — visibly labelled, with their real current limits spelled out.
  betaTools: [
    {
      Icon: Layers,
      title: "Snapshots & integrity",
      desc: "Capture a point-in-time manifest of your vault and detect if a stored file has been altered or tampered with since.",
      caveat:
        "Snapshots are manifests for tamper detection — not a restore or version-history system. They don't roll your files back to an earlier state yet.",
      href: "/docs/snapshots-integrity",
    },
    {
      Icon: Users,
      title: "Shared vaults",
      desc: "Collaborate in a vault with other people using viewer, editor, and admin roles.",
      caveat:
        "The cryptographic key-sharing behind roles is still maturing. Treat shared vaults as experimental and don't rely on them for high-stakes secrets yet.",
      href: "/docs/shared-vaults",
    },
  ],

  zeroKnowledgeTieIn: {
    heading: "It all sits on a zero-knowledge core",
    body: "Every one of these tools is bounded by the same promise: your files are encrypted on your device with AES-256-GCM before they leave, and we never see your passphrase or your plaintext. The decoy hides a vault we can't read either way; the dead man's switch notifies a person because there are no keys for us to release. Privacy features that can't betray you, because the architecture won't let them.",
  },

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "Real folders and a file explorer — every name encrypted on your device.",
    },
    {
      href: "/docs/dead-mans-switch",
      title: "Dead man's switch",
      desc: "Set the contact, timeout, and message for your inactivity alert.",
    },
    {
      href: "/docs/security",
      title: "Security model",
      desc: "How zero-knowledge encryption and our threat model fit together.",
    },
  ],

  cta: {
    heading: "Privacy you can actually reason about",
    subtext: "Free and open source. Bring a storage account you already own, set a decoy password, and arm your safety net in minutes.",
  },
};
