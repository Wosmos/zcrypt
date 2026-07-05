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
  title: "Timed vaults | zcrypt Docs",
  description:
    "A timed vault is a named group of files you have already uploaded, with a countdown attached. When the timer runs out the vault is flagged as expired and dimmed in the list — but nothing self-destructs: your files are not deleted. In beta.",
  alternates: { canonical: "https://zcrypt.cloud/docs/timed-vaults" },
  openGraph: {
    title: "Timed vaults | zcrypt Docs",
    description:
      "Group already-uploaded files under a shared countdown. Expiry flags the vault — it does not delete your files.",
    url: "https://zcrypt.cloud/docs/timed-vaults",
  },
};

const toc = [
  { id: "what", title: "What a timed vault is" },
  { id: "creating", title: "Creating a timed vault" },
  { id: "countdown", title: "The countdown and expiry" },
  { id: "not", title: "What expiry does not do" },
  { id: "deleting", title: "Deleting a vault" },
  { id: "maturity", title: "Maturity" },
  { id: "next", title: "Where to go next" },
];

export default function TimedVaultsDocPage() {
  return (
    <DocPage
      href="/docs/timed-vaults"
      title="Timed vaults"
      description="Group files you have already uploaded under a single named countdown. When the timer lapses the vault is flagged as expired and dimmed in the list — but nothing self-destructs, and your files stay exactly where they are."
      badge="Beta"
      toc={toc}
    >
      <DocSection id="what" title="What a timed vault is">
        <DocP>
          Timed vaults live under the <strong>Timed Vaults</strong> tab in
          Tools. A timed vault is a lightweight <strong>label over files you
          have already uploaded</strong> — it has a name, an optional
          description, a countdown, and the list of files it groups. It is an
          organisational layer, not a new place to store data: creating one does
          not move, copy, or re-encrypt anything. Your files remain individually
          encrypted exactly as they were before, and each one still appears in
          your normal vault.
        </DocP>
      </DocSection>

      <DocSection id="creating" title="Creating a timed vault">
        <DocP>
          Open the <strong>Timed Vaults</strong> tab, choose{" "}
          <strong>Create vault</strong>, and fill in:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Name</strong> (required) — how the vault shows up in the
              list, e.g. &ldquo;Tax Documents 2025&rdquo;.
            </>,
            <>
              <strong>Description</strong> (optional) — a short note for your own
              reference.
            </>,
            <>
              <strong>Expires in</strong> — pick a window: 1 hour, 6 hours, 24
              hours, 7 days, 30 days, or 90 days. The countdown starts from the
              moment you create the vault.
            </>,
            <>
              <strong>Files</strong> — tick one or more files from your existing
              vault to include. You group files that are already uploaded; a
              timed vault is not an upload flow.
            </>,
          ]}
        />
        <DocP>
          The shortest window is one hour — the server rejects any expiry that is
          less than an hour away.
        </DocP>
      </DocSection>

      <DocSection id="countdown" title="The countdown and expiry">
        <DocP>
          Each vault shows a live countdown of the time remaining (for example{" "}
          <strong>3d 5h</strong>). A periodic sweep on the server checks for
          vaults whose time has run out and marks them as{" "}
          <strong>expired</strong>; this runs on a schedule rather than to the
          exact second, so a just-lapsed vault flips over shortly after its
          deadline. Once flagged, the vault is dimmed in the list and carries an{" "}
          <strong>Expired</strong> badge instead of a countdown.
        </DocP>
      </DocSection>

      <DocSection id="not" title="What expiry does not do">
        <DocNote type="warning" title="Timed vaults do not delete anything">
          Expiry is a <strong>status flag, not a self-destruct</strong>. When a
          timed vault expires, the vault is marked expired and dimmed — but the
          files inside it are <strong>not deleted, moved, or altered</strong>.
          There is no automatic destruction: every file stays in your vault,
          fully intact, and remains available exactly as before. Do not rely on
          a timed vault to make sensitive files disappear on their own.
        </DocNote>
      </DocSection>

      <DocSection id="deleting" title="Deleting a vault">
        <DocP>
          Removing a timed vault deletes the <strong>vault and its
          timer only</strong> — the grouping and the countdown go away, but the
          files it referenced are left untouched in your vault. If you actually
          want to remove the underlying files, delete them from your file list
          the usual way; that is a separate action.
        </DocP>
      </DocSection>

      <DocSection id="maturity" title="Maturity">
        <DocNote type="info" title="This feature is in beta">
          Timed vaults are still maturing. Today they are best understood as a
          way to <em>label and track</em> a set of files against a deadline — not
          as a retention or auto-deletion policy. Treat the countdown as a
          reminder, and expect the workflow around it to keep evolving.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/snapshots-integrity" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Snapshots &amp; integrity — the Inventory and Verify Files tabs
            </Link>,
            <Link key="b" href="/docs/shared-vaults" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Shared vaults — collaborative vaults with role-based access
            </Link>,
            <Link key="c" href="/docs/uploading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Uploading — how files are encrypted before they leave your device
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
