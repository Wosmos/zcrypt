"use client";

import { useEffect } from "react";

/**
 * React-Native-style keyboard avoidance for the mobile app. When the on-screen
 * keyboard opens, the visual viewport shrinks; we scroll the focused input into
 * view (so it isn't hidden behind the keyboard) and expose the keyboard height
 * as `--kb-inset` for fixed overlays that want to lift above it.
 *
 * `interactiveWidget: "resizes-content"` (root viewport) already shrinks the
 * layout viewport so normal scroll containers keep the field visible; this
 * covers the `position: fixed` cases (centered modals, bottom sheets) that CSS
 * alone can't rescue. No-op where `visualViewport` is unavailable. Renders null.
 */
export function KeyboardAvoider() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const onChange = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb-inset", `${inset}px`);

      // Only react while the keyboard is actually up.
      if (inset < 120) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      ) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
      root.style.removeProperty("--kb-inset");
    };
  }, []);

  return null;
}
