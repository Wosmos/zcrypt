import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Bring your own storage | zcrypt Docs",
  description:
    "zcrypt has no storage farm of its own. Connect a GitHub, GitLab, Hugging Face, or Telegram account as your encrypted backend — tokens, scopes, and capacities, all explained.",
  alternates: { canonical: "https://zcrypt.cloud/docs/platform-adapters" },
  openGraph: {
    title: "Bring your own storage | zcrypt Docs",
    description:
      "Connect GitHub, GitLab, Hugging Face, or Telegram as your encrypted storage backend — with the tokens, scopes, and capacities for each.",
    url: "https://zcrypt.cloud/docs/platform-adapters",
  },
};

const toc = [
  { id: "byo", title: "Bring your own storage" },
  { id: "backends", title: "The four backends" },
  { id: "tokens", title: "Tokens & scopes" },
  { id: "telegram", title: "Telegram's token format" },
  { id: "multiple", title: "Multiple accounts & managed storage" },
  { id: "next", title: "Where to go next" },
];

export default function PlatformAdaptersDocPage() {
  return (
    <DocPage
      href="/docs/platform-adapters"
      title="Bring your own storage"
      description="zcrypt runs no storage farm of its own. Your encrypted chunks live inside accounts you already own — GitHub, GitLab, Hugging Face, or Telegram — so your capacity is whatever free space those platforms give you, and the infrastructure stays under your control."
      toc={toc}
    >
      <DocSection id="byo" title="Bring your own storage">
        <DocP>
          A storage backend (internally, a <em>platform adapter</em>) is the
          account zcrypt pushes your encrypted chunks to. By the time anything is
          sent, the file has already been compressed, encrypted with
          AES-256-GCM, and split into chunks on your device — so the platform
          only ever sees opaque binary blobs under disguised filenames and commit
          messages. It never sees your file names or their contents.
        </DocP>
        <DocP>
          Because it&apos;s your account, your usable space is bounded only by
          that platform&apos;s free space rather than by a plan we sell. zcrypt
          handles the encryption, chunking, and repository management on top.
        </DocP>
      </DocSection>

      <DocSection id="backends" title="The four backends">
        <DocP>
          Each file is stored on a single platform. Backends differ mostly in
          how much they hold per repository and how large a single piece can be —
          which is why zcrypt rotates across many repositories as they fill up
          (see <Link href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">Repo pool &amp; rotation</Link>).
        </DocP>
        <DocTable
          head={["Backend", "Per-repo capacity", "How it stores", "Notes"]}
          rows={[
            [
              <strong key="t">GitHub</strong>,
              "~850 MB per repo",
              "Contents API, private repos",
              "Highest API maturity; new private repos are created automatically as they fill.",
            ],
            [
              <strong key="t">GitLab</strong>,
              "~9 GB per repo",
              "Repository files API, private projects",
              "Much larger repos than GitHub — a good middle ground for bigger vaults.",
            ],
            [
              <strong key="t">Hugging Face</strong>,
              "~280 GB per repo",
              "Git LFS, private datasets",
              "Highest per-repo capacity. Supports presigned direct upload, so large files stream straight to LFS storage instead of relaying through our server.",
            ],
            [
              <strong key="t">Telegram</strong>,
              "~50 MB per file",
              "Bot uploads to a chat/channel",
              "No Git repos — your chat or channel is the storage. The Bot API caps uploads at 50 MB and downloads at 20 MB, so zcrypt transparently splits and reassembles parts.",
            ],
          ]}
        />
        <DocNote type="info" title="Capacities are guidance, not hard caps">
          These figures are the conservative thresholds zcrypt rotates at, chosen
          to stay comfortably inside each platform&apos;s real limits. Your total
          space is not one repo — it grows across as many repositories as you
          need.
        </DocNote>
      </DocSection>

      <DocSection id="tokens" title="Tokens & scopes">
        <DocP>
          You connect a backend by pasting an access token from{" "}
          <strong>Settings → Platform Tokens</strong>. Grant the least privilege
          that still lets zcrypt create repositories and read/write files:
        </DocP>
        <DocTable
          head={["Backend", "Token type", "Required scope(s)"]}
          rows={[
            [
              <strong key="t">GitHub</strong>,
              "Personal Access Token (classic)",
              <code key="s">repo</code>,
            ],
            [
              <strong key="t">GitLab</strong>,
              "Personal Access Token",
              <span key="s">
                <code>api</code> + <code>write_repository</code>
              </span>,
            ],
            [
              <strong key="t">Hugging Face</strong>,
              "User Access Token",
              <span key="s">
                <code>write</code>
              </span>,
            ],
            [
              <strong key="t">Telegram</strong>,
              "Bot token + chat/channel ID",
              "Bot from @BotFather, added to a private channel/group as admin",
            ],
          ]}
        />
        <DocP>
          For GitHub, the classic <code>repo</code> scope means full control of
          private repositories — zcrypt only ever touches the storage repos it
          creates, but the scope itself is broad, so use a token dedicated to
          zcrypt. GitLab needs <code>api</code> for project management plus{" "}
          <code>write_repository</code> for file operations.
        </DocP>
        <DocNote type="security" title="Tokens are encrypted at rest">
          Every platform token is encrypted with AES-256-GCM using a server-side
          key-encryption key (KEK) before it touches the database. Even in a
          database breach, your tokens stay protected.
        </DocNote>
      </DocSection>

      <DocSection id="telegram" title="Telegram's token format">
        <DocP>
          Telegram has no concept of repositories, so its &quot;token&quot; is
          actually two values joined with a pipe: your bot token and the target
          chat or channel ID.
        </DocP>
        <DocCode label="Settings → Platform Tokens → Telegram">{`BOT_TOKEN|CHAT_ID

# example
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11|@my_zcrypt_vault`}</DocCode>
        <DocList
          items={[
            <>
              Create the bot by messaging <strong>@BotFather</strong> and sending{" "}
              <code>/newbot</code>; copy the token it gives you.
            </>,
            <>
              Make a <strong>private channel or group</strong> to hold your files
              and add the bot to it as an administrator.
            </>,
            <>
              Use the channel&apos;s <code>@username</code> or its numeric ID as{" "}
              <code>CHAT_ID</code>, then paste{" "}
              <code>BOT_TOKEN|CHAT_ID</code> into zcrypt.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="multiple" title="Multiple accounts & managed storage">
        <DocP>
          You can connect more than one account per platform — for example two
          GitHub accounts — and zcrypt keeps a separate repository pool for each.
          That multiplies your usable space and isolates rotation per account.
        </DocP>
        <DocP>
          Administrators of a zcrypt instance can also mark a token{" "}
          <strong>global / managed</strong>, so users can store files without
          connecting any account of their own. When no personal token and no
          managed storage is available yet, uploads return a clear
          &quot;storage not available&quot; message instead of failing silently.
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/repo-pool" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Repo pool &amp; rotation — how your space grows across many repositories
            </Link>,
            <Link key="b" href="/docs/connect-storage" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Connect your storage — step-by-step token setup for each platform
            </Link>,
            <Link key="c" href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Storage obfuscation — disguised filenames, commit messages, and repo names
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
