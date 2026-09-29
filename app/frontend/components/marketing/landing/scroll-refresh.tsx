"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "@/components/marketing/landing/gsap";

export function ScrollRefresh() {
  useEffect(() => {
    ScrollTrigger.config({ ignoreMobileResize: true });
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) ScrollTrigger.refresh();
    });
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad, { once: true });
    return () => {
      alive = false;
      window.removeEventListener("load", onLoad);
    };
  }, []);
  return null;
}
