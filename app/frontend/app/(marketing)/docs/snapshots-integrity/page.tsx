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
  title: "Snapshots & integrity | zcrypt Docs",
  description:
    "Two zcrypt tools for keeping tabs on your vault: snapshots capture a point-in-time manifest of your file list, and the integrity monitor records each file's SHA-256 and size to flag when a file's hash changes. Both are in beta.",
  alternates: { canonical: "https://zcrypt.cloud/docs/snapshots-integrity" },
  openGraph: {
    title: "Snapshots & integrity | zcrypt Docs",
    description:
      "Point-in-time file-list manifests and SHA-256 tamper detection — maturing features, not a version-history or rollback system.",
    url: "https://zcrypt.cloud/docs/snapshots-integrity",
  },
};

const toc = [
  { id: "snapshots", title: "Snapshots" },
  { id: "snapshots-not", title: "What snapshots are not" },
  { id: "integrity", title: "Integrity monitor" },
  { id: "maturity", title: "Maturity" },
  { id: "next", title: "Where to go next" },
];

export default function SnapshotsIntegrityDocPage() {
  return (
    <DocPage
      href="/docs/snapshots-integrity"
      title="Snapshots & integrity"
      description="Lightweight tools for keeping an eye on the shape of your vault: a snapshot records what was in it at a moment in time, and the integrity monitor watches for files whose contents change unexpectedly."
      badge="Beta"
    >
      <DocSection id="snapshots" title="Snapshots">
        <DocP>
          A snapshot captures a <strong>point-in-time manifest of your current
          file list</strong> — a labelled record of what files existed in your
          vault when you took it. You can create snapshots, label them, list
          them, and delete them, giving you a timeline of how your vault&rsquo;s
          contents have grown or changed.
        </DocP>
      </DocSection>

      <DocSection id="snapshots-not" title="What snapshots are not">
        <DocNote type="warning" title="Snapshots do not restore files">
          A snapshot is a <strong>record of the list</strong>, not a backup of
          the files themselves. There is <strong>no rollback or version history
          yet</strong> — you cannot restore a deleted file or revert a file to a
          previous version from a snapshot. Use snapshots to <em>see</em> what
          your vault looked like, not to <em>recover</em> it. If you need to undo
          a deletion, check the Trash before it&rsquo;s purged.
        </DocNote>
      </DocSection>

      <DocSection id="integrity" title="Integrity monitor">
        <DocP>
          The integrity monitor records each file&rsquo;s <strong>SHA-256 hash
          and size</strong> as a reference point, then compares the current file
          against that reference to flag anything whose hash has{" "}
          <strong>changed</strong>. Because the hash is computed over the
          file&rsquo;s exact bytes, even a single altered byte changes it.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Take a reference:</strong> record a file&rsquo;s hash and
              size as its known-good baseline.
            </>,
            <>
              <strong>Check:</strong> compare a file against its latest reference
              to see if it still matches.
            </>,
            <>
              <strong>Review changes:</strong> list the files whose hash no
              longer matches their reference.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="maturity" title="Maturity">
        <DocNote type="info" title="These features are in beta">
          Snapshots and the integrity monitor are still maturing. They&rsquo;re
          useful for keeping tabs on your vault, but expect the workflows and
          surfaces around them to keep evolving — and don&rsquo;t treat them as a
          substitute for a proper backup or a finished version-control system.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/downloading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Downloading — how files are fetched, verified, and decrypted
            </Link>,
            <Link key="b" href="/docs/shared-vaults" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Shared vaults — collaborative vaults with role-based access
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
