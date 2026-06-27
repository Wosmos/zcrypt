import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocSubsection,
  DocP,
  DocList,
  DocNote,
  DocTable,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Passphrase & key management | zcrypt Docs",
  description:
    "How keys flow through zcrypt: the vault passphrase that never leaves your device, account login secured with bcrypt and TOTP, JWTs with algorithm-confusion defenses and version-based revocation, and IP-bound refresh tokens.",
  alternates: { canonical: "https://zcrypt.cloud/docs/key-management" },
  openGraph: {
    title: "Passphrase & key management | zcrypt Docs",
    description:
      "The two secrets in zcrypt — your vault passphrase and your account password — and exactly how each is handled, hardened, and revoked.",
    url: "https://zcrypt.cloud/docs/key-management",
  },
};

const toc = [
  { id: "two-secrets", title: "Two different secrets" },
  { id: "passphrase", title: "The vault passphrase" },
  { id: "account", title: "Account login security" },
  { id: "sessions", title: "Tokens & sessions" },
  { id: "revocation", title: "Revocation & recovery" },
  { id: "next", title: "Where to go next" },
];

export default function KeyManagementPage() {
  return (
    <DocPage
      href="/docs/key-management"
      title="Passphrase & key management"
      description="zcrypt keeps two secrets cleanly separate: the passphrase that unlocks your encryption, and the password that authenticates your account. This page traces both, and the defenses around the sessions in between."
      toc={toc}
    >
      <DocSection id="two-secrets" title="Two different secrets">
        <DocP>
          It is worth getting this distinction straight, because the two secrets
          do very different jobs and are handled very differently.
        </DocP>
        <DocTable
          head={["", "Vault passphrase", "Account password"]}
          rows={[
            ["Purpose", "Derives your encryption keys", "Authenticates login"],
            ["Reaches the server?", "Never", "Verified, then only a hash is stored"],
            ["Stored anywhere?", "No — device memory only", "As a bcrypt hash"],
            ["If forgotten", "Data is unrecoverable", "Reset via email"],
          ]}
        />
        <DocNote type="info" title="They can be the same string — but they are not the same secret">
          Even if you choose to type the same value for both, they travel
          different paths: the passphrase is consumed locally by key derivation,
          while the password is checked server-side. One unlocks cryptography; the
          other unlocks an account session.
        </DocNote>
      </DocSection>

      <DocSection id="passphrase" title="The vault passphrase">
        <DocP>
          Your vault passphrase is the root of all encryption in zcrypt. It is
          fed through PBKDF2-HMAC-SHA256 at 600,000 iterations with a per-file
          salt to derive the Key Encryption Key that wraps each file&apos;s
          content key. The full mechanics are in the{" "}
          <Link href="/docs/security" className="text-cyan-600 hover:underline dark:text-cyan-400">
            encryption model
          </Link>.
        </DocP>
        <DocList
          items={[
            <>
              It is <strong>never transmitted</strong> to the server and{" "}
              <strong>never stored</strong> — not even hashed.
            </>,
            <>
              It lives only in your device&apos;s memory while the vault is
              unlocked, and is discarded when the session ends or the vault locks.
            </>,
            <>
              Because the server holds nothing derived from it, a strong
              passphrase is the single most important thing you control. Choose a
              long, unique one and keep it in a password manager.
            </>,
          ]}
        />
        <DocNote type="warning" title="There is no passphrase reset">
          Recovery would require the server to hold a copy of your key, which
          would defeat zero-knowledge. If you lose your passphrase, your
          encrypted data cannot be recovered by anyone — including us. This is the
          deliberate cost of the guarantee.
        </DocNote>
      </DocSection>

      <DocSection id="account" title="Account login security">
        <DocSubsection title="Password hashing">
          <DocP>
            Account passwords are hashed with <strong>bcrypt at cost factor
            12</strong> before storage. bcrypt is deliberately slow and salted
            per-hash, which blunts offline cracking if the database is ever
            exposed.
          </DocP>
        </DocSubsection>
        <DocSubsection title="Breach screening (HaveIBeenPwned)">
          <DocP>
            At registration, your chosen password is checked against the
            HaveIBeenPwned database using <strong>k-anonymity</strong>: only the
            first five characters of its SHA-1 hash are sent, never the password
            itself. If it appears in known breaches, you get a warning with the
            count. This <strong>warns rather than blocks</strong>, and it{" "}
            <em>fails open</em> — if the breach service is unreachable, signup is
            not held up.
          </DocP>
        </DocSubsection>
        <DocSubsection title="Two-factor authentication (TOTP)">
          <DocP>
            You can enable time-based one-time passwords (TOTP, RFC 6238) with any
            standard authenticator app. Once enabled, login issues only a
            short-lived intermediate token until the correct code is supplied —
            the full session token is never minted on password alone.
          </DocP>
        </DocSubsection>
      </DocSection>

      <DocSection id="sessions" title="Tokens & sessions">
        <DocP>
          Sessions use signed JSON Web Tokens, with several deliberate hardening
          choices around them.
        </DocP>
        <DocList
          items={[
            <>
              <strong>HS256 with an explicit algorithm check.</strong> The verifier
              requires the header algorithm to be exactly{" "}
              <span className="font-mono">HS256</span> and rejects anything else,
              closing the classic algorithm-confusion (e.g.{" "}
              <span className="font-mono">alg: none</span>) attack.
            </>,
            <>
              <strong>Typed tokens.</strong> The short-lived token issued
              mid-login for the 2FA step is a distinct type and is refused at
              authenticated endpoints, so it can never be replayed past the
              second factor.
            </>,
            <>
              <strong>Short-lived access tokens.</strong> Access tokens expire
              quickly and are refreshed via a longer-lived refresh token.
            </>,
            <>
              <strong>Refresh tokens are stored hashed and client-bound.</strong>{" "}
              Only a SHA-256 hash of each refresh token is kept, and it is bound to
              the issuing IP address and user-agent.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="revocation" title="Revocation & recovery">
        <DocP>
          Every account carries a <strong>token version</strong> embedded in its
          access tokens. Bumping that version instantly invalidates every
          outstanding token for the account — a single switch to sign out all
          sessions everywhere, used on password change and on demand.
        </DocP>
        <DocList
          items={[
            <>
              <strong>Account recovery</strong> (forgotten <em>password</em>) goes
              through an emailed, single-use reset token — the hash of which is
              what we store, never the token itself.
            </>,
            <>
              <strong>Vault recovery</strong> (forgotten <em>passphrase</em>) does
              not exist by design; see above. Account access and data access are
              separate problems.
            </>,
            <>
              Refresh tokens can be revoked individually or wiped for an entire
              account, and all of them expire on a fixed schedule regardless.
            </>,
          ]}
        />
        <DocNote type="security" title="Login does not unlock your vault">
          Authenticating proves who you are to the service; it does not hand the
          server your keys. After login you still supply your passphrase locally
          to decrypt — which is why even a fully compromised account session
          cannot read your files without it.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/folder-encryption" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Per-folder encryption — add a second password to a sensitive folder
            </Link>,
            <Link key="b" href="/docs/threat-model" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Threat model — where a weak passphrase or compromised device leaves you
            </Link>,
            <Link key="c" href="/docs/zero-knowledge" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Zero-knowledge architecture — what the server stores about your account
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
