import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocCode,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Per-folder encryption | zcrypt Docs",
  description:
    "Give a folder its own password, distinct from your vault passphrase. zcrypt verifies it locally with no server round-trip, re-wraps each file's content key under a folder-derived key, and re-keys files automatically when they cross the boundary.",
  alternates: { canonical: "https://zcrypt.cloud/docs/folder-encryption" },
  openGraph: {
    title: "Per-folder encryption | zcrypt Docs",
    description:
      "A second password layer for sensitive folders — verified on-device, never sent to the server, with automatic re-keying across the boundary.",
    url: "https://zcrypt.cloud/docs/folder-encryption",
  },
};

const toc = [
  { id: "what", title: "What it is" },
  { id: "verify", title: "Local password verification" },
  { id: "rekey", title: "Re-keying across the boundary" },
  { id: "server", title: "What the server stores" },
  { id: "caveats", title: "Caveats" },
  { id: "next", title: "Where to go next" },
];

export default function FolderEncryptionPage() {
  return (
    <DocPage
      href="/docs/folder-encryption"
      title="Per-folder encryption"
      description="A folder can have its own password, separate from your vault passphrase — a second lock for the things that need one. It is built entirely on the same envelope primitive, and the folder password never leaves your device."
      toc={toc}
    >
      <DocSection id="what" title="What it is">
        <DocP>
          By default, every file in your vault is protected by your vault
          passphrase. Per-folder encryption adds an <em>independent</em> password
          to a specific folder, so opening that folder requires something extra —
          useful for the handful of folders you want sealed off even from your
          own everyday session.
        </DocP>
        <DocP>
          There is no new cryptography here. A protected folder reuses the exact{" "}
          <Link href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
            envelope encryption
          </Link>{" "}
          scheme used everywhere else in zcrypt. The only thing that changes is{" "}
          <em>which</em> password derives the key that wraps each file&apos;s
          Content Encryption Key — the folder password instead of the vault
          passphrase.
        </DocP>
      </DocSection>

      <DocSection id="verify" title="Local password verification">
        <DocP>
          When you set a folder password, your device generates a random salt and
          builds a small <strong>verifier</strong>: a fixed constant encrypted
          with the folder-password-derived key. To check a typed password later,
          the client re-derives the key and tries to decrypt that verifier. The
          right password decrypts it; a wrong one fails GCM authentication. All
          of this happens on-device with no server round-trip.
        </DocP>
        <DocCode label="folder password verifier (conceptual)">{`pw_salt     = random(32 bytes)                       // per folder
KEK_pw      = PBKDF2-HMAC-SHA256(folder_password, pw_salt, 600000, 32)
pw_verifier = AES-256-GCM(key = KEK_pw, plaintext = "zcrypt-folder-verify-v1")

// later, to verify a typed password — entirely on-device:
AES-256-GCM-open(KEK_pw', pw_verifier) == "zcrypt-folder-verify-v1" ?`}</DocCode>
        <DocNote type="info" title="Why a verifier instead of asking the server">
          The verifier lets the app tell you immediately whether a password is
          correct without decrypting a real file and without the server ever
          participating in the check. The server cannot validate the password
          because it never has the material to.
        </DocNote>
      </DocSection>

      <DocSection id="rekey" title="Re-keying across the boundary">
        <DocP>
          A file&apos;s already-uploaded chunks never get re-encrypted when you
          protect a folder — that would mean re-uploading everything. Instead,
          only the tiny wrapped key changes. When a file enters a protected
          folder, the client recovers its existing CEK under the source key, then
          re-wraps that same CEK under a fresh folder-password-derived key and a
          new salt.
        </DocP>
        <DocList
          ordered
          items={[
            <>
              <strong>Recover</strong> the file&apos;s existing CEK using the
              source password (vault passphrase or the old folder password).
            </>,
            <>
              <strong>Re-wrap</strong> that same CEK under the destination
              password&apos;s derived key with a new per-file salt.
            </>,
            <>
              <strong>Persist</strong> the new salt and wrapped CEK via the{" "}
              <span className="font-mono">/rekey</span> endpoint — it updates only
              those two fields and touches no chunk data.
            </>,
          ]}
        />
        <DocP>
          Moving a file <em>out</em> of a protected folder runs the same dance in
          reverse, re-wrapping the CEK back under your vault passphrase. The
          underlying ciphertext on your storage backend is never rewritten.
        </DocP>
      </DocSection>

      <DocSection id="server" title="What the server stores">
        <DocP>
          For a protected folder, the server holds exactly two opaque,
          client-computed base64 blobs, and nothing else about the password:
        </DocP>
        <DocList
          items={[
            <>
              <span className="font-mono">pw_salt</span> — the random per-folder
              salt used to derive the folder-password key on your device.
            </>,
            <>
              <span className="font-mono">pw_verifier</span> — the small
              ciphertext used for local verification. It reveals nothing about the
              password.
            </>,
          ]}
        />
        <DocNote type="security" title="The folder password is never sent">
          The server never derives, sees, or logs the folder password or any key
          derived from it. A folder counts as &ldquo;protected&rdquo; purely
          because <span className="font-mono">pw_salt</span> is present. Audit
          events for setting or clearing a folder password record only the folder
          ID — never the salt, the verifier, or any key material.
        </DocNote>
      </DocSection>

      <DocSection id="caveats" title="Caveats">
        <DocList
          items={[
            <>
              <strong>A forgotten folder password is unrecoverable.</strong> Just
              like the vault passphrase, there is no reset — the key exists
              nowhere we can reach. Store it in a password manager.
            </>,
            <>
              <strong>It protects file contents, not the folder name in
              transit.</strong> Folder names are already encrypted client-side
              under your vault key; the folder password governs the files&apos;
              content keys.
            </>,
            <>
              <strong>You must re-key before unprotecting.</strong> Removing a
              folder password requires the client to first re-key its files back
              to the vault passphrase, so nothing is left wrapped under a key
              you&apos;re about to discard.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Passphrase &amp; key management — how every key in zcrypt is derived and held
            </Link>,
            <Link key="b" href="/docs/folders" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Folders &amp; the file explorer — create, nest, and navigate folders
            </Link>,
            <Link key="c" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge architecture — what the server can and cannot see
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
