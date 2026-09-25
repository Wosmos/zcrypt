// Direction D, The Price Tag. Type is the hero, product frame under it,
// story as a pinned horizontal strip, one small precise pipeline scene.
// All motion runs inside gsap.matchMedia; reduced motion gets final states.

import { COPY } from "../shared/copy.js";
import { LOCK, PLATFORMS, ARROW, hexString } from "../shared/marks.js";
import { renderCipher } from "../shared/cipher.js";
import { renderEighty } from "../shared/eighty.js";
import { renderFeatures } from "../shared/icons.js";
import {
  nav,
  byline,
  trust,
  ctas,
  featuresSection,
  cipherSection,
  plugSection,
  catchSection,
  closeSection,
  footer,
  wireSticky,
  wireStrikes,
  REDUCE,
} from "../shared/sections.js";

const { gsap, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (s, r = document) => r.querySelector(s);
const MOTION = "(prefers-reduced-motion: no-preference)";

/* ---------- Static content from the shared copy ---------- */
$("[data-nav]").outerHTML = nav();
$("[data-byline]").innerHTML = byline();
$("[data-sub]").textContent = COPY.hero.sub;
$("[data-ctas]").innerHTML = ctas();
$("[data-trust]").innerHTML = trust();

// Product frame file list and upload chunks.
$("[data-files]").innerHTML = COPY.files
  .map(
    ([name, size]) => `
    <li class="file-row">
      <span class="fname"><span class="fico">${name.split(".").pop().toUpperCase()}</span>${name}</span>
      <span class="fsize">${size}</span>
      <span class="sealed">${LOCK}Sealed</span>
    </li>`,
  )
  .join("");
$("[data-upchunks]").innerHTML = Array.from(
  { length: 8 },
  (_, i) => `<i class="${i < 6 ? "on" : ""}"></i>`,
).join("");

// Story strip.
$("[data-story-kicker]").textContent = COPY.story.kicker;
$("[data-story-h2]").textContent = COPY.story.h2;
$("[data-story-track]").innerHTML = COPY.story.beats
  .map(
    (b, i) => `
    <article class="sbeat card beat-${i + 1}">
      <span class="num">${b.n}</span>
      <h3>${b.t}</h3>
      <p>${b.p}</p>
      ${i === 2 ? '<div data-eighty></div>' : ""}
    </article>`,
  )
  .join("");

// Sections that come straight from the shared builders.
$("[data-features]").outerHTML = featuresSection();
$("[data-cipher-section]").outerHTML = cipherSection();
$("[data-plug]").outerHTML = plugSection();
$("[data-catch]").outerHTML = catchSection();
$("[data-close]").outerHTML = closeSection();
$("[data-footer]").outerHTML = footer();

// Pipeline copy.
$("[data-pipe-kicker]").textContent = COPY.pipeline.kicker;
$("[data-pipe-h2]").textContent = COPY.pipeline.h2;
$("[data-pipe-steps]").innerHTML = COPY.pipeline.steps
  .map(
    ([t, d], i) => `
    <li class="step-${i + 1}"><span class="n">0${i + 1}</span><span><strong>${t}</strong><span class="d">${d}</span></span></li>`,
  )
  .join("");
$("[data-pipe-hint]").textContent = COPY.pipeline.hint;
$("[data-plock]").innerHTML = LOCK;
$("[data-pieces]").innerHTML = Array.from(
  { length: 4 },
  (_, i) => `<div class="piece" style="left:${i * 25}%">${hexString(24, i * 31)}</div>`,
).join("");
$("[data-pnodes]").innerHTML = PLATFORMS.map(
  (p) => `<div class="pnode"><span class="ring">${p.svg}</span><span class="lbl">${p.label}</span></div>`,
).join("");

// Price card.
$("[data-price-kicker]").textContent = COPY.price.kicker;
$("[data-strikes]").innerHTML = COPY.price.strikes
  .map((s) => `<span class="strike">${s}</span>`)
  .join("");
$("[data-price-p]").textContent = COPY.price.p;
$("[data-price-cta]").innerHTML = `${COPY.hero.cta}${ARROW}`;

/* ---------- Behaviour ---------- */
renderEighty($("[data-eighty]"), { reduce: REDUCE });
renderFeatures($("[data-features]"), { reduce: REDUCE });
renderCipher($("[data-cipher]"));
wireStrikes(REDUCE);
wireSticky(".hero");

const mm = gsap.matchMedia();

mm.add(MOTION, () => {
  /* Hero type: words settle in on load, weight scrubs gently on scroll. */
  const h1 = $("[data-h1]");
  const split = SplitText.create(h1, { type: "words", wordsClass: "word", aria: "hidden" });
  gsap.set(split.words, { fontVariationSettings: '"wght" 500' });
  gsap
    .timeline({ defaults: { ease: "power3.out" } })
    .from(split.words, { y: 40, opacity: 0, duration: 0.9, stagger: 0.06 }, 0.1)
    .to(split.words, { fontVariationSettings: '"wght" 800', duration: 0.8, stagger: 0.05 }, 0.3)
    .from(".hero-byline, .hero-lede, .hero-ctas, .hero-trust", { y: 16, opacity: 0, duration: 0.7, stagger: 0.08 }, 0.5)
    .from(".frame-wrap", { y: 40, opacity: 0, duration: 0.9 }, 0.7);

  gsap.to(h1, {
    letterSpacing: "-0.055em",
    fontVariationSettings: '"wght" 650',
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "40% top", scrub: 0.6 },
  });

  /* Product frame: eases upright as it enters, then tilts with the cursor. */
  const frame = $("[data-frame]");
  gsap.fromTo(
    frame,
    { rotateX: 12 },
    {
      rotateX: 0,
      ease: "none",
      scrollTrigger: { trigger: ".frame-wrap", start: "top 90%", end: "top 35%", scrub: 0.5 },
    },
  );
  const rx = gsap.quickTo(frame, "rotateX", { duration: 0.5, ease: "power2.out" });
  const ry = gsap.quickTo(frame, "rotateY", { duration: 0.5, ease: "power2.out" });
  const persp = $(".frame-persp");
  let hover = false;
  persp.addEventListener("pointerenter", () => (hover = true));
  persp.addEventListener("pointermove", (e) => {
    if (!hover) return;
    const r = persp.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry(px * 12);
    rx(-py * 12);
  });
  persp.addEventListener("pointerleave", () => {
    hover = false;
    rx(0);
    ry(0);
  });

  /* Story strip: pin, then drive the track sideways. */
  const track = $("[data-story-track]");
  const pin = $("[data-story-pin]");
  const distance = () => track.scrollWidth - window.innerWidth + parseFloat(getComputedStyle(track).paddingLeft) * 2;
  gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: ".story-h",
      start: "top top",
      end: () => "+=" + distance(),
      pin,
      scrub: 0.8,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });
  gsap.from(".story-head > *", {
    y: 20,
    opacity: 0,
    stagger: 0.1,
    duration: 0.7,
    scrollTrigger: { trigger: ".story-h", start: "top 70%", once: true },
  });

  /* Pipeline: tilt, lock, split into four, drop onto the platform marks. */
  const pfile = $("[data-pfile]");
  const pieces = gsap.utils.toArray(".piece");
  const nodes = gsap.utils.toArray(".pnode");
  const steps = gsap.utils.toArray(".pipe-steps li");
  gsap.set(pfile, { rotateY: -18, rotateX: 8 });

  const tl = gsap.timeline({
    defaults: { ease: "power1.inOut" },
    scrollTrigger: {
      trigger: ".pipe",
      start: "top top",
      end: "+=150%",
      pin: "[data-pipe-pin]",
      scrub: 0.8,
      anticipatePin: 1,
    },
  });
  const lightSteps = (n) => () => steps.forEach((s, i) => s.classList.toggle("on", i < n));
  tl.call(lightSteps(1), null, 0)
    .to(pfile, { rotateY: 0, rotateX: 0, duration: 1 }, 0)
    .to("[data-plock]", { scale: 1, duration: 0.4, ease: "back.out(2)" }, 0.7)
    .call(lightSteps(2), null, 1.4)
    .to(".pfile-face, [data-plock]", { opacity: 0, duration: 0.5 }, 1.4)
    .to(pieces, { opacity: 1, duration: 0.4, stagger: 0.05 }, 1.4)
    .to(pieces, { x: (i) => (i - 1.5) * 14, scale: 0.9, duration: 0.6 }, 1.7)
    .call(lightSteps(3), null, 2.6)
    .to(
      pieces,
      {
        // Land each piece dead centre on its platform ring. Measured from the
        // live rects (which include the current x, y and scale), so the delta
        // is added to the current transform rather than replacing it.
        x: (i, el) => {
          const a = el.getBoundingClientRect();
          const b = nodes[i].querySelector(".ring").getBoundingClientRect();
          return Number(gsap.getProperty(el, "x")) + (b.left + b.width / 2 - (a.left + a.width / 2));
        },
        y: (i, el) => {
          const a = el.getBoundingClientRect();
          const b = nodes[i].querySelector(".ring").getBoundingClientRect();
          return Number(gsap.getProperty(el, "y")) + (b.top + b.height / 2 - (a.top + a.height / 2));
        },
        scale: 0.3,
        duration: 1.2,
        stagger: 0.08,
        ease: "power2.inOut",
      },
      2.6,
    )
    // Once a piece is on its ring it sinks into it and the ring lights.
    .to(pieces, { scale: 0.08, opacity: 0, duration: 0.35, stagger: 0.08, ease: "power2.in" }, 3.85)
    .to(nodes, { opacity: 1, duration: 0.6, stagger: 0.08 }, 3.0)
    .call(() => nodes.forEach((n) => n.classList.add("lit")), null, 3.95)
    .to({}, { duration: 0.6 });
  tl.eventCallback("onUpdate", () => {
    if (tl.time() < 3.95) nodes.forEach((n) => n.classList.remove("lit"));
  });
  // The piece targets depend on layout, so re-measure after a resize.
  ScrollTrigger.addEventListener("refreshInit", () => tl.invalidate());

  /* Section reveals: quiet, once. */
  gsap.utils.toArray(".section .h2, .section .kicker").forEach((el) => {
    gsap.from(el, {
      y: 18,
      opacity: 0,
      duration: 0.7,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  });
  gsap.from(".price-card", {
    y: 30,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: ".price-card", start: "top 85%", once: true },
  });

  return () => split.revert();
});

mm.add("(prefers-reduced-motion: reduce)", () => {
  // Final states, no pin, vertical story.
  $(".story-h").classList.add("static");
  gsap.set("[data-pfile]", { rotateY: 0, rotateX: 0 });
  gsap.set(".pfile-face, [data-plock]", { opacity: 0 });
  gsap.set(".piece", { opacity: 0 });
  gsap.set(".pnode", { opacity: 1 });
  document.querySelectorAll(".pnode").forEach((n) => n.classList.add("lit"));
  document.querySelectorAll(".pipe-steps li").forEach((s) => s.classList.add("on"));
  $(".pipe-pin").style.height = "auto";
  $(".pipe-pin").style.minHeight = "0";
  $(".pipe-pin").style.paddingBlock = "96px";
});

// Fonts change line boxes; refresh pins once they are in.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
