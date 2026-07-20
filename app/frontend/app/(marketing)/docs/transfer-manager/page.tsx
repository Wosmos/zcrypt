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
    "The docked transfer manager unifies every upload and download in zcrypt: per-item progress, speed and ETA, a direction cue, pause/resume and retry for both directions, and a non-destructive dismiss — all in a panel that survives navigation and stays put while work is in flight. Distinct from device transfer.",
  alternates: { canonical: "https://zcrypt.cloud/docs/transfer-manager" },
  openGraph: {
    title: "Transfer manager | zcrypt Docs",
    description:
      "Pause, resume, retry, stop, and track every upload and download from one docked panel that survives navigation and never hides work in flight.",
    url: "https://zcrypt.cloud/docs/transfer-manager",
  },
};

const toc = [
  { id: "panel", title: "One panel for everything" },
  { id: "controls", title: "Per-item controls" },
  { id: "pause", title: "Pause & resume" },
  { id: "dismiss", title: "Dismiss keeps your work" },
  { id: "collapse", title: "Collapse to a pill" },
  { id: "not-device", title: "Not the same as device transfer" },
  { id: "next", title: "Where to go next" },
];

export default function TransferManagerDocPage() {
  return (
    <DocPage
      href="/docs/transfer-manager"
      title="Transfer manager"
      description="A single docked panel, pinned to the corner of the app, that gathers every upload and download in one place — and keeps running, and stays visible, as you move around your drive."
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
          It also stays out of your way without hiding work: the dock{" "}
          <strong>stays visible while anything is active or has failed</strong>,
          and can&apos;t be swiped away while a transfer is in flight — only a
          fully-settled dock can be flicked aside, and it comes back the moment a
          new transfer starts. If you try to close the tab while transfers are
          actively moving, the browser warns you first, since closing would kill
          the chunks in flight.
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
              <strong>Direction at a glance</strong> — an animated arrow marks
              every row: an upload arrow nudging up, a download arrow nudging
              down, so you can tell which way a transfer is going without reading
              the label.
            </>,
            <>
              <strong>Progress, speed &amp; ETA</strong> — a per-item progress
              bar whose fill tracks the true byte ratio (so it never appears to
              stall), with an estimated time remaining. Uploads add a live
              transfer speed drawn from a smoothed byte rate.
            </>,
            <>
              <strong>Pause / Resume</strong> — for uploads <em>and</em>{" "}
              downloads: hold a transfer without losing what&apos;s already done,
              then continue where it left off.
            </>,
            <>
              <strong>Retry</strong> — re-run a failed transfer. A single file
              continues from what&apos;s already done rather than starting over; a
              multi-file ZIP restarts.
            </>,
            <>
              <strong>Stop / Cancel</strong> — end a download (Stop) or an upload
              (Cancel) that&apos;s in progress. This is the destructive action,
              distinct from Pause.
            </>,
            <>
              <strong>Dismiss</strong> — clear a finished or interrupted row from
              the list. For an unfinished upload this is non-destructive (below).
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
          session and key. Downloads pause the same way: a paused download keeps
          everything decrypted so far (and, for a large download streaming to
          disk, the open file), and resumes from there. Pausing is deliberately
          distinct from Stop / Cancel — a pause preserves state, a stop discards
          it.
        </DocP>
        <DocP>
          The two directions differ in how long a hold survives. An interrupted
          upload&apos;s progress is tracked on the server, so you can pick it back
          up even after a reload or closing the tab. A download&apos;s partial
          state lives only on your device, so closing the tab restarts it — see{" "}
          <Link href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">Downloading</Link>.
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

      <DocSection id="dismiss" title="Dismiss keeps your work">
        <DocP>
          There are two ways to clear a row, and they mean different things.{" "}
          <strong>Dismiss</strong> — the ✕ on a finished row, or a sideways swipe
          on a settled dock — just removes the row from the panel. For an upload
          that hasn&apos;t finished, dismiss is <strong>non-destructive</strong>:
          it hides the row but leaves the upload&apos;s server-side session
          intact, so a stray swipe can never delete a partial upload. Downloads
          have no server-side state, so dismissing one just removes its row.{" "}
          <strong>Cancel</strong> (uploads) and <strong>Stop</strong> (downloads)
          are the destructive actions that actually end a transfer.
        </DocP>
        <DocNote type="info" title="Interrupted uploads are kept for 7 days">
          Because an unfinished upload&apos;s session lives on the server, you
          have a week to resume it — after a pause, a failure, or even closing
          the tab — before it&apos;s cleaned up. Unfinished uploads show up as
          resumable rather than being lost.
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
            <Link key="b" href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Downloading — streaming, worker-pool decryption, and resume
            </Link>,
            <Link key="c" href="/docs/sync-transfer" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sync &amp; device transfer — the peer-to-peer tool, not this panel
            </Link>,
            <Link key="d" href="/features/transfers" className="text-cyan-600 hover:underline dark:text-cyan-400">
              The transfer manager — the feature tour
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
