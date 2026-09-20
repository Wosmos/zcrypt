import type { Metadata } from "next";
import Link from "next/link";

import "@/components/marketing/preview/vault.css";
import { VaultDoor } from "@/components/marketing/preview/vault-door";
import { DepthField } from "@/components/marketing/preview/depth-field";
import { PipelineScene } from "@/components/marketing/preview/pipeline-scene";
import { EightyPercent } from "@/components/marketing/preview/eighty-percent";
import { LiveCipher } from "@/components/marketing/preview/live-cipher";
import { StickyStart } from "@/components/marketing/preview/sticky-start";
import { TiltCard } from "@/components/marketing/preview/tilt-card";
import { DecodeText } from "@/components/marketing/preview/decode-text";
import { StrikeList } from "@/components/marketing/preview/strike-list";
import { FeatureIcons } from "@/components/marketing/preview/feature-icons";
import { MacOSShowcase } from "@/components/marketing/macos-showcase";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { ArrowRight, Lock } from "@/lib/icons";

export const metadata: Metadata = {
  title: "zcrypt preview",
  description:
    "Free cloud storage that cannot read your files. Everything is locked on your device before it uploads.",
  robots: { index: false, follow: false },
};

/**
 * The Vault. Landing prototype v2, parked at /preview beside the live /.
 *
 * zcrypt is about a boundary: readable on your device, unreadable everywhere
 * else. That is spatial, so the page has depth. You open a vault by scrolling,
 * files are objects with mass, cyan is light leaking from seams, and headlines
 * arrive as ciphertext and decode. One motif (the seam, the lock) recurs.
 *
 * Copy and story are The Price Tag, unchanged. This is a re-art-direction of
 * an approved concept, not a rewrite. Under 900 words, no acronym before the
 * claim it explains, and every sequence has a reduced-motion final frame.
 */

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
  "It is young. Keep a copy of anything you cannot lose, here or anywhere else.",
];

function Eyebrow({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}

export default function PreviewPage() {
  return (
    <div className="vault">
      {/* 1. The door. Pinned; opens on scroll. */}
      <VaultDoor />

      {/* 2. Inside: files with mass. */}
      <section className="relative overflow-hidden px-6 pb-8 pt-4">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <Eyebrow>Inside</Eyebrow>
            <h2 className="font-heading mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">The things people actually keep here.</DecodeText>
            </h2>
            <p className="mt-4 max-w-xl text-[var(--color-text-secondary)]">
              Not code. Passports, tax returns, the wedding photos.
            </p>
          </ScrollReveal>
          <DepthField />
        </div>
      </section>

      {/* 3. Why this exists. */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <Eyebrow>Why this exists</Eyebrow>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">I built this because I lost a 4 GB upload.</DecodeText>
            </h2>
          </ScrollReveal>

          <div className="mt-14 space-y-10">
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

          {/* 4. The 80% bar, where the story lands on it. */}
          <ScrollReveal>
            <div className="mt-16">
              <EightyPercent />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 5. The pipeline. Pinned; the visitor drives it. */}
      <PipelineScene />

      {/* 5b. The drive itself. The audit's one consistent finding about the
             live page was that the product was never on screen; the showcase
             already existed and was buried below twelve thousand pixels. */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <Eyebrow>The actual thing</Eyebrow>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">It is a normal drive. That is the hard part.</DecodeText>
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-text-secondary)]">
              Folders, previews, search. Decrypted on your screen and nowhere else.
            </p>
          </ScrollReveal>
          <div className="mt-12">
            <MacOSShowcase />
          </div>
        </div>
      </section>

      {/* 5c. What it does, as icons that do it. */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal>
            <Eyebrow>Six things, no jargon</Eyebrow>
            <h2 className="font-heading mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">Everything it does, in one screen.</DecodeText>
            </h2>
          </ScrollReveal>
          <div className="mt-12">
            <FeatureIcons />
          </div>
        </div>
      </section>

      {/* 6. Nothing to plug in. */}
      <section className="relative px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <Eyebrow>The part nobody believes</Eyebrow>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">There is nothing to plug in.</DecodeText>
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-text-secondary)]">
              Sign up and drop a file in the next thirty seconds. The storage is already there.
            </p>
          </ScrollReveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <TiltCard depth={40} className="p-6">
              <p className="text-sm font-semibold text-[var(--color-accent)]">Default</p>
              <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
                Use our shared storage. Nothing to create, nothing to paste. Capped at 1 GB, which
                is enough to find out whether you like this.
              </p>
              <p className="mt-6 font-mono text-[12px] text-[var(--color-text-muted)]">
                setup: 0 steps
              </p>
            </TiltCard>
            <TiltCard depth={-30} className="p-6">
              <p className="text-sm font-semibold text-[var(--color-text)]">Whenever you want</p>
              <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
                Link an account you already have, GitHub, GitLab, Hugging Face or Telegram, and your
                storage becomes unlimited, because it is yours.
              </p>
              <p className="mt-6 font-mono text-[12px] text-[var(--color-text-muted)]">
                setup: one token, about two minutes
              </p>
            </TiltCard>
          </div>

          <ScrollReveal>
            <p className="mt-8 text-center text-[var(--color-text-secondary)]">
              Either way the encryption is identical.{" "}
              <span className="text-[var(--color-text-muted)]">
                Six of our last eight uploaders never connected anything.
              </span>
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 7. The line. Real crypto. */}
      <section id="the-line" className="relative scroll-mt-20 px-6 py-24">
        <div className="vault-seam-h absolute left-1/2 top-0 h-px w-[60%] -translate-x-1/2 opacity-60" />
        <div className="mx-auto max-w-4xl">
          <ScrollReveal>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--color-accent)]" />
              <Eyebrow>The line</Eyebrow>
            </div>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">There is a line your files cross.</DecodeText>
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-[var(--color-text-secondary)]">
              I am stuck on the wrong side of it. What reaches us is the part on the right. Try it.
              Nothing below is a mock-up.
            </p>
          </ScrollReveal>
          <div className="mt-12">
            <TiltCard depth={20} max={3} className="overflow-hidden p-0">
              <LiveCipher />
            </TiltCard>
          </div>
        </div>
      </section>

      {/* 8. The price. */}
      <section className="relative overflow-hidden px-6 py-28 text-center">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <StrikeList items={["per month", "per gigabyte", "per extra person"]} />
            <p className="vault-numeral font-heading mt-6 font-bold">$0</p>
            <p className="mt-6 leading-relaxed text-[var(--color-text-secondary)]">
              No paid tier to upsell you to. Your own storage is your own free quota, not ours,
              which is the only reason this can be free without a catch.
            </p>
            <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
              Forever is a big word, so: if that ever changes, your files are already in accounts
              you control.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* 9. The catch. */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">The catch.</DecodeText>
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Everything above is the pitch. This is the rest of it.
            </p>
          </ScrollReveal>
          <ul className="mt-10 space-y-5 border-l-2 border-amber-500/60 pl-6 [box-shadow:-8px_0_24px_-12px_rgba(245,158,11,0.5)]">
            {CATCH.map((c) => (
              <li key={c} className="leading-relaxed text-[var(--color-text-secondary)]">
                <ScrollReveal>{c}</ScrollReveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 10. Close. */}
      <section className="relative overflow-hidden px-6 py-32">
        <div className="vault-seam absolute inset-y-0 left-1/2 w-px -translate-x-1/2 opacity-40" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div className="vault-lock mx-auto">
            <Lock className="h-3.5 w-3.5" />
          </div>
          <ScrollReveal>
            <h2 className="font-heading mt-8 text-3xl font-bold tracking-tight sm:text-5xl">
              <DecodeText as="span">Somewhere to put your files. Free, and unreadable.</DecodeText>
            </h2>
            <p className="mt-5 leading-relaxed text-[var(--color-text-secondary)]">
              No card, now or ever. If it turns out you hate it, your files come back out the same
              way they went in.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-7 py-3.5 text-base font-semibold text-[var(--color-on-accent)] shadow-[0_0_40px_-10px_var(--color-accent)] transition-opacity hover:opacity-90"
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
    </div>
  );
}
