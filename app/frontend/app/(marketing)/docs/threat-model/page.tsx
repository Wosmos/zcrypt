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
  title: "Threat model | zcrypt Docs",
  description:
    "An honest account of what zcrypt defends against — server breaches, storage-provider access, MITM, insider access, metadata leakage — and what it cannot protect: a compromised device, a weak passphrase, and frontend supply-chain risk.",
  alternates: { canonical: "https://zcrypt.cloud/docs/threat-model" },
  openGraph: {
    title: "Threat model | zcrypt Docs",
    description:
      "What zcrypt protects against and what it does not — stated plainly, with the reasoning and the mitigations for each gap.",
    url: "https://zcrypt.cloud/docs/threat-model",
  },
};

const toc = [
  { id: "protected", title: "What zcrypt protects against" },
  { id: "not-protected", title: "What it does not protect against" },
  { id: "matrix", title: "At a glance" },
  { id: "guidance", title: "Reducing your exposure" },
  { id: "next", title: "Where to go next" },
];

export default function ThreatModelPage() {
  return (
    <DocPage
      href="/docs/threat-model"
      title="Threat model"
      description="A security tool is only as honest as its threat model. Here is what zcrypt is designed to stop, what it cannot, and why — so you can decide whether it fits your situation rather than taking a slogan on faith."
      toc={toc}
    >
      <DocSection id="protected" title="What zcrypt protects against">
        <DocP>
          The architecture is built so that the most likely and most damaging
          server-side compromises yield nothing usable.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Server or database breach.</strong> An attacker with our
              full database gets ciphertext, wrapped keys they cannot unwrap, and
              bcrypt hashes. File contents stay sealed.
            </>,
            <>
              <strong>Storage-provider access.</strong> Your chunks live on
              GitHub, GitLab, Hugging Face, or Telegram — all of which see only
              encrypted <span className="font-mono">.bin</span> blobs, never
              plaintext.
            </>,
            <>
              <strong>Man-in-the-middle.</strong> Transport is TLS, and the
              payload is already encrypted client-side, so intercepting traffic
              reveals ciphertext on top of ciphertext.
            </>,
            <>
              <strong>Insider access.</strong> No one operating zcrypt can read
              your files. There is no internal tool, key escrow, or admin override
              that decrypts user data — the keys simply are not on our side.
            </>,
            <>
              <strong>Metadata leakage.</strong> Folder names are encrypted
              client-side, and stored chunks are disguised with random filenames,
              plausible repository names, and generic commit messages. See{" "}
              <Link href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
                storage obfuscation
              </Link>.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="not-protected" title="What it does not protect against">
        <DocP>
          No client-side encryption scheme can defend everything. These are the
          real gaps, stated plainly.
        </DocP>
        <DocList
          items={[
            <>
              <strong>A compromised device.</strong> Encryption happens on your
              machine, so malware or a keylogger that already has your device can
              capture your passphrase as you type it or read decrypted data from
              memory. Endpoint security is on you.
            </>,
            <>
              <strong>A weak passphrase.</strong> 600,000 PBKDF2 iterations slow
              guessing down dramatically, but they cannot save a passphrase that
              is short or common. If it can be guessed, the derived key can be
              reproduced.
            </>,
            <>
              <strong>Frontend supply-chain risk.</strong> The web app is code we
              serve, so in principle a compromised build could be made to exfil a
              passphrase. This is mitigated by the project being open source (you
              can audit and self-host) and by the TUI, a compiled binary with no
              browser supply chain.
            </>,
          ]}
        />
        <DocNote type="warning" title="The honest summary">
          zcrypt removes <em>us</em> and the <em>storage providers</em> from your
          trust boundary. It cannot remove <em>your device</em> or the strength of
          your <em>passphrase</em> from it — those remain yours to protect.
        </DocNote>
      </DocSection>

      <DocSection id="matrix" title="At a glance">
        <DocTable
          head={["Threat", "Covered?", "Why"]}
          rows={[
            ["Database / server breach", "Yes", "Only ciphertext and unusable wrapped keys are stored"],
            ["Storage provider snooping", "Yes", "Providers hold encrypted .bin blobs only"],
            ["Network interception (MITM)", "Yes", "TLS plus client-side encryption"],
            ["Malicious or compelled insider", "Yes", "No keys exist on the server to misuse"],
            ["Metadata / folder-name leakage", "Yes", "Encrypted names + disguised storage"],
            ["File-name leakage", "Partial", "A legacy plaintext name column still exists"],
            ["Storage-token theft from server", "Partial", "Tokens are encrypted at rest under a server master key"],
            ["Compromised user device", "No", "Plaintext and passphrase are exposed on-device"],
            ["Weak / reused passphrase", "No", "A guessable passphrase reproduces the key"],
            ["Frontend supply-chain attack", "Partial", "Mitigated by open source + the TUI"],
          ]}
        />
        <DocP>
          The two &ldquo;partial&rdquo; rows on file names and storage tokens are
          explained in full in{" "}
          <Link href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
            zero-knowledge architecture
          </Link>{" "}
          — we would rather flag them here than quietly mark everything green.
        </DocP>
      </DocSection>

      <DocSection id="guidance" title="Reducing your exposure">
        <DocList
          items={[
            <>
              Use a <strong>long, unique passphrase</strong> from a password
              manager — this is the highest-leverage thing you can do.
            </>,
            <>
              Enable <strong>TOTP two-factor authentication</strong> on your
              account, covered in{" "}
              <Link href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
                key management
              </Link>.
            </>,
            <>
              Keep the device you use with zcrypt patched and free of untrusted
              software.
            </>,
            <>
              For the strongest assurance, <strong>audit the open-source
              code</strong> or use the <strong>TUI</strong> to sidestep
              browser-delivered JavaScript entirely.
            </>,
            <>
              Put sensitivity-by-name files inside an{" "}
              <Link href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
                encrypted folder
              </Link>{" "}
              rather than relying on the file name being hidden.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge architecture — the precise list of what is stored
            </Link>,
            <Link key="b" href="/docs/obfuscation" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Storage obfuscation — how the metadata-leakage defense works
            </Link>,
            <Link key="c" href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encryption model — the cryptography underneath it all
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
