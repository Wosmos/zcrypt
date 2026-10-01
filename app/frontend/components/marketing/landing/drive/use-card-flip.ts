"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const SPRING =
  "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 20.3%, 1.043 24.4%, 1.035 28.2%, 1.007 38.8%, 0.998 48.3%, 1)";

function angleOf(el: HTMLElement): number {
  const m = getComputedStyle(el).transform;
  if (!m || m === "none") return 0;
  const v = m.match(/matrix3d\(([^)]+)\)/);
  if (!v) return 0;
  const n = v[1].split(",").map(Number);
  return (Math.atan2(n[6], n[5]) * 180) / Math.PI;
}

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Flips a card between its two faces on rotateX. The face swap happens on the
 * ref (data-face), never through React state, so the swap lands exactly at 90deg.
 * Interruptible: a reversal starts from the current angle.
 */
export function useCardFlip(
  ref: RefObject<HTMLElement | null>,
  isGh: boolean,
  index: number,
  ghOnly = false,
) {
  const first = useRef(true);
  const prev = useRef(isGh);
  const st = useRef({ tk: 0, phase: "idle" as "idle" | "out" | "in" });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const inner = el.querySelector<HTMLElement>(".zh-ec-in") ?? el;
    const face = ghOnly || isGh ? "gh" : "you";
    if (first.current) {
      first.current = false;
      el.dataset.face = face;
      return;
    }
    if (prev.current === isGh) return;
    prev.current = isGh;
    const delay = Math.min(index, 11) * 18;
    const s = st.current;
    const tk = ++s.tk;

    if (reduced()) {
      inner.getAnimations().forEach((a) => a.cancel());
      inner.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 120 });
      window.setTimeout(() => {
        if (s.tk === tk) el.dataset.face = face;
      }, 60);
      return;
    }

    if (ghOnly) {
      inner.getAnimations().forEach((a) => a.cancel());
      if (isGh) {
        inner.animate(
          [
            { transform: "rotateX(-90deg)" },
            { transform: "rotateX(-90deg)", offset: 0.44 },
            { transform: "rotateX(0deg)" },
          ],
          { duration: 360, delay, easing: "linear", fill: "backwards" },
        );
      } else {
        inner.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(90deg)" }], {
          duration: 160,
          delay,
          easing: "ease-in",
          fill: "forwards",
        });
      }
      return;
    }

    const cur = s.phase === "idle" ? 0 : angleOf(inner);
    inner.getAnimations().forEach((a) => a.cancel());
    const shown = el.dataset.face === "gh";
    if (shown === isGh) {
      if (s.phase === "idle" || Math.abs(cur) < 0.5) {
        s.phase = "idle";
        return;
      }
      s.phase = "in";
      const back = inner.animate(
        [{ transform: `rotateX(${cur}deg)` }, { transform: "rotateX(0deg)" }],
        { duration: 200, easing: SPRING },
      );
      back.onfinish = () => {
        if (s.tk === tk) s.phase = "idle";
      };
      return;
    }
    const outTo = cur < 0 ? -90 : 90;
    const left = Math.max(40, 160 * (1 - Math.abs(cur) / 90));
    const d0 = Math.abs(cur) > 0.5 ? 0 : delay;
    s.phase = "out";
    const a1 = inner.animate(
      [{ transform: `rotateX(${cur}deg)` }, { transform: `rotateX(${outTo}deg)` }],
      { duration: left, delay: d0, easing: "ease-in", fill: "both" },
    );
    a1.onfinish = () => {
      if (s.tk !== tk) return;
      el.dataset.face = face;
      s.phase = "in";
      const a2 = inner.animate(
        [{ transform: `rotateX(${-outTo}deg)` }, { transform: "rotateX(0deg)" }],
        { duration: 200, easing: SPRING },
      );
      a2.onfinish = () => {
        if (s.tk !== tk) return;
        s.phase = "idle";
        a1.cancel();
      };
    };
  }, [isGh, index, ghOnly, ref]);
}
