"use client";

import { useEffect, useRef } from "react";

export const GRAIN_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const LIGHTS = [
  {
    box: { left: "-22%", top: "-28%", width: "84%", height: "78%" },
    bg: "radial-gradient(closest-side, var(--grain-1) 0%, color-mix(in oklab, var(--grain-1) 55%, transparent) 48%, transparent 100%)",
    anim: "glow-drift-a 52s",
  },
  {
    box: { left: "44%", top: "2%", width: "82%", height: "88%" },
    bg: "radial-gradient(closest-side, var(--grain-2) 0%, color-mix(in oklab, var(--grain-2) 50%, transparent) 50%, transparent 100%)",
    anim: "glow-drift-b 64s",
  },
  {
    box: { left: "-14%", top: "56%", width: "76%", height: "72%" },
    bg: "radial-gradient(closest-side, var(--grain-3) 0%, transparent 100%)",
    anim: "glow-drift-c 58s",
  },
];

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

export function GrainLayers() {
  const lean = usePointerLean();
  return (
    <>
      <div aria-hidden ref={lean} className="grain-lean absolute inset-0">
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
        className="grain-tex absolute inset-0"
        style={{ backgroundImage: GRAIN_TEXTURE, backgroundSize: "200px 200px" }}
      />
    </>
  );
}

export function GrainBackground() {
  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[var(--color-bg)] [contain:strict]">
      <GrainLayers />
    </div>
  );
}
