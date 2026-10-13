"use client";

import { useEffect, useRef } from "react";

export const GRAIN_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** zcrypt's light: cyan from the top-left, indigo from the right, a pale core,
 *  teal rising from the bottom. Each drifts on its own slow orbit; the periods
 *  never line up, so the field never visibly repeats. */
const LIGHTS = [
  {
    box: { left: "-35.4%", top: "-33.2%", width: "100.8%", height: "86.4%" },
    bg: "radial-gradient(closest-side, rgba(34,211,238,0.7) 0%, rgba(34,211,238,0.18) 56%, transparent 100%)",
    anim: "glow-drift-a 17s",
  },
  {
    box: { left: "41%", top: "-5.4%", width: "108%", height: "100.8%" },
    bg: "radial-gradient(closest-side, rgba(99,102,241,0.6) 0%, rgba(99,102,241,0.15) 58%, transparent 100%)",
    anim: "glow-drift-b 21s",
  },
  {
    box: { left: "8%", top: "26.5%", width: "84%", height: "63%" },
    bg: "radial-gradient(closest-side, rgba(165,243,252,0.16) 0%, transparent 100%)",
    anim: "glow-drift-c 15s",
  },
  {
    box: { left: "-36.2%", top: "60.4%", width: "122.4%", height: "79.2%" },
    bg: "radial-gradient(closest-side, rgba(20,184,166,0.6) 0%, rgba(20,184,166,0.15) 58%, transparent 100%)",
    anim: "glow-drift-d 27s",
  },
];

/** Leans the light toward a fine pointer. Writes two CSS variables per frame
 *  at most; the eased follow is a CSS transition, so React never re-renders. */
function usePointerLean() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      !window.matchMedia("(pointer: fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty("--lean-x", (e.clientX / window.innerWidth - 0.5).toFixed(3));
        el.style.setProperty("--lean-y", (e.clientY / window.innerHeight - 0.5).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return ref;
}

/** The brand light with a film grain over it. `glowClassName` sets how strong
 *  the light is per theme. Only transforms animate, so it stays on the GPU. */
export function GrainLayers({ glowClassName }: { glowClassName?: string }) {
  const lean = usePointerLean();
  return (
    <>
      <div aria-hidden ref={lean} className={`grain-lean absolute inset-0 ${glowClassName ?? ""}`}>
        {LIGHTS.map((light) => (
          <div
            key={light.anim}
            className="grain-light absolute"
            style={{
              ...light.box,
              background: light.bg,
              animation: `${light.anim} ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.22] mix-blend-overlay"
        style={{ backgroundImage: GRAIN_TEXTURE, backgroundSize: "200px 200px" }}
      />
    </>
  );
}

/** Site-wide backdrop for the marketing pages. */
export function GrainBackground() {
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[var(--color-bg)] [contain:strict]">
      <GrainLayers glowClassName="opacity-45 dark:opacity-100" />
    </div>
  );
}
