"use client";

import { useEffect, useRef } from "react";
import { CIRCUITS } from "@/components/ui/circuit-paths";
import { getDeviceProfile } from "@/lib/device-profile";

const VIEW_W = 1200;
const VIEW_H = 800;
const MAX_DPR = 1.5;
const FRAME_MS = 1000 / 30;
const SCROLL_IDLE_MS = 180;
const DASH = 15;
const GAP = 100;
const OFFSET_FROM = 120;
const OFFSET_TO = -20;

export function pathLength(d: string): number {
  const tokens = d.match(/[MLVH]|-?\d+(?:\.\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  let total = 0;
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M" || cmd === "L") {
      const nx = Number(tokens[i++]);
      const ny = Number(tokens[i++]);
      if (cmd === "L") total += Math.hypot(nx - x, ny - y);
      x = nx;
      y = ny;
    } else if (cmd === "V") {
      const ny = Number(tokens[i++]);
      total += Math.abs(ny - y);
      y = ny;
    } else if (cmd === "H") {
      const nx = Number(tokens[i++]);
      total += Math.abs(nx - x);
      x = nx;
    }
  }
  return total;
}

export function pulseFrame(
  elapsed: number,
  delay: number,
  duration: number,
  reverse: boolean,
): { offset: number; alpha: number } | null {
  if (elapsed < delay) return null;
  let p = ((elapsed - delay) % duration) / duration;
  if (reverse) p = 1 - p;
  const alpha = p < 0.05 ? p / 0.05 : p > 0.95 ? (1 - p) / 0.05 : 1;
  return { offset: OFFSET_FROM + (OFFSET_TO - OFFSET_FROM) * p, alpha };
}

export function shouldAnimate(): boolean {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  const { tier } = getDeviceProfile();
  return tier === "high" || tier === "ultra";
}

export function CircuitPulses() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !shouldAnimate()) return;

    const pulses = CIRCUITS.map((c) => ({
      path: new Path2D(c.path),
      unit: pathLength(c.path) / 100,
      delay: c.delay,
      duration: c.duration,
      reverse: c.dir === "reverse",
    }));

    let color = "";
    const readColor = () => {
      color = getComputedStyle(document.documentElement).getPropertyValue("--circuit-pulse").trim();
    };
    readColor();
    const themeObserver = new MutationObserver(readColor);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    let scale = 1;
    let tx = 0;
    let ty = 0;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = Math.max(w / VIEW_W, h / VIEW_H) * dpr;
      tx = (w * dpr - VIEW_W * scale) / 2;
      ty = (h * dpr - VIEW_H * scale) / 2;
    };
    resize();

    let scrolling = false;
    let idleTimer = 0;
    const onScroll = () => {
      scrolling = true;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        scrolling = false;
      }, SCROLL_IDLE_MS);
    };

    const start = performance.now();
    let last = 0;
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (scrolling || document.hidden || now - last < FRAME_MS) return;
      last = now;
      const elapsed = (now - start) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, tx, ty);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const p of pulses) {
        const f = pulseFrame(elapsed, p.delay, p.duration, p.reverse);
        if (!f) continue;
        ctx.globalAlpha = f.alpha;
        ctx.setLineDash([DASH * p.unit, GAP * p.unit]);
        ctx.lineDashOffset = f.offset * p.unit;
        ctx.stroke(p.path);
      }
    };
    raf = requestAnimationFrame(draw);

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full opacity-50 dark:opacity-60"
    />
  );
}
