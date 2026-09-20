"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "./gsap";
import { cn } from "@/lib/utils";

/**
 * A slab that tilts toward the cursor in real 3D.
 *
 * Small, fast, and the same everywhere it is used, so the page has one
 * physical rule for how surfaces respond to being looked at. The max tilt is
 * deliberately shallow (6 degrees): enough to read as an object, not enough to
 * make text hard to read at the edges.
 *
 * Pointer-only. Touch devices get a static slab; there is no cursor to follow
 * and a tilt that fires on scroll-touch feels like a glitch.
 */
export function TiltCard({
  children,
  className,
  depth = 0,
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  /** translateZ in px, so siblings can sit at different depths in one scene. */
  depth?: number;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
      const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });

      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry(px * max * 2);
        rx(-py * max * 2);
      };
      const onLeave = () => {
        rx(0);
        ry(0);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      return () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: ref },
  );

  return (
    <div className="vault-scene">
      <div
        ref={ref}
        className={cn("vault-slab", className)}
        style={{ transform: `translateZ(${depth}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
