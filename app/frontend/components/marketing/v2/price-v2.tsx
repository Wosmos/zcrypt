"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE, hexChar } from "../preview/gsap";
import { TiltCard } from "../preview/tilt-card";
import { ArrowRight } from "@/lib/icons";

/**
 * The price, as a receipt.
 *
 * The story said the price tag was you. This is the moment the page shows
 * the new price tag. The numeral resolves out of ciphertext into $0, and a
 * receipt beside it prints line by line: everything the free clouds charged
 * for in data, itemised, each at zero. The last line is the one that
 * matters: your files as training data, never. Then the total, then the
 * three things you do not pay, struck through one at a time.
 */
const LINES = [
  ["Unlimited storage", "$0"],
  ["Encryption, on your device", "$0"],
  ["Sharing with anyone", "$0"],
  ["Desktop, web and terminal", "$0"],
  ["Your files as training data", "never"],
];
const STRIKES = ["No card", "No trial", "No upsell"];

export function PriceV2() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      mm.add(MOTION_FULL, () => {
        const glyphs = q(".v2-price-glyph");
        const finals = glyphs.map((g) => g.dataset.final ?? "");
        glyphs.forEach((g, i) => {
          g.textContent = hexChar(i + 5);
          g.classList.add("is-hex");
        });

        const tl = gsap.timeline({
          paused: true,
          scrollTrigger: { trigger: el, start: "top 65%", once: true, onEnter: () => tl.play() },
        });

        // Numeral decodes: a few flickers, then the real character.
        glyphs.forEach((g, i) => {
          const at = i * 0.18;
          [0, 0.08, 0.16].forEach((d, k) =>
            tl.call(
              () => {
                g.textContent = hexChar(i * 7 + k * 13 + 3);
              },
              undefined,
              at + d,
            ),
          );
          tl.call(
            () => {
              g.textContent = finals[i];
              g.classList.remove("is-hex");
            },
            undefined,
            at + 0.26,
          );
        });

        // Receipt prints.
        tl.fromTo(
          q(".v2-receipt-line"),
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.22, ease: "power2.out" },
          0.5,
        )
          .fromTo(
            q(".v2-receipt-total"),
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.4 },
            "+=0.1",
          )
          .fromTo(
            q(".v2-receipt-stamp"),
            { opacity: 0, scale: 1.6, rotation: -14 },
            { opacity: 1, scale: 1, rotation: -8, duration: 0.45, ease: "back.out(2.5)" },
            "-=0.1",
          );

        // Strikes, one at a time.
        q(".vault-strike").forEach((s, i) =>
          tl.call(() => s.classList.add("is-struck"), undefined, 1.6 + i * 0.28),
        );

        return () => tl.kill();
      });

      mm.add(MOTION_REDUCE, () => {
        q(".vault-strike").forEach((s) => s.classList.add("is-struck"));
      });

      return () => {
        mm.revert();
        ScrollTrigger.refresh();
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} className="v2-price px-4 py-24 sm:px-6 sm:py-32" id="price">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
            The price
          </p>
          <p className="vault-numeral font-heading mt-2 font-extrabold" aria-label="Zero dollars">
            {["$", "0"].map((c, i) => (
              <span key={i} className="v2-price-glyph" data-final={c}>
                {c}
              </span>
            ))}
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-lg text-[var(--color-text-secondary)]">
            {STRIKES.map((s) => (
              <span key={s} className="vault-strike">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-[var(--color-text-secondary)]">
            The free clouds charged you in data. This one runs on space you already own, so there is
            nothing to charge for and no plan to grow into.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3.5 text-[15px] font-semibold text-[#04181b] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_0_36px_-6px_var(--color-accent)]"
          >
            Start free, no card <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <TiltCard className="v2-receipt vault-slab" max={5}>
          <div className="v2-receipt-head">
            <span>zcrypt</span>
            <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
              receipt no. 000000
            </span>
          </div>
          <ul className="v2-receipt-lines">
            {LINES.map(([k, v]) => (
              <li key={k} className="v2-receipt-line">
                <span>{k}</span>
                <span className="dots" aria-hidden="true" />
                <span className={v === "never" ? "text-[var(--color-accent)]" : ""}>{v}</span>
              </li>
            ))}
          </ul>
          <div className="v2-receipt-total">
            <span>Total</span>
            <span>$0</span>
          </div>
          <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
            Paid with: nothing. Not your card, not your files.
          </p>
          <span className="v2-receipt-stamp" aria-hidden="true">
            Free forever
          </span>
        </TiltCard>
      </div>
    </section>
  );
}
