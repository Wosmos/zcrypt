"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  gsap,
  ScrollTrigger,
  SplitText,
  useGSAP,
  MOTION_FULL,
  MOTION_REDUCE,
} from "../preview/gsap";
import { ArrowRight } from "@/lib/icons";
import { GlyphField } from "./glyph-field";
import { LiveExplorer, ExplorerCaption } from "./live-explorer";

/**
 * Screen one. Loud type, then the real product.
 *
 * The headline says the two things a visitor came for, in the order they
 * care about them: unlimited and free first, unreadable second. It is real
 * text in the DOM; SplitText only decorates it after paint. Words rise in
 * with their weight settling from 500 to 800, and as you scroll away the
 * line tightens and lifts so the explorer takes the frame.
 *
 * The explorer under it is the actual dashboard components with sample
 * files (see live-explorer.tsx). It enters from a shallow tilt and stays
 * tiltable under the cursor, but nothing animates inside it: the app looks
 * exactly like the app.
 */
export function HeroV2() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      mm.add(MOTION_FULL, () => {
        let split: SplitText | undefined;
        const ctx = gsap.context(() => {
          const h1 = q(".v2-h1")[0];
          split = SplitText.create(h1, { type: "words", wordsClass: "word", aria: "hidden" });
          split.words.forEach((w) => {
            const t = (w.textContent ?? "").toLowerCase();
            if (t.startsWith("unlimited") || t.startsWith("free")) w.classList.add("is-accent");
          });

          // Entrance.
          const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
          intro
            .from(split.words, {
              yPercent: 90,
              opacity: 0,
              fontVariationSettings: '"wght" 500',
              duration: 0.9,
              stagger: 0.06,
            })
            .from(
              q(".v2-hero-after > *"),
              { y: 18, opacity: 0, duration: 0.7, stagger: 0.08 },
              "-=0.5",
            )
            .from(
              q(".v2-frame-wrap"),
              { y: 80, opacity: 0, rotateX: 14, duration: 1.1, ease: "power3.out" },
              "-=0.6",
            );

          // Exit: the headline tightens and lifts as the explorer takes over.
          gsap.to(q(".v2-hero-copy"), {
            y: -60,
            opacity: 0.25,
            scale: 0.96,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top top", end: "60% top", scrub: 0.5 },
          });
          gsap.to(q(".v2-h1"), {
            letterSpacing: "-0.06em",
            ease: "none",
            scrollTrigger: { trigger: el, start: "top top", end: "60% top", scrub: 0.5 },
          });

          // Cursor tilt on the frame, shallow. Rotation only; nothing inside moves.
          const frame = q(".v2-frame")[0];
          if (frame && window.matchMedia("(pointer: fine)").matches) {
            const rx = gsap.quickTo(frame, "rotationX", { duration: 0.6, ease: "power3.out" });
            const ry = gsap.quickTo(frame, "rotationY", { duration: 0.6, ease: "power3.out" });
            const wrap = q(".v2-frame-persp")[0] as HTMLElement;
            const move = (e: PointerEvent) => {
              const r = wrap.getBoundingClientRect();
              const px = (e.clientX - r.left) / r.width - 0.5;
              const py = (e.clientY - r.top) / r.height - 0.5;
              ry(px * 6);
              rx(-py * 6);
            };
            const leave = () => {
              rx(0);
              ry(0);
            };
            wrap.addEventListener("pointermove", move);
            wrap.addEventListener("pointerleave", leave);
            return () => {
              wrap.removeEventListener("pointermove", move);
              wrap.removeEventListener("pointerleave", leave);
            };
          }
        }, el);
        return () => {
          ctx.revert();
          split?.revert();
        };
      });

      mm.add(MOTION_REDUCE, () => {
        gsap.set(q(".v2-frame-wrap, .v2-hero-after > *"), { clearProps: "all" });
      });

      return () => {
        mm.revert();
        ScrollTrigger.refresh();
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} className="v2-hero">
      <GlyphField />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="v2-hero-copy mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 py-2 pl-2 pr-4 text-[13px] text-[var(--color-text-secondary)] backdrop-blur">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[#008a97] font-heading text-[11px] font-extrabold text-[#04181b]">
              W
            </span>
            Wasif, Karachi. Built this after losing a 4 GB upload at 80 percent.
          </span>

          <h1 className="v2-h1 font-heading mt-7 font-extrabold tracking-tight text-[var(--color-text)]">
            Unlimited free cloud storage that cannot read your files.
          </h1>
          <span className="sr-only">Unlimited free cloud storage that cannot read your files.</span>

          <div className="v2-hero-after mt-6 flex flex-col items-center gap-6">
            <p className="max-w-[54ch] text-[17px] leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
              A real drive. Your files are sealed on your device, split into pieces, and kept in
              accounts you already own. No storage limit, no card, and nothing on our side that can
              read a byte of it.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3.5 text-[15px] font-semibold text-[#04181b] shadow-[0_0_0_0_rgba(0,213,228,0)] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_0_36px_-6px_var(--color-accent)]"
              >
                Start free, no card <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-surface-3)] px-6 py-3.5 text-[15px] font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                How is it unlimited?
              </a>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-muted)]">
              {[
                "No card, ever",
                "Open source",
                "AES-256-GCM on your device",
                "Resumes at 80 percent",
              ].map((t) => (
                <li key={t} className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="v2-frame-wrap relative z-[1] mt-14 pb-24 sm:mt-16">
          <div className="v2-frame-persp">
            <LiveExplorer />
          </div>
          <ExplorerCaption>
            This is the real explorer. Sort it, switch the view, select things.
          </ExplorerCaption>
        </div>
      </div>
    </section>
  );
}
