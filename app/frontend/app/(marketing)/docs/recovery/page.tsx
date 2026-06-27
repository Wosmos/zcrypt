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
  title: "Account recovery | zcrypt Docs",
  description:
    "What zcrypt can and cannot recover. Account access can be restored through email password reset and two-factor. Your vault passphrase and folder passwords are zero-knowledge: lose them and no one — including us — can decrypt your files.",
  alternates: { canonical: "https://zcrypt.cloud/docs/recovery" },
  openGraph: {
    title: "Account recovery | zcrypt Docs",
    description:
      "Account access is recoverable; your vault passphrase and folder passwords are not. The exact line between the two, and how to protect what can't be recovered.",
    url: "https://zcrypt.cloud/docs/recovery",
  },
};

const toc = [
  { id: "two-things", title: "Two very different things" },
  { id: "recoverable", title: "What we can recover" },
  { id: "not-recoverable", title: "What we cannot recover" },
  { id: "protect", title: "How to protect your passphrase" },
  { id: "next", title: "Where to go next" },
];

export default function RecoveryDocPage() {
  return (
    <DocPage
      href="/docs/recovery"
      title="Account recovery"
      description="zcrypt is zero-knowledge by design, which makes recovery a two-sided story: getting back into your account is routine, but getting back the secret that decrypts your files is impossible if you lose it."
      toc={toc}
    >
      <DocSection id="two-things" title="Two very different things">
        <DocP>
          &ldquo;I&apos;m locked out&rdquo; can mean two completely different
          situations in zcrypt, and they have opposite outcomes. Knowing which
          one you&apos;re in tells you immediately whether recovery is possible.
        </DocP>
        <DocTable
          head={["You lost…", "Recoverable?", "How"]}
          rows={[
            [
              <strong key="a">Account password</strong>,
              <span key="a2" className="text-cyan-600 dark:text-cyan-400">Yes</span>,
              "Email password reset",
            ],
            [
              <strong key="b">Authenticator (2FA)</strong>,
              <span key="b2" className="text-cyan-600 dark:text-cyan-400">Yes, with care</span>,
              "Your other sign-in methods / backups",
            ],
            [
              <strong key="c">Vault passphrase</strong>,
              <span key="c2" className="text-amber-600 dark:text-amber-400">No</span>,
              "Nothing — by design",
            ],
            [
              <strong key="d">Folder password</strong>,
              <span key="d2" className="text-amber-600 dark:text-amber-400">No</span>,
              "Nothing — by design",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="recoverable" title="What we can recover: account access">
        <DocP>
          Getting back <em>into your account</em> is a normal, supported flow,
          because your account credentials live on the server (as hashes) where
          they can be reset or re-issued.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Forgot your password?</strong> Request a reset link by
              email and choose a new one. See{" "}
              <Link href="/docs/authentication" className="text-cyan-600 hover:underline dark:text-cyan-400">
                Authentication &amp; 2FA
              </Link>
              .
            </>,
            <>
              <strong>Sign in with a provider.</strong> If you linked Google or
              GitHub, you can log in through{" "}
              <Link href="/docs/oauth" className="text-cyan-600 hover:underline dark:text-cyan-400">
                OAuth
              </Link>{" "}
              even without your password.
            </>,
            <>
              <strong>Lost your authenticator?</strong> If you can still sign in
              another way, you can manage two-factor from settings. Keep a backup
              of your TOTP secret or a second sign-in method so a lost phone
              doesn&apos;t become a lockout.
            </>,
          ]}
        />
        <DocP>
          Recovering account access gets you back to your file list. It does{" "}
          <strong>not</strong> unlock your files — for that you still need your
          vault passphrase.
        </DocP>
      </DocSection>

      <DocSection id="not-recoverable" title="What we cannot recover: your data">
        <DocP>
          This is the part to read twice. zcrypt is <strong>zero-knowledge</strong>:
          your files are encrypted on your device with keys derived from your
          vault passphrase, and that passphrase is <strong>never sent to the
          server</strong>. We hold only ciphertext.
        </DocP>
        <DocNote type="warning" title="If you lose your vault passphrase, your files are gone">
          <p className="mb-2">
            There is no reset link, no backdoor, and no support request that can
            recover a lost vault passphrase — not for you, and not for us.
            Without it, the keys that decrypt your files cannot be reconstructed,
            so the files (and their folder names) are permanently unreadable.
            This is not a limitation we can lift; it is the whole point of
            zero-knowledge encryption. The same protection that stops <em>us</em>
            from reading your data stops <em>anyone</em> from restoring it once
            the passphrase is lost.
          </p>
          <p>
            <strong>Folder passwords are the same.</strong> Any folder you secure
            with its own password is encrypted under a key derived from that
            password. Lose the folder password and that folder&apos;s contents
            are unrecoverable, even while the rest of your vault opens normally.
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="protect" title="How to protect your passphrase">
        <DocP>
          Because the passphrase can never be recovered, protecting it is
          entirely on you — and it&apos;s straightforward:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Use a password manager.</strong> Store your vault
              passphrase (and any folder passwords) in a reputable manager like
              1Password, Bitwarden, or KeePass. This is the single best thing you
              can do.
            </>,
            "Choose a long, memorable passphrase rather than a short complex one — length beats cleverness.",
            "Keep at least one secure offline copy somewhere only you can reach, especially before storing anything important.",
            "Never email it to yourself or paste it into a chat — that would defeat the zero-knowledge guarantee.",
          ]}
        />
        <DocNote type="info">
          Treat your vault passphrase like the only key to a safe deposit box you
          own outright. The bank can let you into the building, but if you lose
          the key, no one can open the box.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Key management — how your passphrase becomes your encryption keys
            </Link>,
            <Link key="b" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge — what the server can and can&apos;t see
            </Link>,
            <Link key="c" href="/docs/authentication" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Authentication & 2FA — resetting your password and managing two-factor
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
