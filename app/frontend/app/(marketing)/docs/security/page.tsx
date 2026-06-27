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
  title: "Encryption model | zcrypt Docs",
  description:
    "The exact cryptography behind zcrypt: AES-256-GCM with envelope encryption, PBKDF2-HMAC-SHA256 at 600,000 iterations, a random per-file content key, and client-side zstd compression — all performed on your device before anything leaves it.",
  alternates: { canonical: "https://zcrypt.cloud/docs/security" },
  openGraph: {
    title: "Encryption model | zcrypt Docs",
    description:
      "AES-256-GCM, envelope encryption, PBKDF2 at 600k iterations, and per-file content keys — the precise cryptography zcrypt runs on your device.",
    url: "https://zcrypt.cloud/docs/security",
  },
};

const toc = [
  { id: "primitives", title: "The primitives" },
  { id: "envelope", title: "Envelope encryption" },
  { id: "derivation", title: "Key derivation" },
  { id: "pipeline", title: "The upload pipeline" },
  { id: "chunks", title: "Chunks & integrity" },
  { id: "next", title: "Where to go next" },
];

export default function EncryptionModelPage() {
  return (
    <DocPage
      href="/docs/security"
      title="Encryption model"
      description="Everything in zcrypt is encrypted on your device before it touches the network. This page documents exactly which algorithms run, in what order, and where each key lives — no hand-waving."
      toc={toc}
    >
      <DocSection id="primitives" title="The primitives">
        <DocP>
          zcrypt uses a small, deliberately boring set of well-understood
          primitives. There is no custom cipher and no novel construction — just
          standard authenticated encryption and a standard key-derivation
          function, run client-side via the Web Crypto API (in the browser) or
          the Go standard library (in the TUI). The exact parameters below are
          shared by both clients, so a file encrypted in the browser decrypts in
          the TUI and vice versa.
        </DocP>
        <DocTable
          head={["Purpose", "Primitive", "Parameters"]}
          rows={[
            [
              "Content encryption",
              <span key="a" className="font-mono">AES-256-GCM</span>,
              "256-bit key, 12-byte random nonce, 16-byte auth tag",
            ],
            [
              "Key derivation",
              <span key="b" className="font-mono">PBKDF2-HMAC-SHA256</span>,
              "600,000 iterations, 32-byte random salt, 256-bit output",
            ],
            [
              "Integrity",
              <span key="c" className="font-mono">SHA-256</span>,
              "Per-chunk and whole-file digests",
            ],
            [
              "Token wrapping (server-side)",
              <span key="d" className="font-mono">HKDF-SHA256 + AES-256-GCM</span>,
              "Per-user KEK derived from a server master key",
            ],
          ]}
        />
        <DocNote type="info" title="Why AES-GCM specifically">
          GCM is <em>authenticated</em> encryption: every ciphertext carries a
          16-byte tag bound to the key and nonce. Flip a single bit of a stored
          chunk and decryption fails loudly rather than returning garbage. You
          get confidentiality and tamper-detection from one pass.
        </DocNote>
        <DocP>
          The last row — token wrapping — is the one place zcrypt holds a key
          server-side, and it never touches your files. It is covered honestly
          in{" "}
          <Link href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
            the zero-knowledge architecture
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="envelope" title="Envelope encryption">
        <DocP>
          Your passphrase does not encrypt your files directly. Instead, every
          file gets its own random 256-bit <strong>Content Encryption Key
          (CEK)</strong>. The file&apos;s chunks are encrypted with that CEK, and
          the CEK itself is then <em>wrapped</em> (encrypted) with a Key
          Encryption Key (KEK) derived from your passphrase. This is called
          envelope encryption.
        </DocP>
        <DocList
          items={[
            <>
              <strong>The CEK</strong> is generated fresh, at random, per file —
              never derived from anything you type.
            </>,
            <>
              <strong>The KEK</strong> is derived from your passphrase plus the
              file&apos;s salt and is used only to wrap and unwrap the CEK.
            </>,
            <>
              <strong>The server stores the wrapped CEK</strong> (a small
              base64 ciphertext) and the salt, but holds no key that can unwrap
              it.
            </>,
          ]}
        />
        <DocP>
          This indirection is what makes secure sharing and{" "}
          <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
            per-folder passwords
          </Link>{" "}
          possible without ever exposing your passphrase: zcrypt can re-wrap a
          file&apos;s CEK under a different key — a one-time share key, or a
          folder-password key — so a recipient (or a different password) can
          decrypt that one file while your master passphrase never moves. The
          underlying chunks are untouched; only the small wrapped CEK changes.
          See{" "}
          <Link href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
            passphrase &amp; key management
          </Link>{" "}
          for how keys flow end to end.
        </DocP>
        <DocNote type="security" title="Legacy files">
          A small number of files predate envelope encryption and were encrypted
          directly with the passphrase-derived key (no wrapped CEK). zcrypt
          detects this automatically on download — a file with no stored wrapped
          CEK uses the passphrase-derived key as the content key directly — so
          either path just works and you never have to think about it.
        </DocNote>
      </DocSection>

      <DocSection id="derivation" title="Key derivation">
        <DocP>
          Keys are derived with PBKDF2-HMAC-SHA256 at <strong>600,000
          iterations</strong> against a cryptographically random{" "}
          <strong>32-byte salt</strong>. The high iteration count makes each
          guess expensive, so brute-forcing a strong passphrase is
          computationally impractical. The salt is unique per file, so identical
          passphrases never produce identical keys and a precomputed-table
          attack buys an adversary nothing.
        </DocP>
        <DocCode label="key derivation (conceptual)">{`salt = random(32 bytes)                       // unique per file
KEK  = PBKDF2-HMAC-SHA256(passphrase, salt,    // 600,000 iterations
                          iter = 600000,
                          dkLen = 32)
CEK  = random(32 bytes)                        // unique per file
wrappedCEK = AES-256-GCM(key = KEK, plaintext = CEK)`}</DocCode>
        <DocP>
          The salt is not secret — it is stored alongside the file&apos;s
          metadata. The passphrase is. It is never transmitted, never written to
          our database, and exists only in your device&apos;s memory for the
          duration of an unlocked session.
        </DocP>
      </DocSection>

      <DocSection id="pipeline" title="The upload pipeline">
        <DocP>
          When you add a file, all of the heavy lifting happens locally — in a
          Web Worker in the browser, or on-device in the TUI. The server only
          ever receives finished, encrypted chunks.
        </DocP>
        <DocList
          ordered
          items={[
            <>
              <strong>Compress.</strong> The file is compressed with zstd{" "}
              <em>on your device, before encryption</em>. Encrypted data is
              effectively random and will not compress, so this order matters.
            </>,
            <>
              <strong>Encrypt.</strong> Each compressed chunk is sealed with
              AES-256-GCM under the file&apos;s CEK, producing{" "}
              <span className="font-mono">[12B nonce][ciphertext][16B tag]</span>.
            </>,
            <>
              <strong>Hash.</strong> A SHA-256 digest is computed per chunk for
              integrity, and a whole-file digest is recorded.
            </>,
            <>
              <strong>Store.</strong> Chunks are pushed to your configured
              storage backend as opaque binary blobs.
            </>,
          ]}
        />
        <DocNote type="warning" title="Compression is client-side only">
          The backend does <strong>not</strong> compress anything. It merely
          carries a per-chunk <span className="font-mono">compressed</span> flag
          so the client knows whether to run zstd in reverse on the way back
          down. Older documentation implied server-side zstd — that was never
          how it worked.
        </DocNote>
      </DocSection>

      <DocSection id="chunks" title="Chunks & integrity">
        <DocP>
          Files are split into chunks so uploads can run in parallel, resume
          after interruption, and stay within storage-provider size limits. The
          plaintext chunk size is chosen adaptively for your device —{" "}
          <strong>4 MB</strong> on constrained hardware up to{" "}
          <strong>16 MB</strong> on machines with plenty of memory — and each
          encrypted chunk adds a 12-byte nonce plus a 16-byte tag of overhead.
          Encrypted chunks therefore top out around <strong>16–17 MB</strong>.
        </DocP>
        <DocList
          items={[
            <>
              Every chunk is independently authenticated by its GCM tag, so
              tampering with one chunk cannot silently corrupt the file.
            </>,
            <>
              Per-chunk and whole-file SHA-256 digests let the client verify
              that what it downloaded is exactly what it uploaded.
            </>,
            <>
              Because each chunk is encrypted on its own, large files stream
              through memory in bounded windows rather than being held whole.
            </>,
          ]}
        />
        <DocNote type="info" title="On chunk sizes">
          A nonce and a tag are appended per chunk, not per file, so overhead is
          a flat ~28 bytes per chunk regardless of file size. The exact
          plaintext window is picked from your device&apos;s reported memory at
          upload time.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocP>Dig into the guarantees and the honest edges of this design.</DocP>
        <DocList
          items={[
            <Link key="a" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge architecture — what the server can and cannot see
            </Link>,
            <Link key="b" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Passphrase &amp; key management — how keys are derived, held, and revoked
            </Link>,
            <Link key="c" href="/docs/threat-model" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Threat model — what zcrypt defends against, and what it does not
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
