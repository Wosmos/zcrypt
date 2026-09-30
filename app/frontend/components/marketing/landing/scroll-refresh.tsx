"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "@/components/marketing/landing/gsap";

const DEBOUNCE_MS = 120;

export function ScrollRefresh() {
  useEffect(() => {
    ScrollTrigger.config({ ignoreMobileResize: true });
    let alive = true;
    let timer = 0;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const loaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
    void Promise.all([fonts, loaded]).then(() => {
      if (!alive) return;
      timer = window.setTimeout(() => {
        if (alive) ScrollTrigger.refresh();
      }, DEBOUNCE_MS);
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
