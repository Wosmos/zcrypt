import { FolderOpen, Lock, Key, Shield, RefreshCw, Layers } from "@/lib/icons";
import type { ReactNode } from "react";

export interface FoldersPageData {
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

export const folders: FoldersPageData = {
  hero: {
    eyebrow: "Encrypted folders",
    headlineTop: "Folders that can",
    headlineGradient: "lock themselves.",
    subtext: (
      <>
        Organize with real, nestable folders whose names are encrypted on your
        device. Then give any folder its own password — a second lock, separate
        from your vault, that keeps it sealed even when everything else is open.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/folder-encryption",
  },

  capabilitiesSection: {
    heading: "Structure that keeps secrets",
    subheading: "The folders you expect, plus a second layer of encryption you can drop onto any one of them — all the way down.",
  },
  capabilities: [
    {
      Icon: FolderOpen,
      title: "Real, nestable folders",
      desc: "Build the hierarchy you actually think in — folders inside folders, as deep as you need. Not tags pretending to be structure.",
    },
    {
      Icon: Lock,
      title: "Encrypted folder names",
      desc: "Every folder name is encrypted on your device. The server stores opaque ciphertext — it never learns what you called anything.",
    },
    {
      Icon: Key,
      title: "A password per folder",
      desc: "Give any folder its own password, separate from your vault passphrase. It guards the most sensitive corners on its own terms.",
    },
    {
      Icon: Shield,
      title: "Sealed independently",
      desc: "A protected folder stays locked even while the rest of your vault is open. Unlocking your vault is not the same as unlocking it.",
    },
    {
      Icon: RefreshCw,
      title: "Automatic re-keying",
      desc: "Move a file into or out of a protected folder and it is re-encrypted under the right key automatically. No manual steps, no leaks.",
    },
    {
      Icon: Layers,
      title: "Verified locally",
      desc: "The folder password is checked on your device against the folder's own key material — never sent to the server, never round-tripped.",
    },
  ],

  tieIn: {
    eyebrow: "A lock within the lock",
    heading: "A key the server never sees",
    body: (
      <>
        When you protect a folder, its files are re-encrypted under a key derived
        from a password only you know. That password is verified locally against
        the folder&apos;s own key material — it never travels to the server, and
        neither does the key it unlocks. Move a file in or out and zcrypt re-keys
        it for you, so nothing is ever left under the wrong lock.
      </>
    ),
    checklistItems: [
      "Folder password derived to a key on your device",
      "Verified locally — no server round-trip, no guess oracle",
      "Stays sealed even while your vault is unlocked",
      "Files re-encrypted automatically when moved in or out",
    ],
    linkLabel: "How folder encryption works",
    linkHref: "/docs/folder-encryption",
  },

  related: [
    {
      href: "/features/encrypted-drive",
      title: "The encrypted drive",
      desc: "Folders, search, previews, drag-and-drop — encrypted end to end.",
    },
    {
      href: "/docs/folders",
      title: "Docs: Folders",
      desc: "Create, nest, move, and rename folders in your vault.",
    },
    {
      href: "/docs/folder-encryption",
      title: "Docs: Folder encryption",
      desc: "How per-folder passwords and re-keying work under the hood.",
    },
  ],

  cta: {
    heading: "Lock the folders that matter most",
    subtext: "Free and open source. Organize your vault and seal any folder with a password of its own.",
  },
};
