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
  title: "Decoy profile | zcrypt Docs",
  description:
    "Set a second decoy password in zcrypt that, at login, opens an innocent-looking vault of fake files instead of your real one — for coercion or border situations where you may be forced to unlock.",
  alternates: { canonical: "https://zcrypt.cloud/docs/decoy-profile" },
  openGraph: {
    title: "Decoy profile | zcrypt Docs",
    description:
      "A second password that opens a believable decoy vault of fake files — plausible deniability for high-pressure situations.",
    url: "https://zcrypt.cloud/docs/decoy-profile",
  },
};

const toc = [
  { id: "what", title: "What a decoy profile is" },
  { id: "setup", title: "Setting it up" },
  { id: "files", title: "Stocking the decoy" },
  { id: "login", title: "Logging in with the decoy" },
  { id: "caveats", title: "Honest limits" },
  { id: "next", title: "Where to go next" },
];

export default function DecoyProfileDocPage() {
  return (
    <DocPage
      href="/docs/decoy-profile"
      title="Decoy profile"
      description="A second password that opens a believable, innocent-looking vault instead of your real one. If you're ever pressured — at a border, in a search, under coercion — you can unlock something that looks complete without exposing what actually matters."
      toc={toc}
    >
      <DocSection id="what" title="What a decoy profile is">
        <DocP>
          Your account can hold two passwords. Your real one unlocks your real
          vault. A separate <strong>decoy password</strong> unlocks a{" "}
          <strong>decoy vault</strong> — a self-contained space populated with
          fake files you control. To anyone watching you log in, the decoy looks
          like an ordinary, fully populated account.
        </DocP>
        <DocP>
          This is sometimes called plausible deniability: when handing over{" "}
          <em>a</em> password is unavoidable, you can hand over one that opens
          something harmless.
        </DocP>
      </DocSection>

      <DocSection id="setup" title="Setting it up">
        <DocP>
          In settings, set a decoy password. A few rules keep it credible:
        </DocP>
        <DocList
          items={[
            <>It must be at least 6 characters.</>,
            <>
              It must <strong>differ from your real password</strong> — zcrypt
              rejects a match so the two vaults stay distinct.
            </>,
            <>
              You can enable or disable the decoy without deleting it, and remove
              it entirely whenever you like.
            </>,
          ]}
        />
      </DocSection>

      <DocSection id="files" title="Stocking the decoy">
        <DocP>
          A decoy is only convincing if it looks lived-in, so you add{" "}
          <strong>fake files</strong> to it — each with a name and a size. These
          are placeholders that populate the listing to make the decoy vault
          look like a real one at a glance; they exist to furnish the disguise,
          not to be opened and read like your real files. Aim for a believable
          spread of names and sizes — a single test file gives the game away.
        </DocP>
      </DocSection>

      <DocSection id="login" title="Logging in with the decoy">
        <DocP>
          At the normal login screen, entering the decoy password signs you into
          the decoy vault instead of your real one. There&rsquo;s no separate
          button or toggle that hints a second vault exists — the password you
          type decides which vault opens.
        </DocP>
      </DocSection>

      <DocSection id="caveats" title="Honest limits">
        <DocNote type="warning" title="Know what a decoy can and can't do">
          A decoy protects against someone who makes you reveal a password and
          glances at the result. It is not a defense against deep forensic
          analysis, traffic inspection, or an adversary who already knows zcrypt
          supports decoys and insists on more. Make the decoy genuinely
          believable, and remember that whether to use one at all — and what
          happens if you&rsquo;re caught doing so — is a judgment call for your
          specific situation and jurisdiction.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/dead-mans-switch" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Dead man&rsquo;s switch — alert a trusted contact if you stop checking in
            </Link>,
            <Link key="b" href="/docs/authentication" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Authentication &amp; 2FA — passwords, sessions, and two-factor
            </Link>,
            <Link key="c" href="/features/privacy" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Privacy tools — the feature tour
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
