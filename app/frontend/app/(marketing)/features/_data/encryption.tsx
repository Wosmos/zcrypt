import { Cpu, Key, Lock, Folder, Server, ShieldCheck } from "@/lib/icons";
import type { ReactNode } from "react";

export interface EncryptionPageData {
  hero: {
    eyebrow: string;
    headlineTop: string;
    headlineGradient: string;
    subtext: ReactNode;
    secondaryLabel: string;
    secondaryHref: string;
  };
  boundary: {
    device: { title: string; items: string[] };
    server: { title: string; items: string[] };
  };
  guarantees: { Icon: typeof Cpu; title: string; desc: string }[];
  pipelineSection: { eyebrow: string; heading: string; subheading: string };
  pipeline: { step: string; title: string; desc: string }[];
  tieIn: {
    heading: ReactNode;
    body: ReactNode;
    checklist: ReactNode;
    linkLabel: string;
    linkHref: string;
    panelIntro: string[];
  };
  related: { href: string; title: string; desc: string }[];
  cta: { heading: string; subtext: string };
}

export const encryption: EncryptionPageData = {
  hero: {
    eyebrow: "Zero-knowledge encryption",
    headlineTop: "We can't read your files.",
    headlineGradient: "That's the whole point.",
    subtext: (
      <>
        Your files are encrypted on your own device with AES-256-GCM before
        they ever leave it. The key is derived from your passphrase and never
        transmitted. We store ciphertext and nothing else — no keys, no
        plaintext, not even your folder names.
      </>
    ),
    secondaryLabel: "Read the docs",
    secondaryHref: "/docs/zero-knowledge",
  },

  boundary: {
    device: {
      title: "Your device",
      items: [
        "Passphrase entered here, stays here",
        "Your key is derived locally",
        "Files and their names are encrypted",
        "Plaintext never leaves",
      ],
    },
    server: {
      title: "Our servers",
      items: [
        "Encrypted blobs, that's it",
        "No passphrase, no derived key",
        "No plaintext file contents",
        "No readable file or folder names",
      ],
    },
  },

  guarantees: [
    {
      Icon: Cpu,
      title: "Encrypted on your device",
      desc: "Compression and AES-256-GCM encryption happen in your browser, on your machine, before a single byte goes over the wire.",
    },
    {
      Icon: Key,
      title: "Your key never travels",
      desc: "Your encryption key is derived from your passphrase on your own device and stays there. It is never sent to us.",
    },
    {
      Icon: Lock,
      title: "A unique key per file",
      desc: "Each file gets its own random content key, wrapped by your passphrase key. One file's key can never unlock another.",
    },
    {
      Icon: Folder,
      title: "Even folder names are sealed",
      desc: "File names and folder names are encrypted client-side too. The server can't read your files, their names, or how you organized them.",
    },
    {
      Icon: Server,
      title: "The server only sees ciphertext",
      desc: "On our side there are no keys and no plaintext — only opaque encrypted blobs we couldn't open even if compelled to.",
    },
    {
      Icon: ShieldCheck,
      title: "Tamper-evident by design",
      desc: "AES-256-GCM authenticates every chunk. If ciphertext is altered in transit or at rest, decryption fails loudly instead of returning garbage.",
    },
  ],

  pipelineSection: {
    eyebrow: "Envelope encryption",
    heading: "How a file gets sealed",
    subheading: "Every upload runs the same four steps, entirely on your device.",
  },
  pipeline: [
    {
      step: "01",
      title: "Derive your key",
      desc: "Your passphrase and a random salt are stretched into a strong key encryption key. This happens locally and the key never leaves your device.",
    },
    {
      step: "02",
      title: "Seal each file with its own key",
      desc: "A fresh random content key is generated per file and used to encrypt it. That content key is then wrapped (encrypted) with your passphrase-derived key.",
    },
    {
      step: "03",
      title: "Encrypt folder names, then chunk",
      desc: "Folder names are encrypted client-side too. The encrypted file is then split into chunks, each individually authenticated.",
    },
    {
      step: "04",
      title: "Upload ciphertext only",
      desc: "Only the wrapped key and the encrypted chunks ever leave your device. The server stores blobs it has no way to read.",
    },
  ],

  tieIn: {
    heading: <>Lose your passphrase and even we can&apos;t recover it</>,
    body: (
      <>
        True zero-knowledge has a price, and we won&apos;t pretend otherwise.
        Because your key is derived from your passphrase and never reaches
        us, we have no &ldquo;reset password and get your files back&rdquo;
        button. If you lose your passphrase, your data stays encrypted
        forever — to you and to everyone else.
      </>
    ),
    checklist: (
      <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
        That is exactly the property that makes the rest of these promises
        real. A provider who can recover your files for you can also be
        compelled to hand them over. We can&apos;t do either.
      </p>
    ),
    linkLabel: "Read the security model",
    linkHref: "/docs/security",
    panelIntro: [
      "Choose a strong passphrase you won't forget — it is the one key to everything.",
      "Previews and downloads are decrypted in your browser, then discarded.",
      "Sharing wraps a file's key for the recipient — without ever exposing your passphrase.",
      "Password-protected folders add a second key, separate from your vault.",
    ],
  },

  related: [
    { href: "/features/encrypted-drive", title: "The encrypted drive", desc: "Real folders, search, and previews on top of this encryption layer." },
    { href: "/docs/zero-knowledge", title: "Zero-knowledge, explained", desc: "What the term means and how we hold ourselves to it." },
    { href: "/docs/security", title: "Security model", desc: "The full technical picture: AES-256-GCM, PBKDF2-SHA256 key derivation at 600,000 iterations, key handling, and the threat model." },
  ],

  cta: {
    heading: "Encryption you don't have to trust us about",
    subtext: "Free and open source. Bring a storage account you already own and encrypt your first file in under a minute.",
  },
};
