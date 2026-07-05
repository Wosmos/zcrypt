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
  title: "Share links | zcrypt Docs",
  description:
    "Create a share link for any file in zcrypt. The decryption key lives only in the URL fragment, so the server never sees it. Add an optional password, expiry, and download limit, and revoke anytime.",
  alternates: { canonical: "https://zcrypt.cloud/docs/sharing" },
  openGraph: {
    title: "Share links | zcrypt Docs",
    description:
      "Share a file with an optional password, expiry, and download limit — the decryption key stays in the link fragment, never on the server.",
    url: "https://zcrypt.cloud/docs/sharing",
  },
};

const toc = [
  { id: "create", title: "Creating a share link" },
  { id: "key-in-fragment", title: "The key lives in the link" },
  { id: "options", title: "Password, expiry, and limits" },
  { id: "recipient", title: "What the recipient sees" },
  { id: "revoke", title: "Revoking a link" },
  { id: "counter", title: "About the download counter" },
  { id: "next", title: "Where to go next" },
];

export default function SharingDocPage() {
  return (
    <DocPage
      href="/docs/sharing"
      title="Share links"
      description="Hand a single file to someone with a link. zcrypt puts the decryption key in the part of the URL that never reaches our servers, so the share stays zero-knowledge — and you stay in control with optional passwords, expiry, limits, and instant revocation."
      toc={toc}
    >
      <DocSection id="create" title="Creating a share link">
        <DocP>
          From any file in your vault, choose <strong>Share</strong> to mint a
          public link. zcrypt generates a random share token for the URL and
          wraps the file&rsquo;s content-encryption key under a fresh share key
          so the recipient can decrypt without ever knowing your passphrase.
        </DocP>
        <DocP>
          The resulting link has two parts that do very different jobs:
        </DocP>
        <DocCode label="Anatomy of a share link">{`https://zcrypt.cloud/s/<token>#<decryption-key>
                         └── sent to server   └── never sent`}</DocCode>
        <DocP>
          Need to hand over more than one file? See{" "}
          <Link href="/docs/folder-sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            Share a folder
          </Link>{" "}
          for a single public link that covers a whole folder, the same
          zero-knowledge way.
        </DocP>
      </DocSection>

      <DocSection id="key-in-fragment" title="The key lives in the link, not on our servers">
        <DocP>
          Everything after the <code>#</code> is the URL <em>fragment</em>.
          Browsers never transmit the fragment to the server — it stays in the
          address bar and is only readable by JavaScript running on the page.
          zcrypt puts the share&rsquo;s decryption key there, so our servers
          store only the token, the encrypted file, and a wrapped key they can
          never unwrap.
        </DocP>
        <DocNote type="security" title="What this means for you">
          Anyone with the full link can open the file, because the link itself
          carries the key. Treat a share link like the file&rsquo;s password:
          send it over a channel you trust, and add a separate password (below)
          when the link might travel over something you don&rsquo;t.
        </DocNote>
      </DocSection>

      <DocSection id="options" title="Password, expiry, and download limits">
        <DocP>
          Each link can carry its own guardrails, all optional and all enforced
          on our side independently of the key in the fragment:
        </DocP>
        <DocTable
          head={["Option", "What it does"]}
          rows={[
            [
              <strong key="a">Password</strong>,
              <>
                A second secret the recipient must enter. It is hashed with
                bcrypt on the server and checked before any file metadata or
                chunks are released. Until the right password is provided, the
                link won&rsquo;t even reveal the file name or size.
              </>,
            ],
            [
              <strong key="b">Expiry</strong>,
              <>
                Choose <strong>1 hour</strong>, <strong>24 hours</strong>,{" "}
                <strong>7 days</strong>, <strong>30 days</strong>, or{" "}
                <strong>never</strong>. After it lapses the link reports that it
                is no longer available.
              </>,
            ],
            [
              <strong key="c">Download limit</strong>,
              <>
                Cap the number of accesses. Once the count reaches the limit,
                the link stops working.
              </>,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="recipient" title="What the recipient sees">
        <DocP>
          Recipients need no zcrypt account. Opening the link loads a public
          page that fetches the encrypted chunks, verifies them, and decrypts
          the file <strong>entirely in their browser</strong> using the key from
          the fragment. The plaintext is reassembled on their device and never
          on our servers.
        </DocP>
        <DocList
          items={[
            <>If you set a password, the page prompts for it first.</>,
            <>
              If the link has expired or hit its download limit, the page
              explains that it is no longer available.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="revoke" title="Revoking a link">
        <DocP>
          You can revoke any share link at any time from your list of shares.
          Revocation is immediate: the server refuses all further requests for
          that token, so even someone holding the full link (key and all) can no
          longer fetch the file.
        </DocP>
      </DocSection>

      <DocSection id="counter" title="About the download counter">
        <DocNote type="info" title="Honest note on counting">
          The download counter increments when a recipient&rsquo;s browser
          fetches the link&rsquo;s file metadata — the step that precedes the
          actual chunk downloads. It is a close proxy for &ldquo;times
          opened,&rdquo; not a byte-exact count of completed downloads, so a
          page reload or an interrupted download can move the number. Keep that
          in mind if you set a tight download limit.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>Other ways to get data to people and devices:</DocP>
        <DocList
          items={[
            <Link key="d" href="/docs/folder-sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share a folder — one public link for a whole folder
            </Link>,
            <Link key="a" href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Anonymous Send — send a file with no account at all
            </Link>,
            <Link key="b" href="/docs/pad" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encrypted Pad — share a one-time encrypted note
            </Link>,
            <Link key="c" href="/docs/sync-transfer" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sync &amp; device transfer — move data between your own devices
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
