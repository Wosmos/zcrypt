import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Repo pool & rotation | zcrypt Docs",
  description:
    "How zcrypt grows your storage across many repositories automatically: an active repo per account, a size threshold, and a disguised new repo created the moment one fills up.",
  alternates: { canonical: "https://zcrypt.cloud/docs/repo-pool" },
  openGraph: {
    title: "Repo pool & rotation | zcrypt Docs",
    description:
      "How zcrypt grows your storage across many repositories automatically, with per-repo usage tracking and transparent rotation.",
    url: "https://zcrypt.cloud/docs/repo-pool",
  },
};

const toc = [
  { id: "why", title: "Why a pool" },
  { id: "rotation", title: "How rotation works" },
  { id: "thresholds", title: "Per-platform thresholds" },
  { id: "throttling", title: "Push throttling" },
  { id: "tracking", title: "Usage tracking" },
  { id: "durability", title: "Resume & chunk cleanup" },
  { id: "next", title: "Where to go next" },
];

export default function RepoPoolDocPage() {
  return (
    <DocPage
      href="/docs/repo-pool"
      title="Repo pool & rotation"
      description="A single repository on any platform fills up. zcrypt sidesteps that by treating your storage as a pool of repositories that grows on demand — so your usable space climbs transparently while you just keep uploading."
      toc={toc}
    >
      <DocSection id="why" title="Why a pool">
        <DocP>
          Every backend caps how much one repository can comfortably hold — about
          850 MB on GitHub, 9 GB on GitLab, 90 GiB on a Hugging Face dataset. If a
          vault were tied to one repo, that cap would be your ceiling. Instead,
          zcrypt keeps a <strong>pool</strong> of repositories per account and
          adds to it as needed.
        </DocP>
        <DocP>
          The pool is scoped to a unique combination of{" "}
          <strong>(you, platform, account)</strong>. Connect two GitHub accounts
          and each gets its own independent pool; they never share or contend.
        </DocP>
      </DocSection>

      <DocSection id="rotation" title="How rotation works">
        <DocP>
          At any moment, each pool has exactly one <strong>active</strong> repo
          that new chunks go to. The cycle is simple:
        </DocP>
        <DocList
          ordered
          items={[
            <>zcrypt uploads chunks to the active repo.</>,
            <>
              Before each upload it checks the active repo&apos;s tracked usage
              against the platform threshold.
            </>,
            <>
              When the active repo reaches its threshold, zcrypt{" "}
              <strong>deactivates</strong> it and{" "}
              <strong>auto-creates a new repository</strong> to become the active
              one.
            </>,
            <>New chunks flow into the new repo; the cycle repeats.</>,
          ]}
        />
        <DocP>
          New repositories are created private and given a plausible,
          developer-looking name such as <code>fast-cache-v3</code> or{" "}
          <code>core-worker-v7</code>, with a description like &quot;Internal
          build artifacts and cache storage.&quot; Nothing in the repo hints that
          it belongs to an encrypted drive. On Telegram, which has no repos, the
          same logic spreads files across virtual storage locations in your
          channel instead.
        </DocP>
        <DocNote type="info" title="Old repos stay readable">
          Deactivating a full repo only stops new writes to it. Its chunks are
          still tracked and downloaded normally, so files you stored months ago
          keep working as the pool grows around them.
        </DocNote>
      </DocSection>

      <DocSection id="thresholds" title="Per-platform thresholds">
        <DocP>
          Thresholds are deliberately conservative, sitting under each
          platform&apos;s real limits so uploads never bump into a hard wall
          mid-transfer.
        </DocP>
        <DocTable
          head={["Platform", "Rotation threshold"]}
          rows={[
            [<strong key="t">GitHub</strong>, "~850 MB per repo"],
            [<strong key="t">GitLab</strong>, "~9 GB per repo"],
            [<strong key="t">Hugging Face</strong>, "~90 GiB per repo (Git LFS)"],
            [<strong key="t">Telegram</strong>, "Virtual — spreads files across the channel"],
          ]}
        />
        <DocNote type="warning" title="Hugging Face doesn't grow by rotating">
          Hugging Face&apos;s free tier is 100 GB for the entire account, not per
          repo, so spinning up another Hugging Face repo adds no real space. The
          per-repo threshold is kept under that account-wide ceiling, and when
          zcrypt picks a backend automatically it prefers Telegram (no ceiling)
          and lists Hugging Face last. To grow Hugging Face capacity, connect
          another account.
        </DocNote>
      </DocSection>

      <DocSection id="throttling" title="Push throttling">
        <DocP>
          Some platforms limit how fast you can push, not just how much you can
          store. GitHub, for instance, throttles sustained pushes at roughly{" "}
          <strong>7 GB per hour</strong>. To avoid tripping that ceiling
          mid-transfer, zcrypt paces its own writes to each platform rather than
          hammering the API and getting rate-limited.
        </DocP>
        <DocP>
          Before sending each chunk, the background sync worker checks a
          per-platform budget over a trailing one-hour window. If pushing the
          chunk would exceed the limit, the worker holds it just long enough for
          earlier bytes to age out of the window, then sends — so short bursts go
          straight through and only sustained, over-cap volume is slowed.
        </DocP>
        <DocList
          items={[
            <>
              Only GitHub is throttled by default (~7 GB/hour); Telegram, GitLab,
              and Hugging Face are not rate-limited by zcrypt.
            </>,
            <>
              Budgets are tracked <strong>per platform</strong>, so saturating
              GitHub never slows a push to GitLab or Telegram.
            </>,
            <>
              The wait happens <em>before</em> a chunk claims a repo upload slot,
              so a throttled push never holds a slot idle or blocks other repos
              from making progress.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="tracking" title="Usage tracking">
        <DocP>
          zcrypt records the encrypted bytes written to each repo as uploads
          complete, so the &quot;is this repo full?&quot; check is a fast
          database lookup rather than a live API call on every chunk. Usage is
          tracked <strong>per repo</strong>, which is what lets a pool know
          precisely when to rotate and lets your total capacity add up across all
          of them.
        </DocP>
      </DocSection>

      <DocSection id="durability" title="Resume & chunk cleanup">
        <DocSubsection title="Server-side resume">
          <DocP>
            Chunks are staged on the server and pushed to your backend by a
            background worker, so a transfer doesn&apos;t depend on your browser
            staying open for every byte. If the server restarts, the worker
            re-drains any chunks still waiting and finishes pushing them.
          </DocP>
          <DocP>
            Resume is server-authoritative. zcrypt keys each upload to{" "}
            <strong>(you, the file&apos;s hash, its size)</strong>, so restarting
            the same file — even from another device or after clearing local
            storage — hands back the original session instead of starting over.
            Chunks already pushed aren&apos;t re-sent or orphaned, and the
            transfer continues on the same platform it began on.
          </DocP>
        </DocSubsection>
        <DocSubsection title="Cleaning chunks off the platform">
          <DocP>
            Deleting a file — or cancelling an upload — queues its chunks for
            removal from the backend. A deletion worker drains that queue and
            calls each platform&apos;s delete API to erase the encrypted blobs;
            chunks that were staged but never pushed are simply removed from the
            server&apos;s staging area.
          </DocP>
          <DocP>
            Failed deletions are retried with backoff. If a chunk still can&apos;t
            be removed after repeated attempts it&apos;s flagged in the logs as an
            orphan needing manual cleanup, rather than being silently forgotten,
            and a startup sweep clears staging files whose database rows are gone.
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Bring your own storage — connect the accounts the pool draws on
            </Link>,
            <Link key="b" href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Storage obfuscation — how disguised names and commits hide the repos
            </Link>,
            <Link key="c" href="/docs/uploading" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Uploading — how chunks reach the active repo
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
