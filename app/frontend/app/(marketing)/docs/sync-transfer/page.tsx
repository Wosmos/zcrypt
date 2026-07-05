import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Sync & device transfer | zcrypt Docs",
  description:
    "How zcrypt moves data between your own devices: offline pins that keep chosen files on hand per device, end-to-end encrypted clipboard sync pushed live over SSE, folder sync configured for the zcrypt desktop client, and real-time device-to-device file transfer over a 6-digit room code.",
  alternates: { canonical: "https://zcrypt.cloud/docs/sync-transfer" },
  openGraph: {
    title: "Sync & device transfer | zcrypt Docs",
    description:
      "Offline pins, encrypted clipboard sync, folder sync, and device-to-device transfer — the server holds ciphertext and metadata, never your plaintext.",
    url: "https://zcrypt.cloud/docs/sync-transfer",
  },
};

const toc = [
  { id: "offline", title: "Offline pins" },
  { id: "clipboard", title: "Encrypted clipboard sync" },
  { id: "clipboard-how", title: "How clipboard sync works" },
  { id: "folders", title: "Folder sync" },
  { id: "transfer", title: "Device-to-device transfer" },
  { id: "next", title: "Where to go next" },
];

export default function SyncTransferDocPage() {
  return (
    <DocPage
      href="/docs/sync-transfer"
      title="Sync & device transfer"
      description="Keep your own devices in step without handing anyone your plaintext. The Sync & Offline tab holds three tools — offline pins, encrypted clipboard sync, and folder sync — while a separate Transfer tab streams a file straight from one device to another."
      toc={toc}
    >
      <DocSection id="offline" title="Offline pins">
        <DocP>
          Offline pins let you mark specific files to keep available on a given
          device. Pinning is <strong>per device</strong>: each browser is given
          its own random device id (kept locally on that device), and your pins
          are recorded against that device &mdash; so every device keeps its own
          list, and pinning or unpinning on one doesn&rsquo;t change the others.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Pick a device:</strong> the tab shows the current
              device&rsquo;s short id, so you can tell which device you&rsquo;re
              pinning for.
            </>,
            <>
              <strong>Pin or unpin:</strong> toggle any file in your vault to add
              or remove it from that device&rsquo;s offline list.
            </>,
            <>
              <strong>Stays private:</strong> a pin only records <em>which</em>{" "}
              file you want kept on hand &mdash; the file itself stays encrypted,
              exactly as it is in your vault.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="clipboard" title="Encrypted clipboard sync">
        <DocP>
          Clipboard sync keeps a short, shared history of small snippets
          available across the sessions where you&rsquo;re signed in. Add a
          snippet on one device and it appears on the others in real time, ready
          to copy.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Item types:</strong> text and links. A snippet that is a
              lone <code>http(s)</code> URL is tagged as a link; everything else
              is text. The web tool captures typed or pasted text only &mdash;
              there is no image capture.
            </>,
            <>
              <strong>Size:</strong> up to <strong>512 KB</strong> per snippet.
            </>,
            <>
              <strong>Retention:</strong> each snippet is deleted automatically{" "}
              <strong>24 hours</strong> after you add it, and only your most
              recent snippets are kept (the server retains the latest 30).
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="clipboard-how" title="How clipboard sync works">
        <DocP>
          Each snippet is encrypted <strong>in your browser</strong> with a
          256-bit AES-GCM key before it&rsquo;s sent. That key is generated on
          your device and stored only in the browser &mdash; it never leaves the
          device and is never sent to the server. When you add a snippet, the
          server stores only the <strong>ciphertext</strong> plus lightweight
          metadata (its id, type, size, and timestamp) and pushes a live{" "}
          <strong>SSE</strong> (server-sent events) &ldquo;clipboard&rdquo; event
          to your other signed-in sessions so they can pull it. Fetching a
          snippet returns the ciphertext, which is decrypted locally.
        </DocP>
        <DocNote type="security" title="What the server sees">
          The server only ever holds the snippet as <strong>ciphertext</strong>{" "}
          and the metadata it needs to wake up your other sessions. It never
          receives the encryption key and cannot read a snippet&rsquo;s
          contents.
        </DocNote>
        <DocNote type="info" title="Each device needs the same key">
          Because the key lives only in the browser and isn&rsquo;t synced by the
          server, a device has to hold the matching key to read a snippet. A
          device without it will show a &ldquo;different device key&rdquo; notice
          instead of the plaintext &mdash; the trade-off of keeping the key
          entirely on your side.
        </DocNote>
      </DocSection>

      <DocSection id="folders" title="Folder sync">
        <DocP>
          Folder sync lets you register local folder paths that the{" "}
          <strong>zcrypt desktop client</strong> should back up automatically.
          The web app is only for <strong>configuration</strong>: you add a
          folder path and an optional label, and toggle each one active or
          paused. The browser never reads or uploads the files in those folders
          &mdash; that work is done by the desktop client.
        </DocP>
        <DocP>
          To run the actual backup, run the sync command on each device where
          those folders live:
        </DocP>
        <DocCode label="Terminal">zcrypt sync</DocCode>
        <DocNote type="info" title="Removing a folder">
          Deleting a folder configuration only stops future syncing for it. Files
          that were already backed up stay in your vault.
        </DocNote>
      </DocSection>

      <DocSection id="transfer" title="Device-to-device transfer">
        <DocP>
          The separate <strong>Transfer</strong> tab streams a file directly from
          one device to another in real time. The sending device gets a{" "}
          <strong>6-digit room code</strong>; enter that code on the receiving
          device to pair them, and the file flows between them while both stay
          connected.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Encrypted before it leaves:</strong> the file is encrypted
              in your browser and streamed in small chunks over a WebSocket
              relay.
            </>,
            <>
              <strong>Nothing stored:</strong> the relay keeps the pairing room
              only in memory &mdash; it is torn down as soon as the transfer
              finishes, and an unclaimed room expires after about 10 minutes.
            </>,
            <>
              <strong>Both online at once:</strong> because the file streams
              straight between the two devices, both must be connected at the same
              time. If the connection drops mid-transfer, just start a new room.
            </>,
          ]}
        />
        <DocNote type="info" title="Recipient not online?">
          Device-to-device transfer needs both ends connected together. If you
          need someone to pick a file up later, use{" "}
          <Link href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Anonymous Send
          </Link>{" "}
          or a{" "}
          <Link href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            share link
          </Link>{" "}
          instead &mdash; both store the encrypted file so the recipient can
          fetch it on their own schedule.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Anonymous Send — store-and-forward file sharing
            </Link>,
            <Link key="b" href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share links — password, expiry, and download limits
            </Link>,
            <Link key="c" href="/docs/pad" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encrypted Pad — share a one-time encrypted note
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
