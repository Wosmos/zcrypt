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
  title: "Sync & device transfer | zcrypt Docs",
  description:
    "Two ways zcrypt moves data between your own devices: encrypted clipboard sync that pushes text, images, and links live over SSE, and a real-time device-to-device file transfer using a 6-digit room code with the server as a blind relay.",
  alternates: { canonical: "https://zcrypt.cloud/docs/sync-transfer" },
  openGraph: {
    title: "Sync & device transfer | zcrypt Docs",
    description:
      "Encrypted clipboard sync and end-to-end device-to-device transfer — the server relays, it never reads.",
    url: "https://zcrypt.cloud/docs/sync-transfer",
  },
};

const toc = [
  { id: "clipboard", title: "Encrypted clipboard sync" },
  { id: "clipboard-how", title: "How clipboard sync works" },
  { id: "transfer", title: "Device-to-device transfer" },
  { id: "transfer-how", title: "How transfer works" },
  { id: "next", title: "Where to go next" },
];

export default function SyncTransferDocPage() {
  return (
    <DocPage
      href="/docs/sync-transfer"
      title="Sync & device transfer"
      description="Move data between your own devices without it passing through anyone's reach. Clipboard sync keeps recent snippets live across your sessions; device transfer streams a file straight from one device to another with the server acting only as a blind relay."
      toc={toc}
    >
      <DocSection id="clipboard" title="Encrypted clipboard sync">
        <DocP>
          Clipboard sync keeps a short, shared history of small items — text, an
          image, or a link — available across the devices where you&rsquo;re
          signed in. Copy something on one device and it shows up on the others,
          ready to paste.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Item types:</strong> text, image, or link.
            </>,
            <>
              <strong>Size:</strong> up to about <strong>512 KB</strong> per
              item.
            </>,
            <>
              <strong>History:</strong> roughly the last <strong>30 items</strong>{" "}
              are retained; older ones are pruned automatically.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="clipboard-how" title="How clipboard sync works">
        <DocP>
          Each item is encrypted on your device before it&rsquo;s stored. When a
          new item arrives, zcrypt notifies your other signed-in devices live
          over an <strong>SSE</strong> (server-sent events) stream so they can
          fetch it. The notification carries only metadata — the item&rsquo;s id,
          type, size, and timestamp — never the plaintext.
        </DocP>
        <DocNote type="security" title="What the server sees">
          The server relays <strong>metadata</strong> to wake up your other
          devices, and stores the item as ciphertext. The actual content is
          decrypted only on your devices.
        </DocNote>
      </DocSection>

      <DocSection id="transfer" title="Device-to-device transfer">
        <DocP>
          Device transfer streams a file directly from one device to another in
          real time. The sending device gets a <strong>6-digit room code</strong>
          ; enter that code on the receiving device to pair them, and the file
          flows between them while both stay connected.
        </DocP>
      </DocSection>

      <DocSection id="transfer-how" title="How transfer works">
        <DocP>
          Pairing and streaming run over a <strong>WebSocket</strong> relay. The
          file is <strong>end-to-end encrypted</strong> between the two devices;
          the server simply forwards the encrypted messages from sender to
          receiver. It is a <strong>blind relay</strong> — it stores nothing and
          cannot read what passes through.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Pairing:</strong> a 6-digit code links exactly one sender
              to one receiver.
            </>,
            <>
              <strong>Short-lived:</strong> rooms expire automatically after a
              few minutes, so a code can&rsquo;t be reused later.
            </>,
            <>
              <strong>Nothing stored:</strong> unlike Send, transfer keeps no
              copy — if the connection drops mid-transfer, just start a new room.
            </>,
          ]}
        />
        <DocNote type="info" title="Both devices online at once">
          Because the file streams directly between devices, both must be
          connected at the same time. If you need a recipient to pick the file
          up later, use{" "}
          <Link href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Anonymous Send
          </Link>{" "}
          or a{" "}
          <Link href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            share link
          </Link>{" "}
          instead.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Anonymous Send — store-and-forward file sharing
            </Link>,
            <Link key="b" href="/docs/pad" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encrypted Pad — share a one-time encrypted note
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
