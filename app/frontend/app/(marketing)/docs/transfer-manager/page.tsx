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
  title: "Transfer manager | zcrypt Docs",
  description:
    "The docked transfer manager unifies every upload and download in zcrypt: per-item progress and ETA, pause/resume at a chunk boundary, retry, stop, and collapse-to-pill — surviving navigation. Distinct from device transfer.",
  alternates: { canonical: "https://zcrypt.cloud/docs/transfer-manager" },
  openGraph: {
    title: "Transfer manager | zcrypt Docs",
    description:
      "Pause, resume, retry, stop, and track every upload and download from one docked panel that survives navigation.",
    url: "https://zcrypt.cloud/docs/transfer-manager",
  },
};

const toc = [
  { id: "panel", title: "One panel for everything" },
  { id: "controls", title: "Per-item controls" },
  { id: "pause", title: "Pause & resume" },
  { id: "collapse", title: "Collapse to a pill" },
  { id: "not-device", title: "Not the same as device transfer" },
  { id: "next", title: "Where to go next" },
];

export default function TransferManagerDocPage() {
  return (
    <DocPage
      href="/docs/transfer-manager"
      title="Transfer manager"
      description="A single docked panel, pinned to the corner of the app, that gathers every upload and download in one place — and keeps running as you move around your drive."
      toc={toc}
    >
      <DocSection id="panel" title="One panel for everything">
        <DocP>
          The transfer manager is a docked panel in the bottom-right of the app.
          It is mounted once for the whole authenticated app, so it{" "}
          <strong>survives navigation</strong>: start an upload, open another
          folder, preview a file — your transfers keep going and stay visible.
          When there&apos;s nothing in flight and nothing finished to review, the
          panel simply isn&apos;t there.
        </DocP>
        <DocP>
          Uploads and downloads share the panel. In-flight work sorts to the top
          and finished work sinks to the bottom, with a header summarizing how
          many transfers are active or failed and a <strong>Clear completed</strong>{" "}
          action to tidy up.
        </DocP>
      </DocSection>

      <DocSection id="controls" title="Per-item controls">
        <DocP>Each transfer shows its own live status, and what you can do depends on its direction and state:</DocP>
        <DocList
          items={[
            <>
              <strong>Progress &amp; ETA</strong> — a per-item progress bar with
              bytes processed and an estimated time remaining.
            </>,
            <>
              <strong>Pause / Resume</strong> (uploads) — stop and continue a
              transfer without losing what&apos;s already done.
            </>,
            <>
              <strong>Retry</strong> — re-run a failed upload or download.
            </>,
            <>
              <strong>Stop</strong> — cancel a download in progress.
            </>,
            <>
              <strong>Dismiss</strong> — remove a finished or cancelled item from
              the list.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="pause" title="Pause & resume">
        <DocP>
          Pausing an upload stops it at a <strong>chunk boundary</strong> — it
          finishes the chunk in flight and then holds — so the server-side upload
          session and the per-file key are preserved. Resuming continues from the
          chunks already uploaded rather than starting over, re-using that same
          session and key.
        </DocP>
        <DocNote type="security" title="The panel never asks for your passphrase">
          Resume and retry need your key locally to encrypt or decrypt the
          remaining chunks, but the manager never prompts for it and never
          forwards it anywhere — it reads the passphrase already cached for your
          unlocked vault. For a transfer into a{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">protected folder</Link>,
          resume uses that folder&apos;s password, so the folder must be unlocked
          first; otherwise the manager asks you to open it rather than risk
          encrypting chunks with the wrong key.
        </DocNote>
      </DocSection>

      <DocSection id="collapse" title="Collapse to a pill">
        <DocP>
          When you want it out of the way, collapse the panel down to a compact
          pill that shows a single aggregate progress bar across all running
          transfers. Expand it again any time to see the full per-item list.
        </DocP>
      </DocSection>

      <DocSection id="not-device" title="Not the same as device transfer">
        <DocNote type="warning" title="Two different features, similar names">
          The <strong>transfer manager</strong> described here tracks ordinary
          uploads and downloads between your device and your storage. It is{" "}
          <strong>not</strong> the peer-to-peer{" "}
          <strong>device transfer</strong> tool, which moves a file directly
          between two of your devices. Device transfer is covered separately in{" "}
          <Link href="/docs/sync-transfer" className="text-cyan-600 hover:underline dark:text-cyan-400">Sync &amp; device transfer</Link>.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/uploading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Uploading — how the resumable upload sessions work underneath
            </Link>,
            <Link key="b" href="/docs/bulk" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Bulk operations — multi-select downloads and deletes
            </Link>,
            <Link key="c" href="/docs/sync-transfer" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sync &amp; device transfer — the peer-to-peer tool, not this panel
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
