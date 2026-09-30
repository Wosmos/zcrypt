"use client";

import { type RefObject, useEffect, useRef } from "react";

const BEZEL = 18;
const SCALE = -30;
const TWEEN_MS = 400;

type UAData = { brands?: { brand: string }[] };

function isChromium() {
  const data = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  if (!data) return false;
  const brands = data.brands ?? [];
  return (
    brands.length === 0 ||
    brands.some((b) => /^(Chromium|Google Chrome|Microsoft Edge)$/.test(b.brand))
  );
}

function buildMap(w: number, h: number, radius: number, dpr: number) {
  const cw = Math.max(1, Math.round(w * dpr));
  const ch = Math.max(1, Math.round(h * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(cw, ch);
  const px = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  for (let j = 0; j < ch; j++) {
    const y = (j + 0.5) / dpr - hh;
    const ay = Math.abs(y);
    const qy = ay - (hh - r);
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) / dpr - hw;
      const ax = Math.abs(x);
      const qx = ax - (hw - r);
      let d: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy);
        d = r - len;
        nx = qx / len;
        ny = qy / len;
      } else if (qx > qy) {
        d = r - qx;
        nx = 1;
        ny = 0;
      } else {
        d = r - qy;
        nx = 0;
        ny = 1;
      }
      const o = (j * cw + i) * 4;
      let red = 128;
      let green = 128;
      if (d >= 0 && d < BEZEL) {
        const t = d / BEZEL;
        const m = (1 - t) ** 2;
        red = 128 - Math.sign(x) * nx * m * 127;
        green = 128 - Math.sign(y) * ny * m * 127;
      }
      px[o] = red;
      px[o + 1] = green;
      px[o + 2] = 128;
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Chromium-only edge refraction for the nav glass; other engines keep the base blur stack. */
export function LiquidGlassFilter({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const filterRef = useRef<SVGFilterElement>(null);
  const imageRef = useRef<SVGFEImageElement>(null);
  const dispRef = useRef<SVGFEDisplacementMapElement>(null);

  useEffect(() => {
    const el = targetRef.current;
    const filter = filterRef.current;
    const feImage = imageRef.current;
    const disp = dispRef.current;
    if (!el || !filter || !feImage || !disp || !isChromium()) return;

    const root = document.documentElement;
    const header = el.closest("header");
    const wide = matchMedia("(pointer: fine) and (min-width: 1024px)");
    const lessGlass = matchMedia("(prefers-reduced-transparency: reduce)");
    const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");

    let enabled = false;
    let size = "";
    let timer = 0;
    let tweenRaf = 0;
    let tweened = false;
    let alive = true;

    const build = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const key = `${w}x${h}`;
      if (!enabled || w < 2 || h < 2 || key === size) return;
      const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24;
      const url = buildMap(w, h, radius, Math.min(window.devicePixelRatio || 1, 2));
      if (!url) return;
      size = key;
      const probe = new Image();
      probe.onload = () => {
        if (!alive || !enabled) return;
        for (const node of [filter, feImage]) {
          node.setAttribute("width", String(w));
          node.setAttribute("height", String(h));
        }
        feImage.setAttribute("href", url);
        root.dataset.lg = "refract";
      };
      probe.src = url;
    };

    const shown = () =>
      header?.dataset.scrolled === "true" || (!!header?.dataset.menu && header.dataset.menu !== "");

    const tween = () => {
      if (tweened || !enabled || !shown()) return;
      tweened = true;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / TWEEN_MS);
        const eased = 1 - (1 - p) ** 3;
        disp.setAttribute("scale", String(SCALE * eased));
        if (p < 1) tweenRaf = requestAnimationFrame(step);
      };
      tweenRaf = requestAnimationFrame(step);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 120);
    };

    const ro = new ResizeObserver(schedule);
    const mo = new MutationObserver(tween);
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName.startsWith("padding")) build();
    };

    const evaluate = () => {
      const ok = wide.matches && !lessGlass.matches && !lessMotion.matches;
      if (ok === enabled) return;
      enabled = ok;
      if (ok) {
        size = "";
        build();
        ro.observe(el);
        el.addEventListener("transitionend", onEnd);
        if (header) {
          mo.observe(header, { attributes: true, attributeFilter: ["data-scrolled", "data-menu"] });
        }
        tween();
      } else {
        ro.disconnect();
        mo.disconnect();
        el.removeEventListener("transitionend", onEnd);
        window.clearTimeout(timer);
        delete root.dataset.lg;
      }
    };

    evaluate();
    for (const q of [wide, lessGlass, lessMotion]) q.addEventListener("change", evaluate);

    return () => {
      alive = false;
      for (const q of [wide, lessGlass, lessMotion]) q.removeEventListener("change", evaluate);
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
      cancelAnimationFrame(tweenRaf);
      delete root.dataset.lg;
    };
  }, [targetRef]);

  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <filter
        ref={filterRef}
        id="zc-lg-nav"
        x="0"
        y="0"
        width="100%"
        height="100%"
        filterUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          ref={imageRef}
          x="0"
          y="0"
          width="0"
          height="0"
          preserveAspectRatio="none"
          result="map"
        />
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="src" />
        <feDisplacementMap
          ref={dispRef}
          in="src"
          in2="map"
          scale="0"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
