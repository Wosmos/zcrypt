"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { Infinity as InfinityIcon, Layers, Code } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./scroll-reveal";

// ─── Content (ported verbatim from the landing.html #why "stack" section) ──
type Card = {
  num: string;
  label: string;
  heading: string;
  body: string;
} & (
  | { visual: "terminal" }
  | { visual: "icon"; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; accent: keyof typeof accentTile }
);

const accentTile = {
  cyan: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20",
  blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
} as const;

const cards: Card[] = [
  {
    num: "01",
    label: "ENCRYPTION",
    heading: "Encrypted before it ever leaves your device",
    body: "Keys derive from your passphrase client-side and are never transmitted. AES-256-GCM detects tampering, not just blocks it. There's no key on our side — we literally cannot decrypt your data.",
    visual: "terminal",
  },
  {
    num: "02",
    label: "SCALE",
    heading: "Effectively unlimited storage",
    body: "Files split into ~10 MB chunks and upload in parallel. zcrypt watches repo sizes and auto-provisions a fresh repository before any platform limit — you're bounded only by the free space you already own.",
    visual: "icon",
    Icon: InfinityIcon,
    accent: "violet",
  },
  {
    num: "03",
    label: "STEALTH",
    heading: "Nothing flags your vault",
    body: "Chunks commit with plausible filenames, randomized messages, and ordinary repository names. Your storage repos blend in as unremarkable projects — by design.",
    visual: "icon",
    Icon: Layers,
    accent: "blue",
  },
  {
    num: "04",
    label: "OPEN",
    heading: "Open source & self-hostable",
    body: "Audit the encryption yourself, or run the entire backend on your own infrastructure. Bring-your-own-backend is available to everyone. Your trust is never assumed — it's earned by code you can read.",
    visual: "icon",
    Icon: Code,
    accent: "cyan",
  },
];

// ─── Desktop gate (sticky pile-up + scrub recede are desktop-only) ─────────
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// Sticky offset below the fixed nav, stepped per card so a lip of each buried
// card peeks out at the top of the pile.
const stickyTop = (index: number) => 88 + index * 14;

const cardClass = cn(
  "relative origin-top overflow-hidden rounded-[28px] border border-[var(--color-border)]",
  "bg-gradient-to-b from-[var(--color-surface-1)] to-[var(--color-surface)] p-8 sm:p-10 lg:p-12",
  "shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_30px_80px_-32px_rgba(0,0,0,0.85)]"
);

function CardBody({ card }: { card: Card }) {
  // odd cards (01, 03) glow top-right; even cards (02, 04) glow top-left
  const glowPos = Number(card.num) % 2 === 1 ? "85% 10%" : "15% 10%";
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(50% 60% at ${glowPos}, rgba(0,213,228,0.06), transparent 70%)`,
        }}
      />
      <div className="relative z-[1] grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Copy */}
        <div className="min-w-0">
          <span className="font-mono text-xs tracking-[0.1em] text-cyan-600 dark:text-cyan-400">
            {card.num} / {card.label}
          </span>
          <h3 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
            {card.heading}
          </h3>
          <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
            {card.body}
          </p>
        </div>

        {/* Visual */}
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]">
          {card.visual === "terminal" ? (
            <div className="flex h-full w-full flex-col text-left font-mono text-[0.78rem]">
              <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="space-y-1.5 p-4 leading-relaxed">
                <div>
                  <span className="text-cyan-500">$</span>{" "}
                  <span className="text-[var(--color-text)]">zcrypt push research.tar</span>
                </div>
                <div className="text-[var(--color-text-muted)]"># compress → encrypt → chunk</div>
                <div>
                  <span className="text-emerald-500">✓</span>{" "}
                  <span className="text-[var(--color-text)]">sealed 3 chunks</span>
                </div>
                <div>
                  <span className="text-emerald-500">✓</span>{" "}
                  <span className="text-[var(--color-text)]">key never left device</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "grid h-[72px] w-[72px] place-items-center rounded-[18px] border",
                accentTile[card.accent]
              )}
            >
              <card.Icon className="h-8 w-8" strokeWidth={1.8} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Animated card: recedes (scale 1→0.93, lift 16px) as the NEXT card slides up
// to cover it — scrubbed to scroll position. Disabled when not active.
function StackCard({
  card,
  index,
  selfRef,
  nextRef,
  active,
}: {
  card: Card;
  index: number;
  selfRef: RefObject<HTMLDivElement | null>;
  nextRef: RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const { scrollYProgress } = useScroll({
    target: nextRef,
    offset: ["start 0.95", "start 0.18"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.93]);
  const y = useTransform(scrollYProgress, [0, 1], [0, -16]);

  return (
    <div ref={selfRef} className="md:sticky" style={{ top: stickyTop(index), zIndex: index + 1 }}>
      <motion.article className={cardClass} style={active ? { scale, y } : undefined}>
        <CardBody card={card} />
      </motion.article>
    </div>
  );
}

export function BuiltToTrust() {
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();
  const active = isDesktop && !reduce;

  // Fixed refs (exactly 4 cards) — each animated card tracks the next card's
  // wrapper to drive its recede. The last card never recedes.
  const r0 = useRef<HTMLDivElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const r3 = useRef<HTMLDivElement>(null);
  const refs = [r0, r1, r2, r3];

  return (
    <section className="px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <ScrollReveal className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Why zcrypt
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Built so you never have to trust us.
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            Every layer engineered for privacy — and every line of it open source.
          </p>
        </ScrollReveal>

        {/* Stacking cards */}
        <div className="space-y-8 lg:space-y-10">
          {cards.map((card, i) => (
            <StackCard
              key={card.num}
              card={card}
              index={i}
              selfRef={refs[i]}
              nextRef={refs[Math.min(i + 1, refs.length - 1)]}
              active={active && i < cards.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
