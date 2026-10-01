"use client";

import { useEffect } from "react";

export function OffscreenPause() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".pv2 section");
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) delete el.dataset.offscreen;
          else el.dataset.offscreen = "";
        }
      },
      { rootMargin: "200px 0px" },
    );
    for (const s of sections) io.observe(s);
    return () => {
      io.disconnect();
      for (const s of sections) delete s.dataset.offscreen;
    };
  }, []);
  return null;
}
