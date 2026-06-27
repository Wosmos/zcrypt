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
  title: "Zero-knowledge architecture | zcrypt Docs",
  description:
    "What zcrypt can and cannot see. An honest, line-by-line account of what the server stores — encrypted file contents, encrypted folder names, file metadata — and the single non-zero-knowledge surface: your storage-provider tokens.",
  alternates: { canonical: "https://zcrypt.cloud/docs/zero-knowledge" },
  openGraph: {
    title: "Zero-knowledge architecture | zcrypt Docs",
    description:
      "Exactly what the zcrypt server stores and what it can never read — including the one honest exception involving storage-provider tokens.",
    url: "https://zcrypt.cloud/docs/zero-knowledge",
  },
};

const toc = [
  { id: "meaning", title: "What zero-knowledge means here" },
  { id: "stored", title: "What the server stores" },
  { id: "never", title: "What the server never sees" },
  { id: "names", title: "The honest nuance: file names" },
  { id: "tokens", title: "The one exception: storage tokens" },
  { id: "next", title: "Where to go next" },
];

export default function ZeroKnowledgePage() {
  return (
    <DocPage
      href="/docs/zero-knowledge"
      title="Zero-knowledge architecture"
      description="Zero-knowledge is a strong claim, so we state it precisely. zcrypt cannot read your file contents or your folder names — and we are equally clear about the metadata it does keep and the single surface that is not zero-knowledge."
      toc={toc}
    >
      <DocSection id="meaning" title="What zero-knowledge means here">
        <DocP>
          Zero-knowledge means the service can store and serve your data without
          ever being able to read it. Your file contents are encrypted on your
          device with keys derived from a passphrase we never receive. Even with
          full administrative access to the database and storage, we cannot
          reconstruct your files — and neither can anyone who compels us to hand
          over what we have.
        </DocP>
        <DocP>
          It does <em>not</em> mean we store nothing. Running a usable drive
          requires some metadata — sizes, chunk counts, timestamps. The honest
          version of the claim is: encrypted content stays encrypted, and we are
          explicit about every piece of metadata that is not.
        </DocP>
      </DocSection>

      <DocSection id="stored" title="What the server stores">
        <DocP>
          Here is the full inventory of what lands in our database for a typical
          file and its folder.
        </DocP>
        <DocTable
          head={["Stored", "Readable by us?", "Notes"]}
          rows={[
            [
              "Encrypted file chunks",
              "No",
              "AES-256-GCM ciphertext; live on your storage backend, not our DB",
            ],
            [
              "Wrapped CEK + salt",
              "No",
              "The per-file key, encrypted under your passphrase-derived KEK",
            ],
            [
              "Encrypted folder names",
              "No",
              "Folder names are encrypted client-side; we store only ciphertext",
            ],
            [
              "File sizes & chunk count",
              "Yes",
              "Original, compressed, and encrypted sizes; number of chunks",
            ],
            [
              "Per-chunk SHA-256",
              "Yes",
              "Integrity digests; reveal nothing about plaintext",
            ],
            [
              "File name",
              "Partially",
              "See the honest nuance below — a plaintext name column still exists",
            ],
            [
              "Account + audit data",
              "Yes",
              "Email, bcrypt password hash, and audit events (IP, user-agent, type)",
            ],
          ]}
        />
        <DocNote type="info" title="Audit metadata">
          Security events — logins, folder deletions, key changes — are recorded
          with an IP address, user-agent, and event type so you and we can spot
          abuse. These records never contain key material, passphrases, or
          plaintext file contents.
        </DocNote>
      </DocSection>

      <DocSection id="never" title="What the server never sees">
        <DocList
          items={[
            <>
              <strong>Your passphrase.</strong> It is never transmitted and never
              stored — not even as a hash. It exists only in your device&apos;s
              memory while your vault is unlocked.
            </>,
            <>
              <strong>Your encryption keys.</strong> The CEK and the
              passphrase-derived KEK are computed and used entirely client-side.
            </>,
            <>
              <strong>Your plaintext file contents.</strong> The server only ever
              handles already-encrypted chunks.
            </>,
            <>
              <strong>Your folder names.</strong> These are encrypted on your
              device before upload.
            </>,
            <>
              <strong>Any per-folder password.</strong> A protected folder is
              verified locally; the password never reaches us. See{" "}
              <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
                per-folder encryption
              </Link>.
            </>,
          ]}
        />
        <DocNote type="security" title="What a database breach yields">
          An attacker with our entire database walks away with ciphertext blobs,
          wrapped keys they cannot unwrap, bcrypt password hashes, and size
          metadata. They cannot decrypt a single file. A subpoena produces the
          same useless set — we cannot comply with a demand to read your data
          because we have no means to.
        </DocNote>
      </DocSection>

      <DocSection id="names" title="The honest nuance: file names">
        <DocP>
          We will not over-claim here. <strong>Folder names are fully encrypted
          client-side</strong> — the database stores only an opaque{" "}
          <span className="font-mono">encrypted_name</span> blob it cannot read.
          File names are in transition: the files table carries an{" "}
          <span className="font-mono">encrypted_name</span> column{" "}
          <em>and</em> a legacy plaintext{" "}
          <span className="font-mono">original_name</span> column that is still
          populated.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Folder structure and folder names are private.</strong> A
              locked vault shows folders as{" "}
              <span className="font-mono">[locked]</span>.
            </>,
            <>
              <strong>A file&apos;s plaintext name may still be present</strong>{" "}
              in the metadata row. Treat file names as visible metadata, not
              secret, until the plaintext column is fully retired.
            </>,
            <>
              <strong>File contents are unaffected.</strong> Names are metadata;
              the bytes inside every file are encrypted regardless.
            </>,
          ]}
        />
        <DocNote type="warning" title="Practical guidance">
          If a file&apos;s <em>name</em> is itself sensitive (for example, it
          contains a person&apos;s name or a case number), put it inside a folder
          whose name is encrypted, or rename the file to something neutral. The
          contents are protected either way; the file name is the part to be
          careful with today.
        </DocNote>
      </DocSection>

      <DocSection id="tokens" title="The one exception: storage tokens">
        <DocP>
          There is exactly one surface that is not zero-knowledge, and we would
          rather you hear it from us. To push and pull encrypted chunks on your
          behalf, the server has to use <em>your</em> storage-provider
          credentials (GitHub, GitLab, Hugging Face, Telegram). Those tokens are
          encrypted at rest, but not with your passphrase — they are encrypted
          with a key the server itself can derive.
        </DocP>
        <DocList
          items={[
            <>
              The server holds a single <span className="font-mono">MASTER_KEY</span>{" "}
              and derives a per-user Key Encryption Key from it using HKDF-SHA256.
            </>,
            <>
              That KEK encrypts your storage-provider tokens with AES-256-GCM
              before they touch the database — never plaintext at rest.
            </>,
            <>
              This lets zcrypt act on your storage account, but it does{" "}
              <strong>not</strong> give the server any ability to read your files:
              the tokens unlock the <em>repository</em>, and the repository holds
              only ciphertext.
            </>,
          ]}
        />
        <DocNote type="security" title="Why this is acceptable">
          The blast radius is your storage credentials, not your data. Even with
          your tokens, an attacker reaches encrypted chunks they cannot decrypt
          without your passphrase. We document this trade-off rather than paper
          over it — see the{" "}
          <Link href="/docs/threat-model" className="text-cyan-600 hover:underline dark:text-cyan-400">
            threat model
          </Link>{" "}
          for where it sits among the risks.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encryption model — the algorithms and the upload pipeline
            </Link>,
            <Link key="b" href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Storage obfuscation — how stored chunks are made unremarkable
            </Link>,
            <Link key="c" href="/docs/threat-model" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Threat model — the full list of what is and isn&apos;t covered
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
