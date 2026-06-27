import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Glossary | zcrypt Docs",
  description:
    "Plain-language definitions of the terms used across zcrypt: vault, passphrase, CEK, envelope encryption, chunk, salt, KEK, zero-knowledge, BYOB, repo pool, decoy vault, dead man's switch, TOTP, and zstd.",
  alternates: { canonical: "https://zcrypt.cloud/docs/glossary" },
  openGraph: {
    title: "Glossary | zcrypt Docs",
    description:
      "Every zcrypt term, defined: vault, passphrase, CEK, envelope encryption, chunk, salt, KEK, zero-knowledge, BYOB, and more.",
    url: "https://zcrypt.cloud/docs/glossary",
  },
};

const toc = [
  { id: "terms", title: "Terms" },
  { id: "next", title: "Where to go next" },
];

export default function GlossaryDocPage() {
  return (
    <DocPage
      href="/docs/glossary"
      title="Glossary"
      description="The vocabulary used throughout zcrypt and these docs, defined in one place."
      toc={toc}
    >
      <DocSection id="terms" title="Terms">
        <DocP>
          A few of these are general cryptography terms; the rest are specific to
          how zcrypt works. They build on each other, so it can help to read them
          in order.
        </DocP>
        <DocTable
          head={["Term", "Definition"]}
          rows={[
            [
              <strong key="t">Vault</strong>,
              "Your private, encrypted drive in zcrypt — the folders and files only you can decrypt. It is locked until you unlock it with your passphrase.",
            ],
            [
              <strong key="t">Passphrase</strong>,
              "The secret you choose to protect your vault. It is used on your device to derive your encryption keys and is never sent to or stored by the server — so it cannot be recovered if lost.",
            ],
            [
              <strong key="t">CEK (content encryption key)</strong>,
              "The key that actually encrypts a file's contents. In an envelope scheme the CEK is itself encrypted by a higher-level key rather than used directly from your passphrase.",
            ],
            [
              <strong key="t">Envelope encryption</strong>,
              "A two-layer scheme: data is sealed with a content key (the CEK), and that content key is in turn sealed (\"wrapped\") by another key. It lets zcrypt re-key or re-share data without re-encrypting every byte.",
            ],
            [
              <strong key="t">Chunk</strong>,
              "A fixed-size piece of an encrypted file (up to ~16 MB). Splitting files into chunks makes uploads parallel, resumable, and easy to spread across storage repositories.",
            ],
            [
              <strong key="t">Salt</strong>,
              "Random bytes mixed into key derivation so the same passphrase produces a different key each time. zcrypt uses a unique salt per file, which defeats precomputed-hash attacks.",
            ],
            [
              <strong key="t">KEK (key encryption key)</strong>,
              "A key whose job is to encrypt other keys rather than data. zcrypt derives a per-user KEK from the instance master key (via HKDF) to wrap your stored platform tokens at rest.",
            ],
            [
              <strong key="t">Zero-knowledge</strong>,
              "An architecture where the service holds no ability to read your data — no plaintext and no keys ever cross to the server. The trade-off is that nobody, including us, can recover a lost passphrase.",
            ],
            [
              <strong key="t">BYOB (bring your own backend)</strong>,
              "zcrypt's storage model: you connect your own GitHub, GitLab, Hugging Face, or Telegram account as the backend, so your encrypted data lives on infrastructure you control and your capacity is your platform's free space.",
            ],
            [
              <strong key="t">Repo pool</strong>,
              "The set of repositories zcrypt uses on a storage platform. As a repo nears the platform's size limit, the pool auto-rotates to a new repo, so storage grows without manual intervention.",
            ],
            [
              <strong key="t">Decoy vault</strong>,
              "A second, innocent-looking vault opened by a separate decoy password, for plausible deniability. If compelled to log in, you can reveal the decoy instead of your real vault.",
            ],
            [
              <strong key="t">Dead man's switch</strong>,
              "An optional safeguard that notifies a trusted contact if you stop checking in within a configured window — useful for handing off access if something happens to you.",
            ],
            [
              <strong key="t">TOTP</strong>,
              "Time-based One-Time Password — the six-digit, 30-second codes from an authenticator app. zcrypt uses TOTP for two-factor authentication on sign-in.",
            ],
            [
              <strong key="t">Zstd</strong>,
              "Zstandard, a fast, high-ratio compression algorithm. zcrypt compresses files with zstd before encrypting them, so less data is encrypted and stored.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>
          See these terms in context:{" "}
          <Link href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Encryption model
          </Link>
          ,{" "}
          <Link href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Zero-knowledge architecture
          </Link>
          , and{" "}
          <Link href="/docs/architecture" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Architecture
          </Link>
          .
        </DocP>
      </DocSection>
    </DocPage>
  );
}
