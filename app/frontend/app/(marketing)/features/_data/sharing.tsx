import { Link2, Lock, Clock, Download, XCircle, Eye } from "@/lib/icons";
import type { ReactNode } from "react";

export interface SharingPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  capabilitiesSection: { heading: string; subheading: string };
  capabilities: { Icon: typeof Link2; title: string; desc: string }[];
  tieIn: {
    eyebrow: string;
    heading: ReactNode;
    body: ReactNode;
    checklistItems: string[];
    linkLabel: string;
    linkHref: string;
  };
  moreWaysSection: { heading: string; subheading: string };
  moreWays: { title: string; desc: string }[];
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const sharing: SharingPageData = {
  hero: {
    eyebrow: "Encrypted sharing",
    headlineTop: "Share a file.",
    headlineGradient: "Not the key to your vault.",
    subtext: (
      <>
        Every share link carries its own decryption key inside the URL fragment —
        the one piece of a link a browser never transmits. The recipient opens it,
        their browser decrypts the file, and the server only ever held ciphertext.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/sharing",
  },

  capabilitiesSection: {
    heading: "You decide who, how long, how many",
    subheading: "Sharing without surrendering control. Set the terms on every link, and pull it back the moment you want to.",
  },
  capabilities: [
    {
      Icon: Link2,
      title: "The key rides in the fragment",
      desc: "The decryption key lives in the part of the URL after the # — which browsers never send to a server. We literally can't receive it.",
    },
    {
      Icon: Lock,
      title: "Optional password",
      desc: "Add a password on top of the link. Even someone holding the URL needs the secret you share separately to open it.",
    },
    {
      Icon: Clock,
      title: "Expiry dates",
      desc: "Set a link to stop working after a date or duration. When it lapses, the door closes on its own — no cleanup required.",
    },
    {
      Icon: Download,
      title: "Download limits",
      desc: "Cap how many times a link can be used. Once the count is spent, the link is dead even if someone still has it.",
    },
    {
      Icon: XCircle,
      title: "Revoke anytime",
      desc: "Change your mind? Kill a link instantly from your vault. The ciphertext stays, but no one can open it again.",
    },
    {
      Icon: Eye,
      title: "No account for recipients",
      desc: "Whoever you send it to just opens the link. The file is decrypted in their browser — never on our servers, never in the clear on the wire.",
    },
  ],

  tieIn: {
    eyebrow: "The secret in the #",
    heading: <>Why we can&apos;t read your shares</>,
    body: (
      <>
        A URL fragment — everything after the <span className="font-mono">#</span> —
        is processed only by the browser and is never included in the request sent
        to a server. We put the decryption key there on purpose. The server hands
        over encrypted bytes; the recipient&apos;s browser uses the key from the
        fragment to decrypt them locally. The plaintext never exists on our side.
      </>
    ),
    checklistItems: [
      "Decryption key lives only in the URL fragment",
      "Fragments are never transmitted to the server",
      "Recipients decrypt in-browser, with no account",
      "Optional password adds a second, separate secret",
    ],
    linkLabel: "How sharing works",
    linkHref: "/docs/sharing",
  },

  moreWaysSection: {
    heading: "More ways to send",
    subheading: "Sharing a vault file is one path. For the throwaway and the one-time, there are two more.",
  },
  moreWays: [
    {
      title: "Anonymous Send",
      desc: "Drop a file without an account and get a single link to pass along. It's built to burn after reading — once it's been picked up, it's gone. Good for the thing you want to hand off and forget.",
    },
    {
      title: "Encrypted Pad",
      desc: "Write a one-time note, encrypt it, and share the link. The recipient reads it once — then it's burned. For a password, an address, a short message that shouldn't linger in anyone's inbox.",
    },
  ],

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "Where shared files live — folders, search, and previews, sealed.",
    },
    {
      href: "/docs/sharing",
      title: "Docs: Sharing",
      desc: "Set passwords, expiry, and limits, and learn how links decrypt.",
    },
    {
      href: "/register",
      title: "Send your first file",
      desc: "Create a vault and share a link in under a minute.",
    },
  ],

  cta: {
    heading: "Share like the server isn't watching",
    subtext: "Free and open source. Hand someone a file without handing it to us.",
  },
};
