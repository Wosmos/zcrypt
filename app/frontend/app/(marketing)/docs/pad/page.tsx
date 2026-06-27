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
  title: "Encrypted Pad | zcrypt Docs",
  description:
    "Share a one-time encrypted note or paste with zcrypt's Encrypted Pad: up to about 1 MB of text, an expiry of 1 hour, 24 hours, or 7 days, and optional burn-after-read. The server stores only ciphertext.",
  alternates: { canonical: "https://zcrypt.cloud/docs/pad" },
  openGraph: {
    title: "Encrypted Pad | zcrypt Docs",
    description:
      "Share a one-time encrypted note — encrypted in your browser, expiring on a schedule, optionally readable only once.",
    url: "https://zcrypt.cloud/docs/pad",
  },
};

const toc = [
  { id: "what", title: "What a Pad is" },
  { id: "how", title: "How it works" },
  { id: "limits", title: "Size and expiry" },
  { id: "burn", title: "Burn after read" },
  { id: "privacy", title: "Privacy and what we log" },
  { id: "next", title: "Where to go next" },
];

export default function PadDocPage() {
  return (
    <DocPage
      href="/docs/pad"
      title="Encrypted Pad"
      description="Send a snippet of text — a password, a note, a paste — that's encrypted in your browser and can be set to self-destruct after a single read. Think of it as an encrypted, expiring pastebin."
      toc={toc}
    >
      <DocSection id="what" title="What a Pad is">
        <DocP>
          A Pad is a short-lived, encrypted note. You type or paste text, zcrypt
          encrypts it on your device, and you get a link to share. It&rsquo;s the
          right tool when you need to pass along something sensitive in text form
          — credentials, a recovery phrase, a private message — without leaving
          it sitting in a chat log or email forever.
        </DocP>
      </DocSection>

      <DocSection id="how" title="How it works">
        <DocP>
          The text is encrypted in your browser before upload. The server
          receives and stores <strong>only the ciphertext</strong> — it has no
          way to read what you wrote. When the recipient opens the link, the
          ciphertext is fetched and decrypted locally in their browser.
        </DocP>
        <DocList
          items={[
            <>Encryption and decryption happen entirely on-device.</>,
            <>The server holds opaque ciphertext and nothing more.</>,
            <>The recipient needs no account to read the note.</>,
          ]}
        />
      </DocSection>

      <DocSection id="limits" title="Size and expiry">
        <DocList
          items={[
            <>
              <strong>Size:</strong> up to about <strong>1 MB</strong> of text —
              ample for notes, keys, and pastes, but not for files. For files,
              use{" "}
              <Link href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
                Anonymous Send
              </Link>
              .
            </>,
            <>
              <strong>Expiry:</strong> choose <strong>1 hour</strong>,{" "}
              <strong>24 hours</strong>, or <strong>7 days</strong>. After that
              the Pad expires and can no longer be opened.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="burn" title="Burn after read">
        <DocP>
          Enable <strong>burn after read</strong> to make the Pad one-time.
          After the first view it is consumed and removed, so anyone who opens
          the link afterward sees only that it has already been read.
        </DocP>
      </DocSection>

      <DocSection id="privacy" title="Privacy and what we log">
        <DocNote type="security" title="What's private — and what isn't">
          The note&rsquo;s contents stay private — the server only ever stores
          ciphertext. For abuse prevention, the{" "}
          <strong>creator&rsquo;s IP address is recorded</strong> alongside the
          Pad. If that matters to you, create the Pad from a network you&rsquo;re
          comfortable being associated with.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Anonymous Send — share a file instead of text
            </Link>,
            <Link key="b" href="/docs/sync-transfer" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sync &amp; device transfer — push text and links to your own devices
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
