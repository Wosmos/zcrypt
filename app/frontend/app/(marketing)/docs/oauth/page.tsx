import type { Metadata } from "next";
import Link from "next/link";
import {
  DocPage,
  DocSection,
  DocP,
  DocList,
  DocNote,
} from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Sign in with Google or GitHub | zcrypt Docs",
  description:
    "Use Google or GitHub to sign in to zcrypt: how OAuth sign-up and login work, linking and unlinking providers in settings, and signing in from the desktop app via your system browser.",
  alternates: { canonical: "https://zcrypt.cloud/docs/oauth" },
  openGraph: {
    title: "Sign in with Google or GitHub | zcrypt Docs",
    description:
      "OAuth sign-in and sign-up with Google and GitHub, linking and unlinking providers, and the desktop sign-in flow — and why this is not the same as connecting GitHub as storage.",
    url: "https://zcrypt.cloud/docs/oauth",
  },
};

const toc = [
  { id: "not-storage", title: "Sign-in is not storage" },
  { id: "sign-in", title: "Signing in with a provider" },
  { id: "linking", title: "Linking & unlinking" },
  { id: "desktop", title: "Desktop sign-in" },
  { id: "next", title: "Where to go next" },
];

export default function OAuthDocPage() {
  return (
    <DocPage
      href="/docs/oauth"
      title="Sign in with Google or GitHub"
      description="Skip the password and authenticate to zcrypt with an identity you already have. OAuth covers signing in only — your files stay protected by your vault passphrase exactly as they would otherwise."
      toc={toc}
    >
      <DocNote type="warning" title="Sign-in with GitHub ≠ GitHub as storage">
        <p className="mb-2">
          These are two unrelated things that both mention GitHub:
        </p>
        <p className="mb-2">
          <strong>Signing in with GitHub</strong> (this page) uses GitHub as an
          identity provider to log you into your zcrypt account. It grants zcrypt
          nothing beyond your basic profile and email.
        </p>
        <p>
          <strong>Connecting GitHub as storage</strong> is a separate step where
          you add a personal access token in settings so zcrypt can store your
          encrypted file chunks in a repository. That is covered in{" "}
          <Link
            href="/docs/connect-storage"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Connect your storage
          </Link>
          . You can do either, both, or neither.
        </p>
      </DocNote>

      <DocSection id="not-storage" title="Sign-in is not storage">
        <DocP>
          OAuth sign-in answers one question: <em>who are you?</em> Where your
          encrypted data lives is a completely separate decision. You could sign
          in with Google and store chunks on GitHub, sign in with GitHub and
          store on HuggingFace, or sign in with a password and store anywhere —
          the two choices never constrain each other.
        </DocP>
      </DocSection>

      <DocSection id="sign-in" title="Signing in with a provider">
        <DocP>
          Choose <strong>Continue with Google</strong> or{" "}
          <strong>Continue with GitHub</strong> on the login page. zcrypt
          redirects you to the provider, you approve, and the provider sends you
          back. From there one of three things happens:
        </DocP>
        <DocList
          items={[
            <>
              <strong>Already linked</strong> — if that provider account is tied
              to an existing zcrypt user, you&apos;re signed straight in.
            </>,
            <>
              <strong>Matching email</strong> — if a zcrypt account already uses
              the provider&apos;s email <em>and that email is verified</em>, the
              provider is auto-linked to it and you&apos;re signed in.
            </>,
            <>
              <strong>New to zcrypt</strong> — otherwise a fresh account is
              created with a username derived from your name or email, and a
              verified email. OAuth-only accounts have no password until you add
              one.
            </>,
          ]}
        />
        <DocNote type="security" title="Why the verified-email rule matters">
          If a zcrypt account exists for an email that was never verified, zcrypt
          refuses to auto-link a provider to it and asks you to log in with your
          existing method first, then link in settings. This stops someone who
          controls a Google/GitHub account for an unverified address from
          quietly taking over the matching local account. Tokens are also
          returned to the browser in the URL <em>fragment</em>, so they never
          land in server logs or referrer headers.
        </DocNote>
      </DocSection>

      <DocSection id="linking" title="Linking & unlinking">
        <DocP>
          From your account settings you can see which providers are connected
          and link additional ones. Linking lets you sign in to the same zcrypt
          account through more than one identity — handy if you sometimes have
          Google handy and sometimes GitHub.
        </DocP>
        <DocP>
          You can unlink a provider just as easily, with one guardrail: zcrypt
          will not let you remove your <strong>last remaining sign-in method</strong>.
          If a provider is the only way into your account, add a password or link
          a second provider before unlinking it — otherwise you&apos;d lock
          yourself out.
        </DocP>
        <DocNote type="info">
          Unlinking a provider only removes it as a way to sign in. It does not
          delete your zcrypt account, your files, or any storage backend you
          connected.
        </DocNote>
      </DocSection>

      <DocSection id="desktop" title="Desktop sign-in">
        <DocP>
          The desktop app signs you in through your normal{" "}
          <strong>system browser</strong> rather than an embedded webview, so you
          authenticate in a trusted, full-featured browser you already use. The
          flow:
        </DocP>
        <DocList
          ordered
          items={[
            "The app starts an OAuth sign-in with a high-entropy, single-use session identifier and opens the provider in your default browser.",
            "You approve in the browser and land on a short confirmation page.",
            "The app polls a one-time endpoint for that session, receives your tokens once, and the server immediately discards them.",
          ]}
        />
        <DocP>
          The session identifier must carry real entropy and each result is
          handed out exactly once, then expires quickly — so the hand-off
          can&apos;t be guessed or replayed to capture your tokens. See{" "}
          <Link
            href="/docs/desktop-app"
            className="text-cyan-600 hover:underline dark:text-cyan-400"
          >
            the desktop app
          </Link>{" "}
          for the rest of the native experience.
        </DocP>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/connect-storage" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Connect your storage — add GitHub, GitLab, Hugging Face, or Telegram as a backend
            </Link>,
            <Link key="b" href="/docs/authentication" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Authentication & 2FA — passwords, sessions, and two-factor
            </Link>,
            <Link key="c" href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Account recovery — what is and isn&apos;t recoverable
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
