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
    "How zcrypt uploads: client-side compression and encryption, device-sized chunks, durable resumable sessions that survive reloads and device switches, a real pause distinct from cancel, honest never-backwards progress, relay vs. direct (presigned) upload, and parallel batches on mobile too.",
  alternates: { canonical: "https://zcrypt.cloud/docs/uploading" },
  openGraph: {
    title: "Uploading | zcrypt Docs",
    description:
      "Chunked, client-encrypted, resumable uploads in zcrypt — surviving reloads, real pause vs. cancel, honest progress, relay and direct modes, and parallel batches.",
    url: "https://zcrypt.cloud/docs/uploading",
  },
};

const toc = [
  { id: "chunked", title: "Chunked & client-encrypted" },
  { id: "resumable", title: "Resumable by design" },
  { id: "reloads", title: "Reloads & device switches" },
  { id: "unfinished", title: "Unfinished uploads" },
  { id: "pause", title: "Pause, cancel & honest progress" },
  { id: "modes", title: "Relay vs. direct upload" },
  { id: "parallel", title: "Parallel, and mobile-friendly" },
  { id: "folders", title: "Folder-aware uploads" },
  { id: "next", title: "Where to go next" },
];

export default function UploadingDocPage() {
  return (
    <DocPage
      href="/docs/uploading"
      title="Uploading"
      description="Files are compressed, encrypted, and chunked on your device, then streamed to your storage one chunk at a time. The upload survives refreshes, drops, and even a switch to another device — and it lands exactly where you are in your drive."
      toc={toc}
    >
      <DocSection id="chunked" title="Chunked & client-encrypted">
        <DocP>
          By the time an upload begins, the file has already been compressed with
          zstd and encrypted with AES-256-GCM on your device (see{" "}
          <Link href="/docs/how-it-works" className="text-cyan-600 hover:underline dark:text-cyan-400">How it works</Link>).
          What gets sent is a sequence of encrypted chunks — the server receives
          only ciphertext.
        </DocP>
        <DocP>
          Chunks are sized to your device: from about 4&nbsp;MB on a
          memory-constrained phone up to 16&nbsp;MB on a desktop, with 10&nbsp;MB
          the common middle. The chosen size is recorded server-side, so a resume
          from <em>any</em> device re-slices the file at exactly the same
          boundaries — a mismatched size would misalign every chunk after the
          first.
        </DocP>
        <DocP>
          An upload starts by opening a session that records the file&rsquo;s
          metadata, salt, wrapped key, chunk count, and chunk size. Each chunk is
          then sent with its own SHA-256 hash, which the server checks on arrival;
          a chunk whose bytes don&rsquo;t match its hash is rejected.
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
              already been received — <strong>including chunks still staged</strong>{" "}
              and merely waiting on the background push. Resume counts those too,
              so it never re-sends bytes the server already holds.
            </>,
            <>
              On resume, the client asks for that status and{" "}
              <strong>continues from the chunks still missing</strong>, re-using
              the same session and the same per-file key — already-received chunks
              are skipped, not re-sent.
            </>,
            <>
              A chunk that <em>does</em> arrive twice is rejected{" "}
              <strong>early and cheaply</strong>: the server recognizes it by
              index before it reads the body, so a duplicate multi-MB chunk is
              turned away without being uploaded again — and never stored twice.
            </>,
          ]}
        />
        <DocNote type="info" title="Two stages, both tracked">
          A chunk is first staged on the server, then a background worker pushes
          it to your storage platform. Completion is reported once every chunk has
          been received; durability on the platform follows immediately after.
        </DocNote>
      </DocSection>

      <DocSection id="reloads" title="Reloads & device switches">
        <DocP>
          A partial upload survives a page reload. As soon as a session exists,
          the client saves a small <strong>pointer</strong> to it (session id,
          file identity, chunk layout) — never the key. Re-add the same file after
          a refresh and the client re-derives the file&rsquo;s key from the
          server-stored wrapped key plus your passphrase, then picks up from the
          chunks already received. The raw key is never written to disk, so this
          stays zero-knowledge.
        </DocP>
        <DocP>
          Even with no local pointer at all — a different device, a cleared
          browser, a fresh session — resume still works, because the{" "}
          <strong>server is the source of truth</strong>. When you start an upload
          for a file that already has an active session (matched by its content
          hash and size), the server hands that session back instead of creating a
          duplicate, pinned to its <strong>original storage platform</strong>. The
          client adopts it and continues.
        </DocP>
        <DocNote type="info" title="You&rsquo;ll be asked to re-pick the file">
          A browser can&rsquo;t re-read a file&rsquo;s bytes on its own after a
          reload, so resuming means re-selecting the same file. The client checks
          the name and size match the pending session before continuing — picking
          the wrong file would corrupt the result, so a mismatch is refused.
        </DocNote>
      </DocSection>

      <DocSection id="unfinished" title="Unfinished uploads">
        <DocP>
          Interrupted uploads don&rsquo;t just vanish. An{" "}
          <strong>unfinished uploads</strong> panel lists every session you
          started but never finished — showing the filename, size, the storage
          platform it was headed to, how far it got, and when it expires. Each one
          gives you two choices:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Resume.</strong> Re-select the file and the upload continues
              from the server&rsquo;s already-received chunks, on its original
              platform.
            </>,
            <>
              <strong>Discard.</strong> Cancel the session and delete its staged
              chunks server-side — the deliberate &ldquo;give up&rdquo; path.
            </>,
          ]}
        />
        <DocP>
          Unfinished uploads are kept for <strong>7 days</strong>, then removed
          automatically — long enough that an interrupted multi-GB upload can wait
          for you to get back to a good connection.
        </DocP>
      </DocSection>

      <DocSection id="pause" title="Pause, cancel & honest progress">
        <DocP>
          <strong>Pausing is not cancelling.</strong> A pause stops the transfer
          at three layers at once — the loop stops launching new chunks, chunks
          that already finished encrypting check the paused state before touching
          the network, and any transfer already on the wire is aborted — while
          leaving the server session and the resume context intact. Resume simply
          continues from where it stopped. <strong>Cancel</strong> is the opposite:
          it tears down the session and deletes staged data, so it can&rsquo;t be
          resumed.
        </DocP>
        <DocNote type="info" title="Dismissing a row keeps it recoverable">
          Clearing an upload from the transfer dock is non-destructive — it stops
          the local run but leaves the server session alive, so the upload
          reappears under unfinished uploads. Only an explicit Cancel/Discard
          throws the staged data away.
        </DocNote>
        <DocP>
          The percentage you see is honest. Progress is measured in real bytes
          sent — completed chunks count their full size, and a chunk still in
          flight contributes its sent bytes at a slight discount, since
          reaching the server isn&rsquo;t the same as being confirmed. The
          displayed number is <strong>monotonic</strong>: it never runs backwards,
          so a retried or aborted chunk can&rsquo;t make the bar dip. Hashing a
          large file before upload shows in the stage label rather than eating into
          the bar, and a resume starts the bar at its true position instead of
          snapping to zero.
        </DocP>
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
              every backend and keeps the client&rsquo;s job simple.
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

      <DocSection id="parallel" title="Parallel, and mobile-friendly">
        <DocP>
          Multiple files and multiple chunks upload in parallel for speed, but
          concurrency is capped on both ends. The client limits how many transfers
          run at once based on your device, and the server bounds concurrent chunk
          processing — including a small per-repository limit, since some platforms
          create one commit per file and concurrent commits to the same repo would
          otherwise collide. The result is fast uploads without overwhelming memory
          or the platform&rsquo;s API.
        </DocP>
        <DocP>
          Dropping a batch of files from a phone works the same way. A batch of
          many small files uploads several at a time rather than strictly
          one-by-one, and the most expensive setup steps — deriving your key and
          spinning up the encryption workers — are done <strong>once per batch</strong>{" "}
          and shared across every file, so a folder of photos doesn&rsquo;t pay
          that cost dozens of times over.
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
          the upload is wrapped under that folder&rsquo;s password instead of your
          vault passphrase, so the file is sealed to the folder from the moment it
          is stored. (This is also why resuming a protected-folder upload requires
          that folder to be unlocked — the remaining chunks must be encrypted with
          the same key as the ones already sent.)
        </DocP>
        <DocP>
          As for <em>which</em> storage a file lands on: when the platform picker
          is on Auto, the server resolves the destination for you (Telegram
          first), and a resume always stays on the session&rsquo;s original
          platform. See{" "}
          <Link href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">Platform adapters</Link>{" "}
          for how that routing works.
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
