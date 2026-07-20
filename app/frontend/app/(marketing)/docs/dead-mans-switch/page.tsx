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
  title: "Dead man's switch | zcrypt Docs",
  description:
    "Configure zcrypt to email a trusted contact if you stop checking in. Set a timeout of 7 to 365 days; every login resets the timer. It sends a notification email — it does not deliver your files or keys.",
  alternates: { canonical: "https://zcrypt.cloud/docs/dead-mans-switch" },
  openGraph: {
    title: "Dead man's switch | zcrypt Docs",
    description:
      "Notify a trusted contact if you stop checking in. It sends an email — zero-knowledge means there are no keys for it to hand over.",
    url: "https://zcrypt.cloud/docs/dead-mans-switch",
  },
};

const toc = [
  { id: "what", title: "What it does" },
  { id: "setup", title: "Setting it up" },
  { id: "checkin", title: "Checking in" },
  { id: "honest", title: "What it does — and doesn't — do" },
  { id: "next", title: "Where to go next" },
];

export default function DeadMansSwitchDocPage() {
  return (
    <DocPage
      href="/docs/dead-mans-switch"
      title="Dead man's switch"
      description="A safeguard that watches for your absence. If you stop checking in for a period you choose, zcrypt sends a message to a contact you trust — a way to make sure someone is alerted if something happens to you."
      toc={toc}
    >
      <DocSection id="what" title="What it does">
        <DocP>
          A dead man&rsquo;s switch fires when you <em>stop</em> doing something.
          Here, that something is signing in. You nominate a trusted contact and
          a timeout; if you don&rsquo;t check in before the timeout elapses,
          zcrypt sends that contact an email.
        </DocP>
      </DocSection>

      <DocSection id="setup" title="Setting it up">
        <DocP>From settings, configure the switch with:</DocP>
        <DocList
          items={[
            <>
              <strong>Contact email</strong> — who gets notified. A contact name
              is optional.
            </>,
            <>
              <strong>Timeout</strong> — anywhere from <strong>7 to 365 days</strong>{" "}
              of inactivity before it fires.
            </>,
            <>
              <strong>A message</strong> — optional text included in the email to
              your contact.
            </>,
          ]}
        />
        <DocP>You can enable, disable, or delete the switch at any time.</DocP>
      </DocSection>

      <DocSection id="checkin" title="Checking in">
        <DocP>
          <strong>Every login counts as a check-in and resets the timer.</strong>{" "}
          As long as you keep signing in within your chosen window, the switch
          never fires. So the practical rule is simple: log in at least once per
          timeout period to stay silent.
        </DocP>
      </DocSection>

      <DocSection id="honest" title="What it does — and doesn't — do">
        <DocNote type="warning" title="Read this before you rely on it">
          <p className="mb-2">
            The dead man&rsquo;s switch sends a <strong>notification email</strong>{" "}
            to your contact. That is all it does.
          </p>
          <p className="mb-2">
            It does <strong>not</strong> deliver your files, and it does{" "}
            <strong>not</strong> hand over any keys — because zcrypt is
            zero-knowledge, there are no keys on our side to give anyone. We
            cannot decrypt your vault, so the switch cannot pass your data to
            your contact.
          </p>
          <p>
            There is an &ldquo;include files&rdquo; option, but it only changes
            the <strong>wording of the email</strong> — it does not attach,
            transfer, list, or unlock anything. If you want a contact to be able
            to reach your actual files, you must arrange that yourself (for
            example, by sharing a passphrase through your own trusted channel).
          </p>
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/decoy-profile" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Decoy profile — a second password that opens a fake vault
            </Link>,
            <Link key="b" href="/docs/recovery" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Account recovery — what is and isn&rsquo;t recoverable, and why
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
