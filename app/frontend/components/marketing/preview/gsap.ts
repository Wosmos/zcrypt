"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

/**
 * One registration point for the marketing motion stack.
 *
 * GSAP is used only on the landing prototype, for the two things `motion`
 * cannot do cleanly: pin a section and scrub a multi-step timeline against
 * scroll, and split a headline into characters for a decode. Everything else
 * on the site still uses `motion`, and that split is deliberate: two motion
 * libraries in one component would be a smell, two in one site with a clear
 * boundary is not.
 *
 * Registration is idempotent, so importing this from several components is
 * safe. Import `gsap`, `ScrollTrigger`, `SplitText` and `useGSAP` from here
 * rather than from the packages, so nothing can forget to register.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
}

/**
 * The reduced-motion query every scene gates on. gsap.matchMedia runs the
 * "reduce" branch when the OS asks for less motion and tears down the "full"
 * branch, so each scene can hand reduced users its final frame directly.
 */
export const MOTION_FULL = "(prefers-reduced-motion: no-preference)";
export const MOTION_REDUCE = "(prefers-reduced-motion: reduce)";

/** Deterministic hex, seeded, so decoded text never depends on Math.random. */
export function hexChar(seed: number): string {
  const x = ((seed * 2654435761) >>> 0) % 16;
  return "0123456789abcdef"[x];
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
