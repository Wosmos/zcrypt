import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Core concepts | zcrypt Docs",
  description:
    "The handful of ideas that make zcrypt work: your vault, your passphrase, folders, per-file keys and envelope encryption, encrypted chunks, the vault lock, and staying unlocked on a device.",
  alternates: { canonical: "https://zcrypt.cloud/docs/concepts" },
  openGraph: {
    title: "Core concepts | zcrypt Docs",
    description:
      "Vault, passphrase, folders, per-file keys, chunks, and the vault lock — how the pieces of zcrypt fit together.",
    url: "https://zcrypt.cloud/docs/concepts",
  },
};

const toc = [
  { id: "vault", title: "Your vault" },
  { id: "passphrase", title: "The passphrase" },
  { id: "folders", title: "Folders" },
  { id: "files", title: "Files & per-file keys" },
  { id: "chunks", title: "Chunks" },
  { id: "lock", title: "The vault lock" },
  { id: "stay-unlocked", title: "Staying unlocked on a device" },
];

export default function ConceptsDocPage() {
  return (
    <DocPage
      href="/docs/concepts"
      title="Core concepts"
      description="A few ideas explain almost everything about how zcrypt works. Understand these and the rest of the product reads itself."
      toc={toc}
    >
      <DocSection id="vault" title="Your vault">
        <DocP>
          Your <strong>vault</strong> is your encrypted drive — the entire tree
          of folders and files that belong to you. It is presented like any
          normal drive, but every name and every byte inside it is encrypted on
          your device before it is stored. The server holds only ciphertext and
          the structure needed to fetch it back.
        </DocP>
      </DocSection>

      <DocSection id="passphrase" title="The passphrase">
        <DocP>
          Your <strong>passphrase</strong> is the one secret that unlocks the
          vault. It is not a login credential — your account password handles
          signing in. Instead, zcrypt feeds the passphrase through a key
          derivation function in your browser to produce your{" "}
          <strong>vault key</strong>. That key, and the passphrase behind it,
          are <strong>never transmitted</strong> to our servers.
        </DocP>
        <DocNote type="warning" title="No recovery">
          Because nothing readable leaves your device, a forgotten passphrase
          cannot be reset — there is nothing on our side to recover it from.
          Store it in a password manager. See{" "}
          <Link href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Passphrase &amp; key management
          </Link>{" "}
          for the derivation details.
        </DocNote>
      </DocSection>

      <DocSection id="folders" title="Folders">
        <DocP>
          Folders are real and nestable, just like on a desktop drive — open
          one and create another inside it, as deep as you like. A folder&apos;s{" "}
          <strong>name is encrypted</strong> on your device exactly like file
          contents, so your organization is private too. When the vault is
          locked, names show as placeholders until you unlock.
        </DocP>
        <DocP>
          A folder can also have its own password layered on top — see{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Per-folder encryption
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="files" title="Files & per-file keys">
        <DocP>
          zcrypt uses <strong>envelope encryption</strong>. Each file gets its
          own random <strong>content encryption key</strong> (CEK) that encrypts
          that file&apos;s bytes with AES-256-GCM. The CEK itself is then
          encrypted (&ldquo;wrapped&rdquo;) by the key derived from your
          passphrase.
        </DocP>
        <DocP>
          The payoff: your passphrase only ever has to protect small wrapped
          keys, not gigabytes of data. To open a file, zcrypt unwraps its CEK
          with your vault key, then uses the CEK to decrypt the content — all
          locally.
        </DocP>
      </DocSection>

      <DocSection id="chunks" title="Chunks">
        <DocP>
          After compression and encryption, each file is split into{" "}
          <strong>chunks</strong> — encrypted pieces of roughly 16 MB. Chunks
          are what actually get uploaded, one per request, to the repositories
          or channel on your connected platform. On download, zcrypt fetches the
          chunks, verifies them, and reassembles the file on your device.
        </DocP>
      </DocSection>

      <DocSection id="lock" title="The vault lock">
        <DocP>
          The vault has a single lock state, surfaced as <strong>one pill</strong>{" "}
          in the interface and unlocked through <strong>one modal</strong>. Enter
          your passphrase once and the whole vault unlocks for the rest of the
          session — there is no per-file or per-folder prompting to wade through.
        </DocP>
        <DocP>
          The unlock lasts for a session <strong>time-to-live (TTL)</strong>.
          When it expires, the pill returns to locked and the next action that
          needs your key reopens the single modal.
        </DocP>
      </DocSection>

      <DocSection id="stay-unlocked" title="Staying unlocked on a device">
        <DocP>
          When unlocking, you can choose{" "}
          <strong>&ldquo;keep me unlocked on this device.&rdquo;</strong> Instead
          of re-typing your passphrase every session, zcrypt stores it{" "}
          <strong>encrypted at rest</strong> in your browser&apos;s IndexedDB,
          sealed under a <strong>non-extractable</strong> key the browser will
          not hand back to any script.
        </DocP>
        <DocTable
          head={["", "Plain localStorage", "zcrypt on this device"]}
          rows={[
            ["Stored as", "Readable text", "Ciphertext in IndexedDB"],
            ["Sealing key", "None", "Non-extractable, browser-held"],
            ["Sent to server", "n/a", "Never"],
          ]}
        />
        <DocNote type="security" title="Safer than localStorage — but still local trust">
          This is meaningfully harder to scrape than a passphrase sitting in
          localStorage, and it is never sent to the server. It still trusts the
          device, so only enable it on hardware you control. Locking the vault or
          signing out clears it.
        </DocNote>
      </DocSection>
    </DocPage>
  );
}
