"use client";

import { type RefObject, useEffect } from "react";

const FINE = "(hover: hover) and (pointer: fine)";

/** One pointermove on the list paints --x/--y on every card inside it, once per frame. */
export function useSpotlight(ref: RefObject<HTMLElement | null>, selector = ".zc-spot") {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const mq = window.matchMedia(FINE);
    let raf = 0;
    let px = 0;
    let py = 0;
    let cards: HTMLElement[] = [];
    let on = false;

    const paint = () => {
      raf = 0;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--x", `${Math.round(px - r.left)}px`);
        card.style.setProperty("--y", `${Math.round(py - r.top)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const sync = () => {
      if (mq.matches && !on) {
        cards = Array.from(root.querySelectorAll<HTMLElement>(selector));
        root.addEventListener("pointermove", onMove, { passive: true });
        on = true;
      } else if (!mq.matches && on) {
        root.removeEventListener("pointermove", onMove);
        on = false;
      }
    };

    sync();
    mq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      root.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, selector]);
}
