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
  title: "Anonymous Send | zcrypt Docs",
  description:
    "Send an encrypted file with no account using zcrypt's Anonymous Send: up to about 50 MB, an expiry of 1 to 24 hours, and optional burn-after-read. Files are stored encrypted under a disguised name.",
  alternates: { canonical: "https://zcrypt.cloud/docs/send" },
  openGraph: {
    title: "Anonymous Send | zcrypt Docs",
    description:
      "Send an encrypted file without an account — short-lived, optionally one-time, and encrypted in your browser before upload.",
    url: "https://zcrypt.cloud/docs/send",
  },
};

const toc = [
  { id: "what", title: "What Send is for" },
  { id: "how", title: "How it works" },
  { id: "limits", title: "Limits and expiry" },
  { id: "burn", title: "Burn after read" },
  { id: "privacy", title: "Privacy and what we log" },
  { id: "next", title: "Where to go next" },
];

export default function SendDocPage() {
  return (
    <DocPage
      href="/docs/send"
      title="Anonymous Send"
      description="Drop someone an encrypted file without signing up for anything. Send encrypts in your browser, stores the result under a disguised name for a short window, and can wipe it the moment it's read."
      toc={toc}
    >
      <DocSection id="what" title="What Send is for">
        <DocP>
          Anonymous Send is the fastest way to hand off a single file when you
          don&rsquo;t have — or don&rsquo;t want to use — an account. It&rsquo;s
          built for one-off transfers: a document to a journalist, a build to a
          tester, a photo to a friend. You get a link to share; the recipient
          needs no account either.
        </DocP>
      </DocSection>

      <DocSection id="how" title="How it works">
        <DocP>
          The file is encrypted on your device before it leaves your browser.
          zcrypt then splits the ciphertext into chunks and uploads them under a{" "}
          <strong>disguised name</strong> so the stored object reveals nothing
          about the original file. You receive a token-based link to pass on;
          the recipient&rsquo;s browser downloads the chunks, verifies them, and
          decrypts locally.
        </DocP>
        <DocList
          items={[
            <>The server stores only ciphertext — it cannot read the file.</>,
            <>
              The stored chunks carry disguised filenames, not your
              original&rsquo;s.
            </>,
            <>No account, sign-in, or email is required to send or receive.</>,
          ]}
        />
      </DocSection>

      <DocSection id="limits" title="Limits and expiry">
        <DocList
          items={[
            <>
              <strong>Size:</strong> up to about <strong>50 MB</strong> per send.
              Larger files belong in your vault, where you can use a share link
              instead.
            </>,
            <>
              <strong>Expiry:</strong> choose a lifetime between{" "}
              <strong>1 and 24 hours</strong>. When it lapses, the link reports
              that it has expired and the data is no longer retrievable.
            </>,
          ]}
        />
        <DocNote type="info" title="Need something bigger or longer-lived?">
          Sign in and upload the file to your vault, then create a{" "}
          <Link href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
            share link
          </Link>{" "}
          — those support larger files and longer expiries.
        </DocNote>
      </DocSection>

      <DocSection id="burn" title="Burn after read">
        <DocP>
          Turn on <strong>burn after read</strong> to make the send a one-time
          link. After the first successful access it is treated as already
          consumed, so a second visitor — or anyone who later finds the link —
          sees only that it has been used.
        </DocP>
      </DocSection>

      <DocSection id="privacy" title="Privacy and what we log">
        <DocNote type="security" title="What's private — and what isn't">
          The file&rsquo;s contents stay private: encryption happens in your
          browser and the server only ever holds ciphertext under a disguised
          name. For abuse prevention, the <strong>sender&rsquo;s IP address is
          recorded</strong> with the transfer. If that matters to your threat
          model, send from a network you&rsquo;re comfortable being associated
          with.
        </DocNote>
      </DocSection>

      <DocSection id="next" title="Where to go next">
        <DocList
          items={[
            <Link key="a" href="/docs/pad" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Encrypted Pad — for sharing text and notes instead of files
            </Link>,
            <Link key="b" href="/docs/sharing" className="text-cyan-600 hover:underline dark:text-cyan-400">
              Share links — account-backed sharing with passwords and limits
            </Link>,
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
