import type { Metadata } from "next";
import Link from "next/link";

import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { Underlined } from "@/components/marketing/landing/pencil-underline";
import { CrossingPanel } from "@/components/marketing/preview/crossing-panel";
import { EightyPercent } from "@/components/marketing/preview/eighty-percent";
import { LiveCipher } from "@/components/marketing/preview/live-cipher";
import { StickyStart } from "@/components/marketing/preview/sticky-start";
import { ArrowRight, Check, Lock } from "@/lib/icons";

export const metadata: Metadata = {
  title: "zcrypt preview",
  description:
    "Free cloud storage that cannot read your files. Everything is locked on your device before it uploads.",
  robots: { index: false, follow: false },
};

/**
 * Landing page rebuild, parked at /preview so it can be compared against the
 * live / before anything is replaced.
 *
 * Concept: The Price Tag. The page is one person's account of a bad week with
 * cloud storage, and every claim arrives as the fix to a specific thing that
 * went wrong to him, in the order it went wrong. The origin story was already
 * the best copy in the codebase; it was just buried on /about, the last nav
 * item.
 *
 * Rules this page holds itself to: under 900 visible words against the live
 * page's 1,593, a price above the fold, the product on screen in the first
 * viewport, and no sentence a non-coder has to decode. Acronyms appear once,
 * late, as a footnote to a claim already made in plain words.
 */

const TRUST = ["Free forever", "No card", "Nothing to install", "Open source"];

const BEATS = [
  {
    n: "01",
    title: "I ran out of room",
    body: "Google Drive tapped me on the shoulder at 15 GB and asked for my card. So I made a second account. Then a third. For a week I was splitting one folder across three logins like a low-budget digital smuggler.",
  },
  {
    n: "02",
    title: "The free terabyte had a catch",
    body: "TeraBox said one terabyte, free. What they did not say: the download button is hidden like a state secret, and the fine print treats your files as theirs to scan and learn from.",
  },
  {
    n: "03",
    title: "Then it failed at 80 percent",
    body: "I uploaded a 4 GB folder, watched it crawl to 80 percent, and watched it fail. My first thought was not let me retry. It was why am I handing my life to a company whose business is knowing what is inside it.",
  },
  {
    n: "04",
    title: "Free storage was never free",
    body: "I just had not read the price tag, because the price tag was me. Privacy is not a feature these companies forgot to add. It is the thing they quietly sell against.",
  },
];

const CATCH = [
  "If you forget your passphrase, your files are gone. Not recoverable by us, because we never had the key.",
  "Shared storage is capped at 1 GB. Connect an account you already own and it is unlimited.",
  "There is a team. It is Wasif. Things get fixed at the speed one human manages.",
  "It is young. You should keep a copy of anything you cannot lose, here or anywhere else.",
];

export default function PreviewPage() {
  return (
    <>
      {/* 1. Hero. Price, product and person all in the first screen, because the
             live hero has none of the three. */}
      <section className="relative overflow-hidden px-6 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)]/40"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-[var(--color-on-accent)]">
                W
              </span>
              Wasif, Karachi. Built this after losing a 4 GB upload at 80 percent.
            </Link>

            <h1 className="font-heading mt-6 text-[2.5rem] font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Free cloud storage that{" "}
              <Underlined variant="ink" delay={0.4}>
                cannot read your files
              </Underlined>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
              Not &ldquo;we promise not to look.&rdquo; I built it so I can&apos;t. Everything is
              locked on your device before it uploads. Start in one click: no card, no setup, no
              storage account to plug in.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-7 py-3.5 text-base font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
              >
                Start free, no card
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#the-line"
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] px-6 py-3.5 text-base font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/50"
              >
                Watch it encrypt
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-text-muted)]">
              {TRUST.map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <CrossingPanel />
          </div>
        </div>
      </section>

      {/* 2. Why this exists. */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              Why this exists
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              I built this because I lost a 4 GB upload.
            </h2>
          </ScrollReveal>

          <div className="mt-12 space-y-10">
            {BEATS.map((b) => (
              <ScrollReveal key={b.n}>
                <div className="flex gap-5">
                  <span className="font-mono text-sm text-[var(--color-accent)]">{b.n}</span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--color-text)]">{b.title}</h3>
                    <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">
                      {b.body}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* 3. The signature moment, landing exactly where beat 03 leaves off. */}
          <ScrollReveal>
            <div className="mt-14">
              <EightyPercent />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 4. There is nothing to plug in. The zero-setup story, which the live
             page never tells, aimed at the people who sign up and stop. */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface-1)] px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              The part nobody believes
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              There is nothing to plug in.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-text-secondary)]">
              Most private-storage tools open with a setup wizard and a list of accounts to connect.
              Sign up here and you can drop a file in the next thirty seconds. The storage is
              already there.
            </p>
          </ScrollReveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <ScrollReveal>
              <div className="h-full rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-6">
                <p className="text-sm font-semibold text-[var(--color-accent)]">Default</p>
                <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
                  Use our shared storage. Nothing to create, nothing to paste. Capped at 1 GB, which
                  is enough to find out whether you like this.
                </p>
                <p className="mt-6 font-mono text-[12px] text-[var(--color-text-muted)]">
                  setup: 0 steps
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="h-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                <p className="text-sm font-semibold text-[var(--color-text)]">Whenever you want</p>
                <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
                  Link an account you already have, GitHub, GitLab, Hugging Face or Telegram, and
                  your storage becomes unlimited, because it is yours.
                </p>
                <p className="mt-6 font-mono text-[12px] text-[var(--color-text-muted)]">
                  setup: one token, about two minutes
                </p>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal>
            <p className="mt-6 text-center text-[var(--color-text-secondary)]">
              Either way the encryption is identical.{" "}
              <span className="text-[var(--color-text-muted)]">
                Six of our last eight uploaders never connected anything.
              </span>
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 5. Prove the headline, with real crypto rather than a mock. */}
      <section id="the-line" className="scroll-mt-20 px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--color-accent)]" />
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
                The line
              </p>
            </div>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              There is a line your files cross. I am stuck on the wrong side of it.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-text-secondary)]">
              Your file is locked before it leaves your device, so what reaches us is the part on
              the right. Try it. Nothing below is a mock-up.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-10">
              <LiveCipher />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 6. The price, said out loud. The live page never states it. */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface-1)] px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <ScrollReveal>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
              <s>per month</s>
              <s>per gigabyte</s>
              <s>per extra person</s>
            </div>
            <p className="font-heading mt-4 text-6xl font-bold tracking-tight text-[var(--color-text)]">
              $0
            </p>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              There is no paid tier to upsell you to. When you connect your own storage you are
              spending your own free quota, not renting ours, which is the only reason this can be
              free without a catch.
            </p>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
              Forever is a big word, so: if that ever changes, your files are already in accounts
              you control and they come out the way they went in.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 7. The catch, stated before anyone finds it themselves. */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              The catch
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Everything above is the pitch. This is the rest of it.
            </p>
          </ScrollReveal>
          <ul className="mt-8 space-y-4 border-l-2 border-amber-500/50 pl-6">
            {CATCH.map((c) => (
              <ScrollReveal key={c}>
                <li className="leading-relaxed text-[var(--color-text-secondary)]">{c}</li>
              </ScrollReveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. Close. */}
      <section className="border-t border-[var(--color-border)] px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Somewhere to put your files. Free, and unreadable.
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              No card, now or ever. If it turns out you hate it, your files come back out the same
              way they went in.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-7 py-3.5 text-base font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
              >
                Start free, no card
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] px-6 py-3.5 text-base font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/50"
              >
                Look around first, no signup
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <StickyStart />
    </>
  );
}
