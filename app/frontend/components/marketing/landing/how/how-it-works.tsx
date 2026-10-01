"use client";

import Link from "next/link";
import { useRef } from "react";
import { MOTION_REDUCE, ScrollTrigger, gsap, useGSAP } from "@/components/marketing/landing/gsap";
import { ArrowRight } from "@/lib/icons";
import { SectionHead } from "../section-head";
import { CAPTIONS, type HowPart } from "./how-data";
import { HowScene, type ScenePart } from "./how-scene";
import { HowTimeline } from "./how-timeline";

const PINNED =
  "(prefers-reduced-motion: no-preference) and (min-width: 1024px) and (min-height: 640px)";
const FLOW =
  "(prefers-reduced-motion: no-preference) and (max-width: 1023px), (prefers-reduced-motion: no-preference) and (max-height: 639px)";
const S0 = 120 / (4 * 56);
const SEG = [0, 0.33, 0.66, 1];
const LAND = SEG[2] + 0.33 * (SEG[3] - SEG[2]);
const RAIL = [0, SEG[1], LAND, 1];

type TL = gsap.core.Timeline;
type Q = (s: string) => HTMLElement[];

const $ =
  (root: HTMLElement): Q =>
  (s) =>
    Array.from(root.querySelectorAll<HTMLElement>(s));

const inFile = (i: number) => (i - 1.5) * S0 * 100;
const spread = (i: number) => (i - 1.5) * 115;
const ir = { immediateRender: false };

function centerIn(el: HTMLElement, root: HTMLElement) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

function setStart(stage: HTMLElement, part: ScenePart) {
  const q = $(stage);
  const caps = q(".zw-cap");
  gsap.set(caps, { opacity: 0, y: 0 });
  gsap.set(caps[0], { opacity: 1 });
  if (part === "all" || part === "connect") {
    gsap.set(q(".zw-tile"), { opacity: 0.35, filter: "grayscale(1)" });
    gsap.set(q(".zw-status"), { opacity: 0 });
    gsap.set(q(".zw-live"), { scale: 0 });
  }
  if (part === "all" || part === "drop") {
    gsap.set(q(".zw-file"), { opacity: 0, y: -40, rotationX: 14, transformPerspective: 700 });
    gsap.set(q(".zw-cut"), { scaleY: 0 });
    gsap.set(q(".zw-slot"), { opacity: 1, scale: 1 });
    gsap.set(q(".zw-piece"), {
      opacity: 0,
      x: 0,
      y: 0,
      xPercent: inFile,
      scaleX: S0,
      scaleY: 1,
    });
    gsap.set(q(".zw-plain"), { opacity: 1 });
    gsap.set(q(".zw-hex"), { opacity: 0 });
    gsap.set(q(".zw-lock"), { scale: 0 });
    gsap.set(q(".zw-more"), { opacity: 0, y: 6 });
  }
  if (part === "store") {
    gsap.set(q(".zw-piece"), { opacity: 1, x: 0, y: 0, xPercent: spread, scaleX: 1, scaleY: 1 });
    gsap.set(q(".zw-more"), { opacity: 1, y: 0 });
  }
  if (part === "all" || part === "store") {
    gsap.set(q(".zw-stack i"), { scaleY: 0 });
    gsap.set(q(".zw-count"), { scale: 0, opacity: 0 });
    gsap.set(q('[data-p="telegram"] .zw-glow'), { opacity: 0 });
    gsap.set(q(".zw-meter-fill"), { scaleX: 0.6 });
    gsap.set(q(".zw-ghost"), { opacity: 0, y: -8 });
  }
}

function swap(tl: TL, caps: HTMLElement[], a: number, b: number, at: number, d: number) {
  if (!caps[a] || !caps[b]) return;
  tl.fromTo(
    caps[a],
    { opacity: 1, y: 0 },
    { opacity: 0, y: -6, duration: d, ease: "power1.in", ...ir },
    at,
  ).fromTo(
    caps[b],
    { opacity: 0, y: 6 },
    { opacity: 1, y: 0, duration: d, ease: "power1.out", ...ir },
    at + d * 0.6,
  );
}

type Build = (tl: TL, stage: HTMLElement, at: number, span: number, cap: number) => void;

const connect: Build = (tl, stage, at, span) => {
  const q = $(stage);
  const t = (f: number) => at + f * span;
  const d = (f: number) => f * span;
  tl.fromTo(
    q(".zw-tile"),
    { opacity: 0.35, filter: "grayscale(1)" },
    {
      opacity: 1,
      filter: "grayscale(0)",
      duration: d(0.34),
      stagger: d(0.12),
      ease: "power1.out",
      ...ir,
    },
    t(0.08),
  )
    .fromTo(
      q(".zw-status"),
      { opacity: 0 },
      { opacity: 1, duration: d(0.2), stagger: d(0.12), ease: "none", ...ir },
      t(0.22),
    )
    .fromTo(
      q(".zw-live"),
      { scale: 0 },
      { scale: 1, duration: d(0.2), stagger: d(0.12), ease: "back.out(3)", ...ir },
      t(0.22),
    );
};

const drop: Build = (tl, stage, at, span, c) => {
  const q = $(stage);
  const caps = q(".zw-cap");
  const t = (f: number) => at + f * span;
  const d = (f: number) => f * span;
  const pieces = q(".zw-piece");
  if (c > 0) swap(tl, caps, c - 1, c, t(0), d(0.08));
  tl.fromTo(
    q(".zw-slot"),
    { opacity: 1, scale: 1 },
    { opacity: 0, scale: 0.96, duration: d(0.16), ease: "power1.in", ...ir },
    t(0.08),
  )
    .fromTo(
      q(".zw-file"),
      { opacity: 0, y: -40, rotationX: 14 },
      { opacity: 1, y: 0, rotationX: 0, duration: d(0.22), ease: "power2.out", ...ir },
      t(0.04),
    )
    .fromTo(
      q(".zw-cut"),
      { scaleY: 0 },
      { scaleY: 1, duration: d(0.12), stagger: d(0.04), ease: "power2.inOut", ...ir },
      t(0.3),
    );
  swap(tl, caps, c, c + 1, t(0.3), d(0.08));
  tl.fromTo(pieces, { opacity: 0 }, { opacity: 1, duration: d(0.04), ease: "none", ...ir }, t(0.49))
    .fromTo(
      q(".zw-file"),
      { opacity: 1 },
      { opacity: 0, duration: d(0.08), ease: "none", ...ir },
      t(0.5),
    )
    .fromTo(
      pieces,
      { xPercent: inFile, scaleX: S0 },
      { xPercent: spread, scaleX: 1, duration: d(0.2), ease: "power2.inOut", ...ir },
      t(0.54),
    );
  swap(tl, caps, c + 1, c + 2, t(0.72), d(0.08));
  tl.fromTo(
    q(".zw-lock"),
    { scale: 0 },
    { scale: 1, duration: d(0.12), stagger: d(0.03), ease: "back.out(2)", ...ir },
    t(0.74),
  )
    .fromTo(
      q(".zw-plain"),
      { opacity: 1 },
      { opacity: 0, duration: d(0.1), stagger: d(0.03), ease: "none", ...ir },
      t(0.74),
    )
    .fromTo(
      q(".zw-hex"),
      { opacity: 0 },
      { opacity: 1, duration: d(0.1), stagger: d(0.03), ease: "none", ...ir },
      t(0.74),
    )
    .fromTo(
      q(".zw-more"),
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: d(0.1), ease: "power2.out", ...ir },
      t(0.88),
    );
};

const store: Build = (tl, stage, at, span, c) => {
  const q = $(stage);
  const caps = q(".zw-cap");
  const t = (f: number) => at + f * span;
  const d = (f: number) => f * span;
  const pieces = q(".zw-piece");
  const target = q(".zw-stack")[0];
  if (!target) return;
  const dx = (i: number, el: HTMLElement) =>
    centerIn(target, stage).x - centerIn(el, stage).x - (i - 1.5) * 1.15 * el.offsetWidth;
  const dy = (_: number, el: HTMLElement) => centerIn(target, stage).y - centerIn(el, stage).y;
  if (c > 0) swap(tl, caps, c - 1, c, t(0), d(0.08));
  tl.fromTo(
    q(".zw-more"),
    { opacity: 1 },
    { opacity: 0, duration: d(0.08), ease: "none", ...ir },
    t(0.04),
  )
    .fromTo(
      pieces,
      { x: 0, y: 0, scaleX: 1, scaleY: 1 },
      {
        x: dx,
        y: dy,
        scaleX: 0.28,
        scaleY: 0.28,
        duration: d(0.3),
        stagger: d(0.05),
        ease: "power2.inOut",
        ...ir,
      },
      t(0.04),
    )
    .fromTo(
      pieces,
      { opacity: 1 },
      { opacity: 0, duration: d(0.05), stagger: d(0.05), ease: "power1.in", ...ir },
      t(0.29),
    )
    .fromTo(
      q(".zw-stack i"),
      { scaleY: 0 },
      { scaleY: 1, duration: d(0.06), stagger: d(0.05), ease: "back.out(2)", ...ir },
      t(0.33),
    )
    .fromTo(
      q('[data-p="telegram"] .zw-glow'),
      { opacity: 0 },
      { opacity: 1, duration: d(0.14), ease: "none", ...ir },
      t(0.36),
    )
    .fromTo(
      q(".zw-count"),
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: d(0.12), ease: "back.out(2.4)", ...ir },
      t(0.5),
    );
  swap(tl, caps, c, c + 1, t(0.62), d(0.08));
  tl.fromTo(
    q(".zw-meter-fill"),
    { scaleX: 0.6 },
    { scaleX: 1, duration: d(0.18), ease: "power1.inOut", ...ir },
    t(0.62),
  ).fromTo(
    q(".zw-ghost"),
    { opacity: 0, y: -8 },
    { opacity: 1, y: 0, duration: d(0.14), ease: "power2.out", ...ir },
    t(0.8),
  );
};

const BUILD: Record<HowPart, Build> = { connect, drop, store };

/** Section #how: the pinned "how is it unlimited" scene beside the numbered steps. */
export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const wrap = el.querySelector<HTMLElement>(".zw-tl");
      const pin = el.querySelector<HTMLElement>(".zw-pin");
      const spacer = el.querySelector<HTMLElement>(".zw-pin-sp");
      const master = el.querySelector<HTMLElement>(".zw-master .zw-stage");
      if (!wrap || !pin || !master) return;
      const ol = wrap.querySelector<HTMLElement>(".zw-steps") ?? wrap;
      const steps = $(wrap)(".zw-step");
      const fill = wrap.querySelector<HTMLElement>(".zw-fill");
      const dot = wrap.querySelector<HTMLElement>(".zw-dot");

      const read = () => {
        const cs = steps.map((li) => {
          const n = li.querySelector<HTMLElement>(".zw-node");
          return n ? n.offsetTop + n.offsetHeight / 2 : 0;
        });
        const top = cs[0] ?? 0;
        const h = Math.max(1, wrap.offsetHeight - top);
        return { ys: [0, (cs[1] ?? top) - top, (cs[2] ?? top) - top, h], h, top };
      };
      let cache: ReturnType<typeof read> | null = null;
      const geo = () => {
        cache ??= read();
        return cache;
      };
      const reset = () => {
        cache = null;
      };
      ScrollTrigger.addEventListener("refreshInit", reset);
      const measure = () => {
        cache = read();
        const g = cache;
        wrap.style.setProperty("--zw-rail-top", `${g.top}px`);
        wrap.style.setProperty("--zw-rail-h", `${g.h}px`);
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(wrap);

      let cur: number | "all" | null = null;
      const setActive = (n: number | "all") => {
        if (n === cur) return;
        cur = n;
        steps.forEach((li, i) => {
          li.dataset.state = n === "all" || i === n ? "active" : i < n ? "done" : "todo";
          if (n === i) li.setAttribute("aria-current", "step");
          else li.removeAttribute("aria-current");
        });
      };

      const mm = gsap.matchMedia();

      mm.add(PINNED, () => {
        setStart(master, "all");
        gsap.set(dot, { y: 0 });
        gsap.set(fill, { scaleY: 0 });
        cur = null;
        setActive(0);
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            id: "zw-pin",
            trigger: el,
            pin,
            pinSpacer: spacer ?? undefined,
            start: "top top",
            end: () => `+=${window.innerHeight * 2.4}`,
            scrub: 0.5,
            invalidateOnRefresh: true,
            refreshPriority: 1,
            onUpdate: (self) =>
              setActive(self.progress < RAIL[1] ? 0 : self.progress < RAIL[2] ? 1 : 2),
          },
        });
        for (let k = 0; k < 3; k++) {
          const len = RAIL[k + 1] - RAIL[k];
          tl.fromTo(
            dot,
            { y: () => geo().ys[k] },
            { y: () => geo().ys[k + 1], duration: len, ...ir },
            RAIL[k],
          ).fromTo(
            fill,
            { scaleY: () => geo().ys[k] / geo().h },
            { scaleY: () => geo().ys[k + 1] / geo().h, duration: len, ...ir },
            RAIL[k],
          );
        }
        connect(tl, master, SEG[0], SEG[1], 0);
        drop(tl, master, SEG[1], SEG[2] - SEG[1], CAPTIONS.connect.length);
        store(tl, master, SEG[2], SEG[3] - SEG[2], CAPTIONS.connect.length + CAPTIONS.drop.length);
        return () => setActive("all");
      });

      mm.add(FLOW, () => {
        gsap.set(dot, { y: 0 });
        gsap.set(fill, { scaleY: 0 });
        cur = null;
        setActive(0);
        gsap
          .timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: ol,
              start: "top 65%",
              end: "bottom 55%",
              scrub: true,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                const g = geo();
                const y = self.progress * g.h + 2;
                setActive(y >= g.ys[2] ? 2 : y >= g.ys[1] ? 1 : 0);
              },
            },
          })
          .fromTo(fill, { scaleY: 0 }, { scaleY: 1, duration: 1, ...ir }, 0)
          .fromTo(dot, { y: 0 }, { y: () => geo().h, duration: 1, ...ir }, 0);

        $(el)(".zw-clip .zw-stage").forEach((stage) => {
          const part = stage.dataset.part as HowPart;
          const build = BUILD[part];
          if (!build) return;
          setStart(stage, part);
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: stage,
              start: "top 75%",
              toggleActions: "play none none reverse",
              invalidateOnRefresh: true,
            },
          });
          build(tl, stage, 0, 1.4, 0);
        });
        return () => setActive("all");
      });

      mm.add(MOTION_REDUCE, () => setActive("all"));

      return () => {
        ro.disconnect();
        ScrollTrigger.removeEventListener("refreshInit", reset);
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" className="zw-how pv2-sec" aria-labelledby="h-how">
      <div className="zw-pin-sp">
        <div className="zw-pin">
          <div className="pv2-wrap zw-grid">
            <div className="zw-left">
              <SectionHead
                id="h-how"
                eyebrow="How is it unlimited?"
                title="Your file never travels whole"
                align="left"
              />
              <HowTimeline />
              <p className="zw-hint">Scroll to drive it. Scroll back to undo it.</p>
              <p className="zw-foot">
                Want the grown-up version with the actual maths?{" "}
                <Link href="/docs/how-it-works" className="zw-link">
                  Read how it works in detail
                  <ArrowRight />
                </Link>
              </p>
              <Link
                href="/register"
                className="zw-cta inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-6 text-[15px] font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="zw-master">
              <HowScene part="all" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
