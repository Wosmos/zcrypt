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
  title: "How it works | zcrypt Docs",
  description:
    "Follow a file through zcrypt end to end: on your device it is compressed with zstd, encrypted with AES-256-GCM under a random per-file key, split into ~16 MB chunks, and pushed to your own storage. Downloading reverses every step.",
  alternates: { canonical: "https://zcrypt.cloud/docs/how-it-works" },
  openGraph: {
    title: "How it works | zcrypt Docs",
    description:
      "A file's journey through zcrypt: compress, encrypt, chunk, and upload — all client-side and zero-knowledge.",
    url: "https://zcrypt.cloud/docs/how-it-works",
  },
};

const toc = [
  { id: "short", title: "The short version" },
  { id: "compress", title: "1. Compress (zstd)" },
  { id: "encrypt", title: "2. Encrypt (AES-256-GCM)" },
  { id: "chunk", title: "3. Chunk (~16 MB)" },
  { id: "upload", title: "4. Upload to your storage" },
  { id: "download", title: "Downloading reverses it" },
  { id: "next", title: "Where to go next" },
];

export default function HowItWorksDocPage() {
  return (
    <DocPage
      href="/docs/how-it-works"
      title="How it works"
      description="Every transformation that protects a file happens on your device, in order, before a single byte leaves it. This is the whole journey — and downloading runs it precisely in reverse."
      toc={toc}
    >
      <DocSection id="short" title="The short version">
        <DocP>
          When you add a file, zcrypt compresses it, encrypts it, and breaks it
          into chunks — all on your device — then pushes those chunks to
          repositories in your own connected account. The plaintext never leaves
          your machine, and your passphrase never leaves your browser.
        </DocP>
        <DocCode label="the pipeline">{`compress (zstd)  →  encrypt (AES-256-GCM)  →  chunk (~16 MB)  →  upload to your storage`}</DocCode>
      </DocSection>

      <DocSection id="compress" title="1. Compress (zstd)">
        <DocP>
          First, the file is compressed on your device with Zstandard (zstd).
          This happens <strong>before</strong> encryption, while the data is
          still readable and therefore still compressible — encrypted data looks
          random and cannot be shrunk. Smaller payloads mean less of your storage
          used and faster uploads.
        </DocP>
      </DocSection>

      <DocSection id="encrypt" title="2. Encrypt (AES-256-GCM)">
        <DocP>
          The compressed data is encrypted with AES-256-GCM. zcrypt generates a
          random <strong>content encryption key (CEK)</strong> for the file, then
          wraps (encrypts) that CEK with a key derived from your passphrase. The
          wrapped CEK travels with the file&apos;s metadata; the passphrase
          itself never does.
        </DocP>
        <DocNote type="security" title="Why this makes zcrypt zero-knowledge">
          The server only ever receives ciphertext and a wrapped key it cannot
          open. Even if the server, the database, and your storage platform were
          all compromised at once, your files would stay unreadable — because the
          key that unwraps the CEK exists only on your device, derived from a
          passphrase we never see.
        </DocNote>
      </DocSection>

      <DocSection id="chunk" title="3. Chunk (~16 MB)">
        <DocP>
          The encrypted blob is split into fixed-size chunks of roughly 16 MB
          each, and every chunk is given a randomized filename. Chunking keeps
          each piece within platform file-size limits, enables parallel and
          resumable transfers, and means one failed piece can be retried without
          re-sending the whole file.
        </DocP>
        <DocNote type="info" title="Tunable chunk size">
          ~16 MB is the standard size. The terminal app exposes performance
          profiles that range from 4 MB chunks (light) up to 32 MB (ludicrous),
          trading memory for throughput.
        </DocNote>
      </DocSection>

      <DocSection id="upload" title="4. Upload to your storage">
        <DocP>
          Each encrypted chunk is pushed to the platform you connected — GitHub,
          GitLab, Hugging Face, or Telegram — stored as an ordinary-looking
          binary blob under disguised filenames and commit messages. When a
          repository nears its size threshold, zcrypt creates a new one
          automatically so your vault keeps growing without you managing
          anything.
        </DocP>
        <DocP>
          The platform sees only opaque data: never your file names, never your
          content, never your folder structure.
        </DocP>
      </DocSection>

      <DocSection id="download" title="Downloading reverses it">
        <DocP>
          Downloading is the same pipeline run backwards, and every step still
          happens on your device:
        </DocP>
        <DocList
          ordered
          items={[
            <>
              <strong>Fetch</strong> the encrypted chunks back from your
              repositories, several in parallel for speed.
            </>,
            <>
              <strong>Verify</strong> each chunk against its SHA-256 hash, so a
              corrupted or tampered piece is caught before it is used.
            </>,
            <>
              <strong>Decrypt</strong> the reassembled blob locally with the key
              unwrapped from your passphrase.
            </>,
            <>
              <strong>Decompress</strong> back to the original file and save it.
              No plaintext ever touches the server.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/uploading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Uploading — chunked, resumable, relay vs. direct upload
            </Link>,
            <Link key="b" href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Downloading — fetch, verify, decrypt, decompress
            </Link>,
            <Link key="c" href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encryption model — the cryptographic detail behind each step
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
