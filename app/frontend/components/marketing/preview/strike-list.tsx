"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_FULL } from "./gsap";

/**
 * The three things you do not pay, striking themselves out one at a time as
 * the price section scrolls in. Small, but it is the moment "free" stops
 * being a word and becomes three specific bills not arriving.
 *
 * Reduced motion: already struck, via the stylesheet.
 */
export function StrikeList({ items }: { items: string[] }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_FULL, () => {
        const spans = gsap.utils.toArray<HTMLElement>(".vault-strike", el);
        const st = gsap.timeline({
          scrollTrigger: { trigger: el, start: "top 80%", once: true },
        });
        spans.forEach((s, i) => st.add(() => s.classList.add("is-struck"), i * 0.28));
        return () => st.kill();
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-base text-[var(--color-text-secondary)]"
    >
      {items.map((t) => (
        <span key={t} className="vault-strike">
          {t}
        </span>
      ))}
    </div>
  );
}
