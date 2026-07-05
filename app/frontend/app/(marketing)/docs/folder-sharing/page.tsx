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
  title: "Share a folder | zcrypt Docs",
  description:
    "Share a whole folder with a single public link. Everyone with the link can browse and download the files, read-only, with no account — and it stays end-to-end encrypted because the folder key lives only in the URL fragment. Add an optional password that hides the file listing until it's entered.",
  alternates: { canonical: "https://zcrypt.cloud/docs/folder-sharing" },
  openGraph: {
    title: "Share a folder | zcrypt Docs",
    description:
      "One public link for a whole folder: read-only, no account needed, and still end-to-end encrypted — the folder key never leaves the link fragment.",
    url: "https://zcrypt.cloud/docs/folder-sharing",
  },
};

const toc = [
  { id: "create", title: "Sharing a whole folder" },
  { id: "key-in-fragment", title: "The key lives in the link" },
  { id: "password", title: "Optional password protection" },
  { id: "recipient", title: "What the recipient sees" },
  { id: "options", title: "Expiry, limits, and revoking" },
  { id: "vs-vaults", title: "Folder links vs. shared vaults" },
  { id: "counter", title: "About the download counter" },
  { id: "next", title: "Where to go next" },
];

export default function FolderSharingDocPage() {
  return (
    <DocPage
      href="/docs/folder-sharing"
      title="Share a folder"
      description="Hand someone a whole folder with one public link. Anyone with the link can browse and download the files read-only, no account required — and it stays zero-knowledge, because the folder's decryption key rides in the part of the URL that never reaches our servers."
      toc={toc}
      badge="New"
    >
      <DocSection id="create" title="Sharing a whole folder">
        <DocP>
          From a folder in your vault, choose <strong>Share</strong> to mint a
          public link that covers the whole folder&rsquo;s contents,{" "}
          <strong>including its sub-folders</strong>. zcrypt generates a random
          folder-share key in your browser and re-wraps each file&rsquo;s
          content-encryption key under it, so recipients can decrypt without ever
          knowing your passphrase.
        </DocP>
        <DocP>
          Your vault has to be unlocked to create the link, because zcrypt needs
          your passphrase locally to recover each file&rsquo;s key and re-wrap it.
          Files that <em>can&rsquo;t</em> be re-wrapped are simply left out and the
          rest are still shared &mdash; the dialog tells you how many files were
          shared and how many were skipped.
        </DocP>
        <DocNote type="info" title="Which files get skipped">
          A file is skipped if it was uploaded before per-file sharing existed
          (no key envelope to re-wrap) or if it lives inside a{" "}
          <strong>password-protected folder</strong> (its key is sealed under that
          folder&rsquo;s password, not your vault passphrase). If none of a
          folder&rsquo;s files can be shared, zcrypt tells you rather than
          creating an empty link.
        </DocNote>
      </DocSection>

      <DocSection id="key-in-fragment" title="The key lives in the link, not on our servers">
        <DocP>
          A folder link works exactly like a{" "}
          <Link href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            single-file share link
          </Link>
          , just for many files at once. The link has two parts that do very
          different jobs:
        </DocP>
        <DocCode label="Anatomy of a folder link">{`https://zcrypt.cloud/f/<token>#key=<folder-share-key>
                       └── sent to server    └── never sent`}</DocCode>
        <DocP>
          Everything after the <code>#</code> is the URL <em>fragment</em>.
          Browsers never transmit the fragment to the server, so the folder-share
          key stays in the address bar and is only readable by JavaScript on the
          page. Our servers store only the token and, per file, an opaque wrapped
          key they can never unwrap &mdash; never the folder key itself, and never
          any plaintext.
        </DocP>
        <DocNote type="security" title="Treat the link like the folder's password">
          Anyone with the full link can open the folder, because the link carries
          the key. Send it over a channel you trust, and add a separate password
          (below) when the link might travel over something you don&rsquo;t.
        </DocNote>
      </DocSection>

      <DocSection id="password" title="Optional password protection">
        <DocP>
          You can require a password on the link. It is hashed with bcrypt on the
          server and checked before anything about the folder&rsquo;s contents is
          released. Until the correct password is supplied, the link{" "}
          <strong>won&rsquo;t reveal the file listing at all</strong> &mdash; no
          names, no sizes, and no per-file keys. Only once the password checks out
          does the server hand back the list of files.
        </DocP>
        <DocNote type="info" title="The password and the key are two separate locks">
          The password gates the <em>listing</em> on our side; the folder-share
          key in the fragment is what actually <em>decrypts</em> the files in the
          recipient&rsquo;s browser. Someone needs both the full link and the
          password to open a protected folder.
        </DocNote>
      </DocSection>

      <DocSection id="recipient" title="What the recipient sees">
        <DocP>
          Recipients need no zcrypt account. Opening the link loads a public page
          that lists the folder&rsquo;s files and lets them download any one file
          or grab them all. It is <strong>read-only</strong>: a folder link is for
          handing files out, not for collaboration &mdash; no one can add, rename,
          or delete anything through it.
        </DocP>
        <DocList
          items={[
            <>
              If the link is password-protected, the page prompts for the password
              first and only then shows the file listing.
            </>,
            <>
              Each download fetches the encrypted chunks, decrypts them{" "}
              <strong>entirely in the recipient&rsquo;s browser</strong> using the
              key from the fragment, and verifies the file&rsquo;s SHA-256 before
              saving it. Plaintext is reassembled on their device, never on our
              servers.
            </>,
            <>
              If the link has expired or hit its download limit, the page explains
              that it is no longer available.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="options" title="Expiry, limits, and revoking">
        <DocP>
          Every folder link carries the same optional guardrails as a single-file
          share, all enforced on our side independently of the key in the
          fragment:
        </DocP>
        <DocTable
          head={["Control", "What it does"]}
          rows={[
            [
              <strong key="a">Expiry</strong>,
              <>
                Choose <strong>1 hour</strong>, <strong>24 hours</strong>,{" "}
                <strong>7 days</strong>, <strong>30 days</strong>, or{" "}
                <strong>never</strong>. After it lapses the link reports that it is
                no longer available.
              </>,
            ],
            [
              <strong key="b">Max downloads</strong>,
              <>
                Cap the number of accesses (for example <strong>10</strong>,{" "}
                <strong>50</strong>, <strong>100</strong>, or{" "}
                <strong>unlimited</strong>). Once the count reaches the cap, the
                link stops working &mdash; see the note below on how it counts.
              </>,
            ],
            [
              <strong key="c">Revoke</strong>,
              <>
                Revoke any link at any time from the folder&rsquo;s share dialog.
                Revocation is immediate: the server refuses all further requests
                for that token, so even someone holding the full link can no longer
                fetch the files.
              </>,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="vs-vaults" title="Folder links vs. shared vaults">
        <DocP>
          A folder link and a{" "}
          <Link href="/docs/shared-vaults" className="text-cyan-600 hover:underline dark:text-cyan-400">
            shared vault
          </Link>{" "}
          solve different problems. Reach for the one that matches how much control
          you need:
        </DocP>
        <DocTable
          head={["", "Folder link", "Shared vault"]}
          rows={[
            [
              <strong key="a">Who gets in</strong>,
              <>Anyone with the link (plus the password, if set)</>,
              <>Named members you invite, individually</>,
            ],
            [
              <strong key="b">Access level</strong>,
              <>Read-only download</>,
              <>Role-based &mdash; members can be given write access</>,
            ],
            [
              <strong key="c">Accounts</strong>,
              <>None needed for recipients</>,
              <>Members sign in to zcrypt</>,
            ],
            [
              <strong key="d">Best for</strong>,
              <>Handing a set of files to someone once</>,
              <>Ongoing collaboration on a shared set of files</>,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="counter" title="About the download counter">
        <DocNote type="info" title="The cap counts files, not folder-opens">
          The download counter increments each time a recipient&rsquo;s browser
          fetches an <em>individual file&rsquo;s</em> metadata &mdash; the step
          right before that file&rsquo;s chunks download. So one &ldquo;Download
          all&rdquo; of a five-file folder counts as five, not one. If you set a
          tight <strong>max downloads</strong>, size it against the number of files
          in the folder, not the number of people you expect to open the link.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>Other ways to get data to people and devices:</DocP>
        <DocList
          items={[
            <Link key="a" href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share links &mdash; hand a single file to someone with a link
            </Link>,
            <Link key="b" href="/docs/shared-vaults" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Shared vaults &mdash; collaborative vaults with named members and roles
            </Link>,
            <Link key="c" href="/docs/send" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Anonymous Send &mdash; send a file with no account at all
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
