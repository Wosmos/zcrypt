import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Quickstart | zcrypt Docs",
  description:
    "Create a free account, set your passphrase, connect a storage platform, and upload your first encrypted file to zcrypt in a few minutes. No plans, no credit card.",
  alternates: { canonical: "https://zcrypt.cloud/docs/getting-started" },
  openGraph: {
    title: "Quickstart | zcrypt Docs",
    description:
      "Sign up, understand your passphrase, connect storage, and upload your first encrypted file to zcrypt — free and open source.",
    url: "https://zcrypt.cloud/docs/getting-started",
  },
};

const toc = [
  { id: "account", title: "Create a free account" },
  { id: "passphrase", title: "Understand your passphrase" },
  { id: "storage", title: "Connect a storage platform" },
  { id: "upload", title: "Upload your first file" },
  { id: "open", title: "Preview or download it" },
  { id: "next", title: "Where to go next" },
];

export default function GettingStartedPage() {
  return (
    <DocPage
      href="/docs/getting-started"
      title="Quickstart"
      description="Sign up, set your passphrase, connect a storage platform you already use, and upload your first encrypted file — in a few minutes."
      toc={toc}
    >
      <DocNote type="info" title="Free, open source, and yours">
        zcrypt has no paid tiers, no credit card, and no storage to sell you.
        You bring your own backend — your encrypted files live in a GitHub,
        GitLab, Hugging Face, or Telegram account you already have — so your
        capacity is whatever free space those platforms give you.
      </DocNote>

      <DocSection id="account" title="1 · Create a free account">
        <DocP>
          Sign up at <strong>zcrypt.cloud</strong> with your email and a strong
          account password, then click the verification link we email you.
          Verifying your address activates your account.
        </DocP>
        <DocP>
          This account password only logs you in. It is <em>not</em> what
          encrypts your files — that is the passphrase you set next, and the two
          are intentionally different.
        </DocP>
      </DocSection>

      <DocSection id="passphrase" title="2 · Understand your passphrase">
        <DocP>
          On your first sign-in you create a <strong>passphrase</strong>. zcrypt
          uses it to derive your encryption key locally, in your browser. The
          passphrase and the key it derives never leave your device and are
          never sent to our servers — that is what makes zcrypt zero-knowledge.
        </DocP>
        <DocP>
          Choose something strong and memorable, and store it in a password
          manager. For the full picture of how your key is derived and held, see{" "}
          <Link href="/docs/concepts" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Core concepts
          </Link>
          .
        </DocP>
        <DocNote type="warning" title="There is no passphrase recovery">
          Because your passphrase never touches our servers, we cannot reset it
          for you. If you lose it, your files cannot be decrypted by anyone,
          including us. Save it somewhere safe.
        </DocNote>
      </DocSection>

      <DocSection id="storage" title="3 · Connect a storage platform">
        <DocP>
          zcrypt does not run a storage farm. Your encrypted data lives in a
          platform account you connect: <strong>GitHub</strong>,{" "}
          <strong>GitLab</strong>, <strong>Hugging Face</strong>, or{" "}
          <strong>Telegram</strong>. Open <strong>Settings</strong> and add an
          access token (or a bot token and channel for Telegram). zcrypt then
          creates private repositories — or a private channel — on your behalf
          and stores your encrypted chunks there.
        </DocP>
        <DocP>
          Want more room? Connect more than one platform. For per-platform setup
          and how tokens are kept, see{" "}
          <Link href="/docs/connect-storage" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Connect your storage
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="upload" title="4 · Upload your first file">
        <DocP>
          Open your vault and drag a file onto the explorer, or click to browse.
          Before anything leaves your device, zcrypt does all of the following{" "}
          <strong>in your browser</strong>:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Compresses</strong> the file with zstd — client-side, so
              the savings happen before encryption.
            </>,
            <>
              <strong>Encrypts</strong> it with AES-256-GCM under a key wrapped
              by your passphrase.
            </>,
            <>
              <strong>Splits</strong> it into encrypted chunks (~4–16 MB each,
              tuned to your device) and uploads them to your connected platform.
            </>,
          ]}
        />
        <DocP>
          You see real-time progress as each chunk completes. Only ciphertext
          ever reaches your storage platform.
        </DocP>
      </DocSection>

      <DocSection id="open" title="5 · Preview or download it">
        <DocP>
          Click the file to open it in the full-screen viewer — images, video,
          audio, PDFs, documents, and text are decrypted on the fly and rendered
          locally, with no plaintext leaving your device. Or download it: zcrypt
          fetches the chunks, reassembles, decrypts, and decompresses them back
          into the original file on your device.
        </DocP>
        <DocP>
          If your vault is locked, you will be asked for your passphrase once;
          it then unlocks everything for the rest of your session.
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/concepts" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Core concepts — vault, passphrase, folders, and chunks
            </Link>,
            <Link key="b" href="/docs/connect-storage" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Connect your storage — tokens, encryption at rest, and auto-rotation
            </Link>,
            <Link key="c" href="/docs/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Folders &amp; the file explorer — organize your encrypted drive
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
