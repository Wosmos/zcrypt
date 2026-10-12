"use client";

import { useEffect, useState } from "react";
import { buildMap, Dispersion, isChromium } from "@/components/marketing/liquid-glass-filter";

const SELECTOR = ".glass-surface";
const SCALE = -22;

interface Lens {
  id: string;
  w: number;
  h: number;
  url: string;
}

/**
 * Gives every `.glass-surface` control (hero pill, secondary buttons) the same
 * edge refraction as the nav: each gets a displacement map sized to its own
 * shape, so light bends around its rim with a slight colour split. Chromium on
 * a desktop pointer only; everything else keeps the frosted fallback.
 */
export function LiquidGlassAuto() {
  const [lenses, setLenses] = useState<Lens[]>([]);

  useEffect(() => {
    const fine = matchMedia("(pointer: fine) and (min-width: 1024px)");
    const lessGlass = matchMedia("(prefers-reduced-transparency: reduce)");
    const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");
    if (!isChromium() || !fine.matches || lessGlass.matches || lessMotion.matches) return;

    const ids = new WeakMap<HTMLElement, string>();
    const maps = new Map<string, { key: string; url: string }>();
    let next = 0;
    let timer = 0;
    let last = "";

    const measure = () => {
      const found: Lens[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w < 2 || h < 2) continue;
        let id = ids.get(el);
        if (!id) {
          id = `zc-lg-a${next++}`;
          ids.set(el, id);
        }
        const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || h / 2;
        const key = `${w}x${h}x${radius}`;
        let url = maps.get(id)?.key === key ? maps.get(id)?.url : undefined;
        if (!url) {
          url =
            buildMap(
              w,
              h,
              Math.min(radius, h / 2),
              Math.min(devicePixelRatio || 1, 2),
              Math.min(14, h * 0.42),
            ) ?? undefined;
          if (!url) continue;
          maps.set(id, { key, url });
        }
        found.push({ id, w, h, url });
        const filter = `url(#${id}) var(--glass-backdrop)`;
        el.style.setProperty("backdrop-filter", filter);
        el.style.setProperty("-webkit-backdrop-filter", filter);
      }
      const signature = found.map((l) => `${l.id}:${l.w}x${l.h}`).join("|");
      if (signature === last) return;
      last = signature;
      setLenses(found);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };

    const ro = new ResizeObserver(schedule);
    const watch = () => {
      ro.disconnect();
      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) ro.observe(el);
      schedule();
    };
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    watch();

    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      mo.disconnect();
      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        el.style.removeProperty("backdrop-filter");
        el.style.removeProperty("-webkit-backdrop-filter");
      }
    };
  }, []);

  if (lenses.length === 0) return null;
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      {lenses.map((l) => (
        <filter
          key={l.id}
          id={l.id}
          x="0"
          y="0"
          width={l.w}
          height={l.h}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={l.url}
            x="0"
            y="0"
            width={l.w}
            height={l.h}
            preserveAspectRatio="none"
            result="map"
          />
          <Dispersion source="SourceGraphic" scale={SCALE} />
        </filter>
      ))}
    </svg>
  );
}
