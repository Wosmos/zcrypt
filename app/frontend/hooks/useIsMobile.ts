"use client";

import { useEffect, useState } from "react";

/**
 * True on small (phone-sized) viewports. SSR-safe: starts false and updates on
 * mount, so it never mismatches during hydration. Used to switch off expensive
 * effects on mobile — per-item layout animations, backdrop blur, etc.
 */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return isMobile;
}
