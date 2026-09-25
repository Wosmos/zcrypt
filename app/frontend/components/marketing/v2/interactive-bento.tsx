"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_FULL } from "../preview/gsap";
import { BentoGrid } from "../landing/bento-grid";

/**
 * The live landing's bento, with the cards made touchable.
 *
 * BentoGrid is rendered unchanged (it is the one on / today). This wrapper
 * finds its cards after mount and gives each a shallow cursor tilt plus a
 * light that follows the pointer. Rotation only, so the content inside the
 * cards never shifts. Pointer: fine only; nothing on touch, nothing under
 * reduced motion.
 */
export function InteractiveBento() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_FULL} and (pointer: fine)`, () => {
        const cards = gsap.utils.toArray<HTMLElement>(".grid > *", el);
        const offs: (() => void)[] = [];
        cards.forEach((card) => {
          card.style.position ||= "relative";
          const glow = document.createElement("span");
          glow.className = "v2-bento-glow";
          card.appendChild(glow);
          const rx = gsap.quickTo(card, "rotationX", { duration: 0.5, ease: "power3.out" });
          const ry = gsap.quickTo(card, "rotationY", { duration: 0.5, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width;
            const py = (e.clientY - r.top) / r.height;
            ry((px - 0.5) * 5);
            rx(-(py - 0.5) * 5);
            card.style.setProperty("--mx", `${px * 100}%`);
            card.style.setProperty("--my", `${py * 100}%`);
          };
          const leave = () => {
            rx(0);
            ry(0);
          };
          card.addEventListener("pointermove", move);
          card.addEventListener("pointerleave", leave);
          offs.push(() => {
            card.removeEventListener("pointermove", move);
            card.removeEventListener("pointerleave", leave);
            glow.remove();
          });
        });
        return () => offs.forEach((f) => f());
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="v2-bento">
      <BentoGrid />
    </div>
  );
}
