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
  title: "Authentication & 2FA | zcrypt Docs",
  description:
    "How you sign in to zcrypt: email and password sign-up with breach checks, email verification, password reset, passwordless magic links, JWT sessions, and TOTP two-factor — and why your account password is not your vault passphrase.",
  alternates: { canonical: "https://zcrypt.cloud/docs/authentication" },
  openGraph: {
    title: "Authentication & 2FA | zcrypt Docs",
    description:
      "Email/password sign-up, magic links, JWT sessions, and TOTP two-factor in zcrypt — plus the difference between your account password and your vault passphrase.",
    url: "https://zcrypt.cloud/docs/authentication",
  },
};

const toc = [
  { id: "password-vs-passphrase", title: "Password vs. passphrase" },
  { id: "sign-up", title: "Signing up" },
  { id: "verification", title: "Email verification" },
  { id: "magic-link", title: "Magic-link login" },
  { id: "reset", title: "Resetting your password" },
  { id: "sessions", title: "Sessions & tokens" },
  { id: "totp", title: "Two-factor (TOTP)" },
  { id: "next", title: "Where to go next" },
];

export default function AuthenticationDocPage() {
  return (
    <DocPage
      href="/docs/authentication"
      title="Authentication & 2FA"
      description="Signing in proves who you are to the service. It is deliberately separate from the passphrase that encrypts your files — so the server can authenticate you without ever being able to read your data."
      toc={toc}
    >
      <DocSection id="password-vs-passphrase" title="Password vs. passphrase">
        <DocP>
          zcrypt uses <strong>two different secrets</strong>, and keeping them
          straight is the single most important thing to understand about your
          account.
        </DocP>
        <DocNote type="security" title="These are not the same secret">
          <p className="mb-2">
            Your <strong>account password</strong> authenticates you to the
            service. It is sent to the server (over TLS), where it is verified
            against a bcrypt hash. Resetting it is routine.
          </p>
          <p>
            Your <strong>vault passphrase</strong> encrypts your files. It is
            used only on your device to derive your encryption keys and is{" "}
            <strong>never sent to the server</strong>. Because we never see it,
            we can never reset it for you — see{" "}
            <Link
              href="/docs/recovery"
              className="text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Account recovery
            </Link>
            .
          </p>
        </DocNote>
        <DocP>
          Everything on this page is about the first secret: how you sign in.
          For how the second secret protects your data, see{" "}
          <Link
            href="/docs/key-management"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Key management
          </Link>
          .
        </DocP>
      </DocSection>

      <DocSection id="sign-up" title="Signing up">
        <DocP>
          Create an account with an email address, a username, and a password.
          Passwords are hashed with <strong>bcrypt</strong> before storage — the
          server never keeps your password in plaintext. To be accepted, a
          password must meet a basic complexity bar:
        </DocP>
        <DocList
          items={[
            "At least 8 characters",
            "At least one uppercase letter",
            "At least one digit",
            "At least one special character (anything that isn't a letter or number)",
          ]}
        />
        <DocP>
          zcrypt also checks your chosen password against the{" "}
          <strong>HaveIBeenPwned</strong> breach corpus using a k-anonymity
          range query — only the first five characters of a SHA-1 hash leave
          your session, never the password itself. If the password has appeared
          in a known breach, you get a warning with the breach count and can
          choose a stronger one or proceed anyway. The same check runs when you
          set a new password during a reset.
        </DocP>
        <DocNote type="info">
          A breach warning never silently blocks you — it is advice. The check
          also fails open: if the breach service is unreachable, sign-up is not
          held up.
        </DocNote>
      </DocSection>

      <DocSection id="verification" title="Email verification">
        <DocP>
          When email is configured for your instance, signing up sends a
          verification link to your address. Verifying your email protects you
          in one concrete way: a verified email is required before an OAuth
          provider with the same address can be auto-linked to your account, so
          nobody can attach their Google or GitHub identity to an email you have
          not proven you control. You can request a fresh verification link if
          the first one expires.
        </DocP>
      </DocSection>

      <DocSection id="magic-link" title="Magic-link login">
        <DocP>
          Prefer not to type a password? Request a <strong>magic link</strong>{" "}
          and zcrypt emails you a one-time sign-in link. Opening it logs you in
          and, if your email wasn&apos;t verified yet, verifies it at the same
          time. Magic links are single-use and short-lived, so an old link in
          your inbox can&apos;t be replayed later.
        </DocP>
        <DocNote type="info">
          To resist account enumeration, the &ldquo;login link sent&rdquo;
          response looks identical whether or not an account exists for that
          address. Only the real owner of the inbox ever receives a working
          link.
        </DocNote>
      </DocSection>

      <DocSection id="reset" title="Resetting your password">
        <DocP>
          Forgot your account password? Request a reset and follow the link
          emailed to you to choose a new one. New passwords must pass the same
          complexity and breach checks as sign-up. Completing a reset is a hard
          security boundary:
        </DocP>
        <DocList
          items={[
            "Your token version is bumped, which invalidates every existing access token immediately.",
            "All refresh tokens are deleted, so every signed-in device is forced to log in again.",
          ]}
        />
        <DocNote type="warning" title="A password reset does not touch your files">
          Resetting your account password restores <em>access to the service</em>
          . It does not — and cannot — decrypt your vault. Your files stay sealed
          under your vault passphrase, which the reset flow never sees.
        </DocNote>
      </DocSection>

      <DocSection id="sessions" title="Sessions & tokens">
        <DocP>
          After you sign in, zcrypt issues two tokens. A short-lived{" "}
          <strong>access token</strong> (a signed JWT) authorizes your API
          requests, and a longer-lived <strong>refresh token</strong> is
          exchanged silently in the background for a fresh access token so you
          stay signed in without re-entering your password.
        </DocP>
        <DocTable
          head={["Token", "Lifetime", "Purpose"]}
          rows={[
            [<strong key="a">Access token (JWT)</strong>, "15 minutes", "Authorizes each API request"],
            [<strong key="b">Refresh token</strong>, "7 days", "Silently mints new access tokens"],
          ]}
        />
        <DocP>
          Refresh tokens are stored only as hashes on the server and are{" "}
          <strong>rotated</strong> on every use, so a captured refresh token has
          a short useful life. Access-token JWTs are signed with HS256 and pin
          their type, so a token minted for one purpose (for example the
          mid-login 2FA step) can never be replayed as a full session token.
        </DocP>
        <DocNote type="security" title="Log out everywhere, instantly">
          Each JWT carries a <strong>token version</strong>. Bumping your token
          version invalidates every outstanding access token at once and clears
          your refresh tokens — an instant &ldquo;sign out of all
          sessions&rdquo;. A password reset does exactly this for you.
        </DocNote>
      </DocSection>

      <DocSection id="totp" title="Two-factor (TOTP)">
        <DocP>
          For a second layer on sign-in, enable time-based one-time-password
          (TOTP) two-factor authentication. It works with any standard
          authenticator app — Google Authenticator, 1Password, Aegis, Authy, and
          others — using the usual 6-digit, 30-second codes.
        </DocP>
        <DocList
          ordered
          items={[
            "Start setup in your account settings. zcrypt generates a secret and an otpauth:// URI you scan as a QR code (or enter by hand).",
            "Enter a current 6-digit code from your authenticator to confirm the secret synced correctly. Only then is 2FA switched on.",
            "From then on, signing in asks for a code. Your password is checked first; only on success does the server hand back a short-lived temporary token to complete the 2FA step.",
          ]}
        />
        <DocP>
          To turn 2FA off, you must confirm <strong>both</strong> your current
          password and a valid code — so a stranger who briefly has your unlocked
          session still can&apos;t strip the second factor. Code validation
          allows a one-step time window on either side to tolerate minor clock
          drift between your phone and the server.
        </DocP>
        <DocNote type="info">
          TOTP guards the <em>front door</em> to your account. It is independent
          of your vault passphrase: even with a valid code, your files remain
          encrypted until you unlock the vault on your device.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/oauth" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Sign in with Google or GitHub — OAuth login, linking, and desktop sign-in
            </Link>,
            <Link key="b" href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Account recovery — what is and isn&apos;t recoverable, and why
            </Link>,
            <Link key="c" href="/docs/key-management" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Key management — how your passphrase derives your encryption keys
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
