import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHead } from "../section-head";

const FAQS: readonly { q: string; a: ReactNode; flag?: string }[] = [
  {
    q: "Is it really free?",
    a: "Yes. There are no paid plans and no card. Your files live in accounts you already own, so there's nothing for us to charge for.",
  },
  {
    q: "How can there be no limit?",
    a: "zcrypt doesn't keep your files. Your connected accounts do. Every account you add is more room, and Telegram has no ceiling at all. New accounts start with 1 GB of shared space while you set things up.",
  },
  {
    q: "Can you see my files?",
    a: "No. Files are locked on your own device before they're uploaded, and so are their names. We only know where the pieces went, never what's in them.",
  },
  {
    q: "What if I forget my password?",
    a: "Then nobody can open your files, including us. That's what real privacy costs, so keep it in a password manager.",
  },
  {
    q: "Do I need a GitHub or Telegram account?",
    a: "Not to start. You can upload right away. Connect an account whenever you want more room. Telegram is the easiest if you already use it.",
  },
  {
    q: "Can I share with someone who doesn't use zcrypt?",
    a: "Yes. Send them a link. You can add a password, an end date and a download limit, or use Send to make a file that disappears after one read.",
  },
  {
    q: "Does it work on iPhone?",
    a: "The website does, in Safari. There's no iPhone app yet. There are apps for Mac, Windows, Linux, Android (beta) and the terminal.",
  },
  {
    q: "What if a platform removes my files?",
    a: "Then the pieces stored there are gone from there. For anything you can't lose, keep a second copy somewhere else too. That's good advice for every cloud, this one included.",
  },
  {
    q: "What happens if zcrypt shuts down?",
    a: "Every line of zcrypt is public, so anyone can run it, including you. Once you connect your own accounts, your pieces sit there, not with us. Files in the 1 GB starter space live on a shared account, so if I ever wind it down, I'll say so well ahead of time and you can download everything.",
    flag: "shutdown",
  },
  {
    q: "Is it open source?",
    a: (
      <>
        Every line, under the MIT license. Read it, poke at it, or run the whole thing yourself with{" "}
        <code className="zs-code">docker build</code> and{" "}
        <code className="zs-code">docker run</code>.
      </>
    ),
  },
];

/** Ten plain questions, ten plain answers. */
export function Faq() {
  return (
    <section id="faq" className="pv2-sec zs-cv" aria-labelledby="h-faq">
      <div className="pv2-wrap zs-faq">
        <div className="zs-faq-l">
          <SectionHead
            id="h-faq"
            eyebrow="Questions"
            title="Straight answers"
            lede={
              <>
                If something&apos;s missing,{" "}
                <Link href="/docs" className="zs-link">
                  the docs
                </Link>{" "}
                have the long version.
              </>
            }
            align="left"
          />
        </div>
        <div className="zs-faq-r">
          {FAQS.map((f) => (
            <details key={f.q} className="zs-dt" data-owner-confirm={f.flag}>
              <summary className="zs-sum">
                <span>{f.q}</span>
                <span className="zs-pm" aria-hidden="true" />
              </summary>
              <div className="zs-ans">
                <p>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
