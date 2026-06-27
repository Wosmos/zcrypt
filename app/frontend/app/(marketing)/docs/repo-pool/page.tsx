import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
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
  { id: "tracking", title: "Usage tracking" },
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
          850 MB on GitHub, 9 GB on GitLab, 280 GB on a Hugging Face dataset. If a
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
            [<strong key="t">Hugging Face</strong>, "~280 GB per repo (Git LFS)"],
            [<strong key="t">Telegram</strong>, "Virtual — spreads files across the channel"],
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
