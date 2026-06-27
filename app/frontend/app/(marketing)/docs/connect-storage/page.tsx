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
  title: "Connect your storage | zcrypt Docs",
  description:
    "zcrypt brings your own backend. Connect a GitHub, GitLab, Hugging Face, or Telegram account in Settings, hand it a token, and zcrypt auto-creates and rotates repositories so your space grows on its own.",
  alternates: { canonical: "https://zcrypt.cloud/docs/connect-storage" },
  openGraph: {
    title: "Connect your storage | zcrypt Docs",
    description:
      "Link a GitHub, GitLab, Hugging Face, or Telegram account as your encrypted storage backend. Tokens are encrypted at rest; capacity grows automatically.",
    url: "https://zcrypt.cloud/docs/connect-storage",
  },
};

const toc = [
  { id: "byo", title: "Bring your own storage" },
  { id: "connect", title: "Connecting a backend" },
  { id: "tokens", title: "What tokens you need" },
  { id: "at-rest", title: "Tokens are encrypted at rest" },
  { id: "grows", title: "Space grows automatically" },
  { id: "next", title: "Where to go next" },
];

export default function ConnectStorageDocPage() {
  return (
    <DocPage
      href="/docs/connect-storage"
      title="Connect your storage"
      description="zcrypt doesn't sell you storage — you bring an account you already have. Connect a backend once and your encrypted files live there, under your control."
      toc={toc}
    >
      <DocSection id="byo" title="Bring your own storage">
        <DocP>
          zcrypt is free and open source and does not run a storage farm. Your
          encrypted chunks live inside a platform account you connect, which
          means your capacity is simply the free space that platform gives you.
          Today zcrypt supports <strong>GitHub</strong>, <strong>GitLab</strong>,{" "}
          <strong>Hugging Face</strong>, and <strong>Telegram</strong>.
        </DocP>
      </DocSection>

      <DocSection id="connect" title="Connecting a backend">
        <DocP>
          Open <strong>Settings</strong> and go to the platforms section. Add the
          platform you want, paste its token, and save. You can connect more than
          one — adding a second backend simply adds its free space to your total.
        </DocP>
      </DocSection>

      <DocSection id="tokens" title="What tokens you need">
        <DocP>
          At a high level, each platform needs a credential that lets zcrypt
          create private storage and read and write to it on your behalf. You
          generate these in the platform&apos;s own settings and paste them into
          zcrypt:
        </DocP>
        <DocTable
          head={["Platform", "What to provide"]}
          rows={[
            ["GitHub", "A personal access token with private-repository access"],
            ["GitLab", "A personal access token with project read/write scope"],
            ["Hugging Face", "An access token that can create and write to private repos"],
            ["Telegram", "A bot token plus a private channel for the bot to post to"],
          ]}
        />
        <DocP>
          The exact scopes and step-by-step instructions for each platform live
          in{" "}
          <Link href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Bring your own storage
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="at-rest" title="Tokens are encrypted at rest">
        <DocP>
          The platform tokens you save are <strong>encrypted at rest</strong>{" "}
          with AES-256-GCM before they are stored — they are not kept as plain
          text in our database. zcrypt uses them only to move your already
          encrypted chunks to and from your backend.
        </DocP>
        <DocNote type="security" title="Scope your tokens narrowly">
          Grant each token only the access zcrypt needs, and revoke it from the
          platform&apos;s own settings at any time to instantly cut zcrypt off
          from that backend.
        </DocNote>
      </DocSection>

      <DocSection id="grows" title="Space grows automatically">
        <DocP>
          You never manage repositories by hand. zcrypt{" "}
          <strong>auto-creates</strong> private repositories (or uses your
          Telegram channel) and, as one fills toward its platform&apos;s limit,{" "}
          <strong>rotates</strong> to a fresh one automatically. Your usable
          space grows on its own as you upload.
        </DocP>
        <DocList
          items={[
            "New repositories are created on demand — no setup step for you.",
            "When a repository nears its platform's size threshold, zcrypt moves new chunks to the next one.",
            "Connecting an additional platform expands the pool further.",
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/platform-adapters" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Bring your own storage — per-platform setup and token scopes
            </Link>,
            <Link key="b" href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Repo pool &amp; rotation — how storage grows across repositories
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
