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
    "How zcrypt downloads: your browser fetches encrypted chunks, decrypts and decompresses them in a Web Worker pool, verifies the file's SHA-256, and — for very large files — streams straight to disk. Every step runs on your device; the server never sees plaintext or your passphrase.",
  alternates: { canonical: "https://zcrypt.cloud/docs/downloading" },
  openGraph: {
    title: "Downloading | zcrypt Docs",
    description:
      "Fetching, decrypting, and verifying your files locally in zcrypt — with a worker pool, streaming-to-disk for large files, and pause/resume.",
    url: "https://zcrypt.cloud/docs/downloading",
  },
};

const toc = [
  { id: "local", title: "Entirely on your device" },
  { id: "steps", title: "How a download runs" },
  { id: "streaming", title: "Large files stream to disk" },
  { id: "resume", title: "Pause, resume, and retry" },
  { id: "integrity", title: "Integrity verification" },
  { id: "protected", title: "Protected folders" },
  { id: "next", title: "Where to go next" },
];

export default function DownloadingDocPage() {
  return (
    <DocPage
      href="/docs/downloading"
      title="Downloading"
      description="Getting a file back is the upload pipeline in reverse. Your browser pulls the encrypted chunks, decrypts them, and rebuilds the original — and the plaintext is reconstructed only on your device."
      toc={toc}
    >
      <DocSection id="local" title="Entirely on your device">
        <DocP>
          The server&apos;s only role in a download is to hand back the encrypted
          chunks it stored (or fetch them from your storage platform on your
          behalf). Every step that turns those chunks back into a readable file
          — decryption, decompression, verification — runs locally. The server
          never sees a decrypted byte and never sees your passphrase.
        </DocP>
        <DocP>
          The heavy work runs in a pool of Web Workers, off the main thread, so
          the app stays responsive while it decrypts — even on a multi-gigabyte
          file. The size of that pool is chosen from your device&apos;s CPU and
          memory rather than being fixed.
        </DocP>
      </DocSection>

      <DocSection id="steps" title="How a download runs">
        <DocList
          ordered
          items={[
            <>
              <strong>Fetch.</strong> The browser requests the file&apos;s
              encrypted chunks, pulling several in parallel for speed. A dropped
              connection or slow chunk is retried on its own, and the access
              token is refreshed mid-download so a long transfer doesn&apos;t
              stall on an expired session.
            </>,
            <>
              <strong>Decrypt &amp; decompress.</strong> Each chunk is decrypted
              with AES-256-GCM using the per-file key unwrapped from your
              passphrase (or the folder password, for a protected folder), then
              decompressed with zstd — both in the worker pool, off the main
              thread.
            </>,
            <>
              <strong>Verify.</strong> Once the chunks are reassembled, the
              file&apos;s SHA-256 is compared against the hash recorded at upload.
              A mismatch fails the download rather than saving a damaged file.
            </>,
            <>
              <strong>Save.</strong> Small files are rebuilt in memory and
              downloaded the usual way; large files are streamed straight to disk
              as they arrive (below).
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="streaming" title="Large files stream to disk">
        <DocP>
          For most files the browser rebuilds the whole thing in memory and then
          saves it. That approach breaks down once a file is larger than a
          browser tab can comfortably hold — so past roughly a gigabyte, zcrypt
          streams the download <strong>straight to disk</strong> instead. You
          choose where to save it up front (a Save-As prompt), and each chunk is
          decrypted and written out in order as it arrives, so the whole file
          never has to sit in RAM at once. This is what makes downloading very
          large files — on the order of tens of gigabytes, a 25&nbsp;GB file, say
          — possible at all.
        </DocP>
        <DocNote type="info" title="Roughly half the peak memory">
          Even the integrity hash is computed <strong>incrementally</strong>, as
          each chunk is written, so there&apos;s no second full-file copy made
          just to verify it. Dropping that duplicate buffer roughly halves peak
          memory versus assembling the whole file and then hashing it.
        </DocNote>
        <DocP>
          Streaming to disk uses the browser&apos;s File System Access API, which
          today means a Chromium-based browser; where it isn&apos;t available,
          zcrypt falls back to the in-memory path. If a streamed download fails
          its integrity check or you cancel it, the partial file on disk is
          discarded — a corrupt or truncated file is never left committed.
        </DocP>
      </DocSection>

      <DocSection id="resume" title="Pause, resume, and retry">
        <DocP>
          A download can be <strong>paused</strong> and picked back up: pausing
          keeps everything decrypted so far (and, for a large download streaming
          to disk, the open file on disk), and resuming continues from there
          instead of restarting at chunk zero. A <strong>retry</strong> after a
          failure does the same — it continues from what&apos;s already done
          rather than re-fetching the whole file. Pausing is deliberately
          distinct from stopping: a stop discards the in-progress work, a pause
          preserves it.
        </DocP>
        <DocP>
          Transient blips are handled for you. A dropped connection, a stalled
          chunk, or a temporary server error is retried automatically with
          backoff — on single-file downloads, on{" "}
          <Link href="/docs/bulk" className="text-cyan-600 hover:underline dark:text-cyan-400">bulk ZIP downloads</Link>,
          and on shared-link downloads — so one hiccup over a long transfer
          doesn&apos;t sink the whole file.
        </DocP>
        <DocNote type="warning" title="Download resume is in-session only">
          A download&apos;s partly-decrypted data lives on your device, so closing
          the tab restarts it from the beginning. This is the opposite of{" "}
          <Link href="/docs/uploading" className="text-cyan-600 hover:underline dark:text-cyan-400">uploads</Link>,
          whose partial state is held on the server and survives a reload. See the{" "}
          <Link href="/docs/transfer-manager" className="text-cyan-600 hover:underline dark:text-cyan-400">transfer manager</Link>{" "}
          for the pause / resume / retry controls.
        </DocNote>
      </DocSection>

      <DocSection id="integrity" title="Integrity verification">
        <DocP>
          Two things guard integrity. First, AES-256-GCM is an{" "}
          <strong>authenticated</strong> cipher, so a chunk that was altered in
          storage fails to decrypt rather than producing garbage — a tampered
          piece is caught the moment it is opened. Second, once every chunk is
          decrypted and reassembled, the file&apos;s <strong>SHA-256</strong> is
          checked against the hash recorded at upload; a mismatch fails the
          download instead of saving a damaged file. On a streamed download that
          hash is built up as chunks are written, so the check costs no extra
          copy of the file.
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
              Transfer manager — pause, resume, retry, and track downloads
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
