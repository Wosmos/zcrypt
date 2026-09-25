// Six feature icons that do the thing they describe. Port of
// feature-icons.tsx. Each is inline SVG with named parts and a GSAP
// timeline that plays once when the tile scrolls in and again on hover.
// Expects `gsap` on window (loaded from CDN by the page).

import { COPY } from "./copy.js";

const S = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  lock: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <rect class="i-body" x="10" y="21" width="28" height="19" rx="4" ${S}/>
      <path class="i-shackle" d="M16 21v-5a8 8 0 0 1 16 0v5" ${S}/>
      <circle class="i-dot" cx="24" cy="31" r="2.2" fill="currentColor"/>
    </svg>`,
    play(tl, q) {
      tl.fromTo(q(".i-shackle"), { y: -7 }, { y: 0, duration: 0.45, ease: "back.out(2)" }).fromTo(
        q(".i-dot"),
        { scale: 0, transformOrigin: "center" },
        { scale: 1, duration: 0.3, ease: "back.out(3)" },
        "-=0.1",
      );
    },
  },
  split: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      ${[0, 1, 2, 3]
        .map(
          (i) =>
            `<rect class="i-piece" x="${12 + (i % 2) * 13}" y="${12 + Math.floor(i / 2) * 13}" width="11" height="11" rx="2.5" ${S}/>`,
        )
        .join("")}
    </svg>`,
    play(tl, q) {
      tl.fromTo(
        q(".i-piece"),
        { x: (i) => (i % 2 ? -6 : 6), y: (i) => (i < 2 ? 6 : -6), opacity: 0.4 },
        { x: 0, y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.05 },
      ).to(
        q(".i-piece"),
        { x: (i) => (i % 2 ? 4 : -4), y: (i) => (i < 2 ? -4 : 4), duration: 0.5, ease: "power2.inOut" },
        "+=0.2",
      );
    },
  },
  key: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <g class="i-key" style="transform-origin:19px 24px">
        <circle cx="19" cy="24" r="7" ${S}/>
        <path d="M26 24h13M34 24v5M39 24v4" ${S}/>
      </g>
    </svg>`,
    play(tl, q) {
      tl.fromTo(q(".i-key"), { rotation: -35 }, { rotation: 0, duration: 0.7, ease: "back.out(1.6)" })
        .to(q(".i-key"), { rotation: 90, duration: 0.4, ease: "power2.inOut" }, "+=0.15")
        .to(q(".i-key"), { rotation: 0, duration: 0.5, ease: "power3.out" }, "+=0.2");
    },
  },
  resume: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M10 30h28" ${S} opacity="0.3"/>
      <path class="i-bar" d="M10 30h28" ${S} stroke-width="3"/>
      <circle class="i-head" cx="10" cy="30" r="3" fill="currentColor"/>
      <path class="i-arrow" d="M24 14l4 4-4 4M28 18h-8" ${S}/>
    </svg>`,
    play(tl, q) {
      tl.fromTo(
        q(".i-bar"),
        { strokeDasharray: 28, strokeDashoffset: 28 },
        { strokeDashoffset: 6, duration: 0.7, ease: "power1.inOut" },
      )
        .fromTo(q(".i-head"), { x: 0 }, { x: 22, duration: 0.7, ease: "power1.inOut" }, "<")
        .to(q(".i-head"), { opacity: 0.3, duration: 0.15, yoyo: true, repeat: 1 })
        .to(q(".i-bar"), { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" })
        .to(q(".i-head"), { x: 28, duration: 0.35, ease: "power2.out" }, "<")
        .fromTo(q(".i-arrow"), { opacity: 0, x: -4 }, { opacity: 1, x: 0, duration: 0.3 }, "-=0.2");
    },
  },
  own: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path class="i-cloud" d="M16 34a7 7 0 0 1-1-13.9A9 9 0 0 1 32 18a6.5 6.5 0 0 1 1 13" ${S}/>
      <path class="i-down" d="M24 22v14M19 31l5 5 5-5" ${S}/>
      <path class="i-base" d="M14 40h20" ${S}/>
    </svg>`,
    play(tl, q) {
      tl.fromTo(q(".i-down"), { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }).fromTo(
        q(".i-base"),
        { scaleX: 0, transformOrigin: "center" },
        { scaleX: 1, duration: 0.4, ease: "power2.out" },
        "-=0.2",
      );
    },
  },
  open: {
    svg: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path class="i-brace-l" d="M18 12l-7 12 7 12" ${S}/>
      <path class="i-brace-r" d="M30 12l7 12-7 12" ${S}/>
      <path class="i-check" d="M20 25l3 3 6-7" ${S}/>
    </svg>`,
    play(tl, q) {
      tl.fromTo(q(".i-brace-l"), { x: 6, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" })
        .fromTo(q(".i-brace-r"), { x: -6, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, "<")
        .fromTo(
          q(".i-check"),
          { strokeDasharray: 14, strokeDashoffset: 14 },
          { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" },
          "-=0.1",
        );
    },
  },
};

export function iconSvg(key) {
  return ICONS[key].svg;
}

// Renders the six feature tiles into `root` and wires the icon timelines.
// `reduce` true: icons render finished and never move.
export function renderFeatures(root, { reduce = false } = {}) {
  const f = COPY.features;
  root.classList.add("features");
  root.innerHTML = f.items
    .map(
      (it) => `
      <div class="feat card" data-icon="${it.key}">
        <div class="icon">${ICONS[it.key].svg}</div>
        <h3>${it.t}</h3>
        <p>${it.p}</p>
      </div>`,
    )
    .join("");
  if (reduce || !window.gsap) return;

  const { gsap, ScrollTrigger } = window;
  root.querySelectorAll(".feat").forEach((tile) => {
    const def = ICONS[tile.dataset.icon];
    const q = (s) => gsap.utils.toArray(s, tile);
    let tl = null;
    const build = () => {
      if (tl) tl.kill();
      tl = gsap.timeline({ paused: true });
      def.play(tl, q);
      return tl;
    };
    ScrollTrigger.create({
      trigger: tile,
      start: "top 85%",
      once: true,
      onEnter: () => build().play(0),
    });
    tile.addEventListener("pointerenter", () => build().play(0));
  });
}
