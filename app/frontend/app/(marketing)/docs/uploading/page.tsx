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
  title: "Uploading | zcrypt Docs",
  description:
    "How zcrypt uploads: client-side compression and encryption, ~16 MB chunks, durable resumable sessions, relay vs. direct (presigned) upload, bounded parallelism, and folder-aware destinations.",
  alternates: { canonical: "https://zcrypt.cloud/docs/uploading" },
  openGraph: {
    title: "Uploading | zcrypt Docs",
    description:
      "Chunked, client-encrypted, resumable uploads in zcrypt — relay and direct modes, bounded parallelism, and folder-aware destinations.",
    url: "https://zcrypt.cloud/docs/uploading",
  },
};

const toc = [
  { id: "chunked", title: "Chunked & client-encrypted" },
  { id: "resumable", title: "Resumable by design" },
  { id: "modes", title: "Relay vs. direct upload" },
  { id: "parallel", title: "Parallel, but bounded" },
  { id: "folders", title: "Folder-aware uploads" },
  { id: "next", title: "Where to go next" },
];

export default function UploadingDocPage() {
  return (
    <DocPage
      href="/docs/uploading"
      title="Uploading"
      description="Files are compressed, encrypted, and chunked on your device, then streamed to your storage one chunk at a time. The upload survives refreshes and drops, and lands exactly where you are in your drive."
      toc={toc}
    >
      <DocSection id="chunked" title="Chunked & client-encrypted">
        <DocP>
          By the time an upload begins, the file has already been compressed with
          zstd and encrypted with AES-256-GCM on your device (see{" "}
          <Link href="/docs/how-it-works" className="text-cyan-600 hover:underline dark:text-cyan-400">How it works</Link>).
          What gets sent is a sequence of ~16 MB encrypted chunks — the server
          receives only ciphertext.
        </DocP>
        <DocP>
          An upload starts by opening a session that records the file&apos;s
          metadata, salt, wrapped key, and chunk count. Each chunk is then sent
          with its own SHA-256 hash, which the server checks on arrival; a chunk
          whose bytes don&apos;t match its hash is rejected.
        </DocP>
      </DocSection>

      <DocSection id="resumable" title="Resumable by design">
        <DocP>
          Uploads are resumable, and the design makes resuming reliable rather
          than best-effort:
        </DocP>
        <DocList
          items={[
            <>
              Incoming chunks are <strong>staged durably</strong> on the server
              and recorded in the database before the platform push, so they
              survive a server restart.
            </>,
            <>
              A <strong>status endpoint</strong> reports which chunk indices have
              already been received for the session.
            </>,
            <>
              On resume, the client asks for that status and{" "}
              <strong>continues from the chunks still missing</strong>, re-using
              the same session and the same per-file key — already-uploaded
              chunks are skipped, not re-sent.
            </>,
            <>
              Re-sending a chunk that already arrived is{" "}
              <strong>idempotent</strong>: the server recognizes it by index and
              acknowledges it as a duplicate rather than storing it twice.
            </>,
          ]}
        />
        <DocNote type="info" title="Two stages, both tracked">
          A chunk is first staged on the server, then a background worker pushes
          it to your storage platform. Completion is reported once every chunk has
          been received; durability on the platform follows immediately after.
        </DocNote>
      </DocSection>

      <DocSection id="modes" title="Relay vs. direct upload">
        <DocP>
          zcrypt supports two upload paths, chosen automatically per platform:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Relay (default).</strong> Chunks go to the zcrypt server,
              which stages them and forwards them to the platform. This works for
              every backend and keeps the client&apos;s job simple.
            </>,
            <>
              <strong>Direct / presigned.</strong> For Hugging Face, which uses
              Git LFS, the server hands back a presigned URL and the client
              uploads the chunk <strong>straight to LFS storage</strong>,
              bypassing the server relay. This removes the double hop and is well
              suited to large files. The directly-uploaded chunks are then
              confirmed and committed in a single batch.
            </>,
          ]}
        />
        <DocNote type="security" title="Still ciphertext either way">
          The chunk is already encrypted before it leaves your device, so neither
          path — nor the presigned storage URL — ever handles readable data.
        </DocNote>
      </DocSection>

      <DocSection id="parallel" title="Parallel, but bounded">
        <DocP>
          Multiple files and multiple chunks upload in parallel for speed, but
          concurrency is capped on both ends. The client limits how many
          transfers run at once based on your device, and the server bounds
          concurrent chunk processing — including a small per-repository limit,
          since some platforms create one commit per file and concurrent commits
          to the same repo would otherwise collide. The result is fast uploads
          without overwhelming memory or the platform&apos;s API.
        </DocP>
      </DocSection>

      <DocSection id="folders" title="Folder-aware uploads">
        <DocP>
          An upload lands in the folder you are currently viewing — the file is
          created directly in that folder rather than dropped at the root and
          moved afterward.
        </DocP>
        <DocP>
          If the destination is a{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">password-protected folder</Link>,
          the upload is wrapped under that folder&apos;s password instead of your
          vault passphrase, so the file is sealed to the folder from the moment
          it is stored. (This is also why resuming a protected-folder upload
          requires that folder to be unlocked — the remaining chunks must be
          encrypted with the same key as the ones already sent.)
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/transfer-manager" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Transfer manager — pause, resume, retry, and track every upload
            </Link>,
            <Link key="b" href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Downloading — how files come back out
            </Link>,
            <Link key="c" href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Repo pool &amp; rotation — where the chunks actually land
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
