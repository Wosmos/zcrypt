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
  title: "Downloading | zcrypt Docs",
  description:
    "How zcrypt downloads: the browser fetches encrypted chunks, verifies each chunk's SHA-256, decrypts with AES-256-GCM, and decompresses with zstd — entirely on your device. Protected-folder files prompt for the folder password.",
  alternates: { canonical: "https://zcrypt.cloud/docs/downloading" },
  openGraph: {
    title: "Downloading | zcrypt Docs",
    description:
      "Fetching, verifying, decrypting, and decompressing your files locally in zcrypt — with protected-folder prompts.",
    url: "https://zcrypt.cloud/docs/downloading",
  },
};

const toc = [
  { id: "local", title: "Entirely on your device" },
  { id: "steps", title: "The four steps" },
  { id: "integrity", title: "Integrity verification" },
  { id: "protected", title: "Protected folders" },
  { id: "next", title: "Where to go next" },
];

export default function DownloadingDocPage() {
  return (
    <DocPage
      href="/docs/downloading"
      title="Downloading"
      description="Getting a file back is the upload pipeline in reverse. Your browser pulls the encrypted chunks, checks each one, and rebuilds the original — and the plaintext is reconstructed only on your device."
      toc={toc}
    >
      <DocSection id="local" title="Entirely on your device">
        <DocP>
          The server&apos;s only role in a download is to hand back the encrypted
          chunks it stored (or fetch them from your storage platform on your
          behalf). Every step that turns those chunks back into a readable file
          — verification, decryption, decompression — runs locally. The server
          never sees a decrypted byte and never sees your passphrase.
        </DocP>
      </DocSection>

      <DocSection id="steps" title="The four steps">
        <DocList
          ordered
          items={[
            <>
              <strong>Fetch.</strong> The browser requests the file&apos;s
              encrypted chunks, pulling several in parallel for speed. Each chunk
              arrives as raw ciphertext.
            </>,
            <>
              <strong>Verify.</strong> Each chunk is hashed and compared against
              its stored SHA-256 before it is used.
            </>,
            <>
              <strong>Decrypt.</strong> The chunks are reassembled and decrypted
              with AES-256-GCM, using the per-file key unwrapped from your
              passphrase (or the folder password, for a protected folder).
            </>,
            <>
              <strong>Decompress.</strong> The decrypted blob is decompressed with
              zstd back to the original file and saved to your device.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="integrity" title="Integrity verification">
        <DocP>
          The SHA-256 check on every chunk is not just for spotting a flaky
          network — it&apos;s a tamper check. Because AES-256-GCM is also an
          authenticated cipher, a chunk that was altered in storage fails to
          decrypt rather than producing garbage. A corrupted or tampered piece is
          caught before it can reach the reassembled file.
        </DocP>
        <DocNote type="security" title="Wrong key, clean failure">
          If the wrong passphrase or folder password is used, decryption fails
          outright instead of yielding a damaged file — the authenticated cipher
          simply will not open without the correct key.
        </DocNote>
      </DocSection>

      <DocSection id="protected" title="Protected folders">
        <DocP>
          A file stored inside a{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">password-protected folder</Link>{" "}
          is encrypted under that folder&apos;s password, not your vault
          passphrase. Downloading one prompts for the folder password (if the
          folder isn&apos;t already unlocked in this session), and that password
          is what unwraps the key locally. An unlocked vault alone is not enough
          to open a protected folder&apos;s files.
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/transfer-manager" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Transfer manager — track, retry, and stop downloads
            </Link>,
            <Link key="b" href="/docs/bulk" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Bulk operations — download many files at once as a ZIP
            </Link>,
            <Link key="c" href="/docs/viewing-files" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Viewing &amp; previewing — open files without saving them
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
