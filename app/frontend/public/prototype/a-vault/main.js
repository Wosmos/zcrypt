// Prototype A, The Vault.
// The page is a vault you open by scrolling. Files are objects with mass,
// cyan is light that leaks from seams, and headlines arrive as ciphertext.

import { COPY } from "../shared/copy.js";
import { LOCK, PLATFORMS, hexChar, hexString } from "../shared/marks.js";
import * as S from "../shared/sections.js";
import { renderCipher } from "../shared/cipher.js";
import { renderEighty } from "../shared/eighty.js";
import { renderFeatures } from "../shared/icons.js";

const { gsap, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const REDUCE = S.REDUCE;
const MOTION = "(prefers-reduced-motion: no-preference)";
const STILL = "(prefers-reduced-motion: reduce)";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ------------------------------------------------------------------
   Build the DOM
   ------------------------------------------------------------------ */
document.body.insertAdjacentHTML("afterbegin", S.nav());

$("[data-byline]").innerHTML = S.byline();
$("[data-ctas]").innerHTML = S.ctas();
$("[data-trust]").innerHTML = S.trust();
$("[data-lock]").innerHTML = LOCK;

// Five sealed slabs in the room, at different depths.
const SLABS = [
  { x: 22, y: 34, z: -180, r: -10 },
  { x: 58, y: 24, z: -420, r: 8 },
  { x: 40, y: 60, z: -90, r: -4 },
  { x: 74, y: 58, z: -300, r: 12 },
  { x: 14, y: 72, z: -540, r: 6 },
];
$("[data-slabs]").innerHTML = COPY.files
  .map(
    ([name, size], i) => `
    <div class="slab-3d" data-slab="${i}">
      <div class="slab-top">${LOCK}<span class="mono">${size}</span></div>
      <p class="slab-name">${name}</p>
      <p class="mono slab-hex">${hexString(26, i * 131 + 5)}</p>
      <div class="edge">${hexString(40, i * 77 + 9)}</div>
    </div>`,
  )
  .join("");
$$(".slab-3d").forEach((el, i) => {
  const s = SLABS[i];
  gsap.set(el, { left: `${s.x}%`, top: `${s.y}%`, xPercent: -50, yPercent: -50, z: s.z, rotationY: s.r });
});

// Pipeline copy, nodes and tiles.
const P = COPY.pipeline;
$("[data-pipe-kicker]").textContent = P.kicker;
$("[data-pipe-h2]").textContent = P.h2;
$("[data-pipe-hint]").textContent = P.hint;
$("[data-steps]").innerHTML = P.steps
  .map(
    ([t, d], i) => `
    <li class="step step-${i + 1}">
      <span class="num">0${i + 1}</span>
      <div><strong>${t}</strong><span>${d}</span></div>
    </li>`,
  )
  .join("");
$("[data-hex-face]").textContent = hexString(30, 3);
$("[data-pipe-lock]").innerHTML = LOCK;

const TILES = 8;
// Unit grid; multiplied by SPREAD so a tile always lands on its node.
const NODES = [
  { key: "github", x: -36, y: -30, z: -140 },
  { key: "gitlab", x: 36, y: -26, z: -190 },
  { key: "huggingface", x: -32, y: 32, z: -170 },
  { key: "telegram", x: 34, y: 30, z: -120 },
];
const scene = $("[data-scene]");
const SPREAD = Math.min(6, scene.clientWidth / 88);
const stage = $("[data-stage]");
stage.insertAdjacentHTML(
  "afterbegin",
  NODES.map((n) => {
    const p = PLATFORMS.find((x) => x.key === n.key);
    return `<div class="node" data-node style="left:calc(50% + ${n.x * SPREAD}px);top:calc(50% + ${n.y * SPREAD}px)">${p.svg}<span class="node-label">${p.label}</span></div>`;
  }).join(""),
);
const card = $("[data-card]");
card.insertAdjacentHTML(
  "beforeend",
  Array.from(
    { length: TILES },
    (_, i) =>
      `<div class="tile" style="left:${(i % 4) * 25}%;top:${Math.floor(i / 4) * 50}%;width:25%;height:50%"><span>${hexString(10, i * 17)}</span></div>`,
  ).join(""),
);
const TARGETS = Array.from({ length: TILES }, (_, i) => {
  const n = NODES[i % NODES.length];
  const side = i < NODES.length ? -1 : 1;
  return { x: n.x * SPREAD + side * 18, y: n.y * SPREAD + side * 12, z: n.z, rot: side * 14 };
});

// Standard sections.
$("#rest").innerHTML =
  S.story() +
  S.eightySection() +
  S.featuresSection() +
  S.cipherSection() +
  S.plugSection() +
  S.priceSection() +
  S.catchSection() +
  S.closeSection() +
  S.footer();

renderEighty($("[data-eighty]"), { reduce: REDUCE });
renderFeatures($("[data-features]"), { reduce: REDUCE });
const cipherHost = $("[data-cipher]");
cipherHost.classList.add("cipher-tilt");
const cipherSlab = document.createElement("div");
cipherHost.appendChild(cipherSlab);
renderCipher(cipherSlab);
S.wireSticky(".hero");
S.wireStrikes(REDUCE);

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

// Text arrives as hex and settles into words, left to right with jitter.
function decode(el, { delay = 0, duration = 0.9 } = {}) {
  const split = SplitText.create(el, {
    type: "words,chars",
    wordsClass: "word",
    charsClass: "char",
    aria: "hidden",
  });
  const chars = split.chars;
  const finals = chars.map((c) => c.textContent ?? "");
  chars.forEach((c, i) => {
    if (finals[i].trim() === "") return;
    c.textContent = hexChar(i + 7);
    c.classList.add("is-hex");
  });
  const tl = gsap.timeline({ paused: true, delay });
  chars.forEach((c, i) => {
    if (finals[i].trim() === "") return;
    const at = (i / chars.length) * duration * 0.75 + ((i * 37) % 11) * 0.012;
    tl.call(() => (c.textContent = hexChar(i + 31)), null, at);
    tl.call(() => (c.textContent = hexChar(i + 59)), null, at + 0.05);
    tl.call(() => {
      c.textContent = finals[i];
      c.classList.remove("is-hex");
    }, null, at + 0.1);
  });
  tl.to({}, { duration: 0.01 }, duration);
  return tl;
}

// Cursor tilt for a 3D surface. Desktop pointers only.
function tilt(target, area, { rx = 3, ry = 4 } = {}) {
  if (!matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
  const toX = gsap.quickTo(target, "rotationX", { duration: 0.6, ease: "power3" });
  const toY = gsap.quickTo(target, "rotationY", { duration: 0.6, ease: "power3" });
  area.addEventListener("pointermove", (e) => {
    const r = area.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    toX(-py * rx * 2);
    toY(px * ry * 2);
  });
  area.addEventListener("pointerleave", () => {
    toX(0);
    toY(0);
  });
}

/* ------------------------------------------------------------------
   Motion
   ------------------------------------------------------------------ */
const mm = gsap.matchMedia();

mm.add(MOTION, () => {
  // Hero headline decodes on paint, once fonts are in so the split is stable.
  document.fonts.ready.then(() => decode($("[data-decode]"), { delay: 0.15, duration: 1.1 }).play());

  // Ambient: the seam breathes until you scroll.
  const breathe = gsap.to(".seam-glow", { opacity: 0.75, duration: 2.2, yoyo: true, repeat: -1, ease: "sine.inOut" });

  // Hero: the door. Pinned for two viewports.
  const hero = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "+=200%",
      pin: ".hero-pin",
      scrub: 0.7,
      anticipatePin: 1,
      onEnter: () => breathe.pause(),
      onLeaveBack: () => breathe.play(),
    },
    defaults: { ease: "power2.inOut" },
  });
  hero
    // The key turns, the copy lifts away.
    .to(".lock-node", { rotation: 90, duration: 0.18, ease: "back.inOut(2)" }, 0)
    .to(".scroll-hint", { opacity: 0, duration: 0.1 }, 0)
    .to(".hero-copy", { opacity: 0, y: -80, duration: 0.32, ease: "power1.in" }, 0.02)
    .to(".seam-glow", { opacity: 1, scaleX: 2.6, duration: 0.3 }, 0.05)
    .to(".lock-node", { opacity: 0, scale: 0.5, duration: 0.15 }, 0.3)
    // The leaves swing into the room on their hinges.
    .fromTo(".room", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.28)
    .to(".leaf-l", { rotationY: 106, duration: 0.7 }, 0.32)
    .to(".leaf-r", { rotationY: -110, duration: 0.7 }, 0.32)
    .to(".seam-glow", { opacity: 0, scaleX: 6, duration: 0.35 }, 0.45)
    // The camera pushes in. Slabs at different depths part around it.
    .to(".stage", { z: 440, duration: 0.8, ease: "power1.inOut" }, 0.42)
    .to(".room-caption", { opacity: 1, y: -10, duration: 0.25 }, 0.8)
    .to({}, { duration: 0.15 });

  tilt(".room", $(".hero-pin"), { rx: 2.5, ry: 4 });

  // Pipeline: pinned for three viewports and scrubbed. Scroll back, it reassembles.
  gsap.set(".tile", { x: 0, y: 0, z: 0, opacity: 0, rotationY: 0 });
  gsap.set(".node", { opacity: 0.3, z: -220, scale: 0.85 });
  gsap.set(".pipe-card", { rotationY: -16, rotationX: 7 });

  const pipe = gsap.timeline({
    scrollTrigger: {
      trigger: ".pipe",
      start: "top top",
      end: "+=260%",
      pin: ".pipe-pin",
      scrub: 0.8,
      anticipatePin: 1,
    },
    defaults: { ease: "power1.inOut" },
  });
  pipe
    // 1. Lock. The card squares up and the lock lights.
    .to(".pipe-card", { rotationY: 0, rotationX: 0, duration: 1 }, 0)
    .to(".pipe-lock", { scale: 1.2, duration: 0.4 }, 0.6)
    .to(".pipe-lock", { scale: 1, duration: 0.4 }, 1)
    .to(".step-1", { opacity: 1, duration: 0.4 }, 0.4)
    // 2. Fracture. The face fades as eight tiles take its place and spread.
    .to(".pipe-face, .pipe-lock", { opacity: 0, duration: 0.6 }, 1.4)
    .to(".tile", { opacity: 1, duration: 0.5, stagger: 0.03 }, 1.4)
    .to(
      ".tile",
      {
        x: (i) => ((i % 4) - 1.5) * 34,
        y: (i) => (Math.floor(i / 4) - 0.5) * 44,
        z: 60,
        scale: 0.82,
        rotationZ: (i) => ((i * 53) % 9) - 4,
        duration: 0.8,
      },
      1.7,
    )
    .to(".step-1", { opacity: 0.45, duration: 0.3 }, 1.6)
    .to(".step-2", { opacity: 1, duration: 0.4 }, 1.7)
    // 3. Scatter to the nodes, which light as tiles arrive.
    .to(
      ".tile",
      {
        x: (i) => TARGETS[i].x,
        y: (i) => TARGETS[i].y,
        z: (i) => TARGETS[i].z,
        rotationY: (i) => TARGETS[i].rot,
        scale: 0.55,
        duration: 1.4,
        stagger: 0.06,
        ease: "power2.inOut",
      },
      2.6,
    )
    .to(".node", { opacity: 1, z: (i) => NODES[i].z, scale: 1, duration: 1.2 }, 2.8)
    .add(() => $$(".node").forEach((n) => n.classList.add("is-lit")), 3.6)
    .to(".step-2", { opacity: 0.45, duration: 0.3 }, 2.8)
    .to(".step-3", { opacity: 1, duration: 0.4 }, 3.0)
    .to({}, { duration: 0.6 });
  pipe.eventCallback("onUpdate", () => {
    if (pipe.time() < 3.6) $$(".node").forEach((n) => n.classList.remove("is-lit"));
  });

  // Story beats: the seam of light draws in as each one arrives.
  $$(".beat").forEach((b, i) => {
    gsap.from(b, {
      y: 40,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: { trigger: b, start: "top 85%", once: true, onEnter: () => b.classList.add("is-in") },
    });
  });

  // Section headings decode when they scroll in. Split after fonts load so
  // the character boxes are measured against the real face.
  document.fonts.ready.then(() => {
    $$("#rest .h2, .pipe-h2").forEach((h) => {
      const tl = decode(h, { duration: 0.8 });
      ScrollTrigger.create({ trigger: h, start: "top 85%", once: true, onEnter: () => tl.play() });
    });
  });

  // Cards and slabs rise in.
  $$("#rest .card:not(.feat), #rest .catch").forEach((c) => {
    gsap.from(c, {
      y: 30,
      opacity: 0,
      duration: 0.7,
      ease: "power3.out",
      scrollTrigger: { trigger: c, start: "top 88%", once: true },
    });
  });

  // $0 grows in through its seam.
  gsap.from(".price .zero", {
    scale: 0.8,
    opacity: 0,
    transformOrigin: "left center",
    duration: 1,
    ease: "power3.out",
    scrollTrigger: { trigger: ".price", start: "top 70%", once: true },
  });

  // Cursor tilt on the cipher slab.
  tilt(cipherSlab, cipherHost, { rx: 3, ry: 3 });

  return () => breathe.kill();
});

mm.add(STILL, () => {
  // Final frames, nothing moves.
  gsap.set(".hero-copy", { opacity: 1 });
  gsap.set(".leaf-l", { rotationY: 106 });
  gsap.set(".leaf-r", { rotationY: -110 });
  gsap.set(".seam-glow, .lock-node, .scroll-hint", { opacity: 0 });
  gsap.set(".room", { opacity: 1 });
  gsap.set(".stage", { z: 300 });
  gsap.set(".room-caption", { opacity: 1 });
  // Keep the copy readable over the open door.
  gsap.set(".hero-copy", { opacity: 1 });

  gsap.set(".pipe-face, .pipe-lock", { opacity: 0 });
  gsap.set(".tile", {
    opacity: 1,
    scale: 0.55,
    x: (i) => TARGETS[i].x,
    y: (i) => TARGETS[i].y,
    z: (i) => TARGETS[i].z,
  });
  gsap.set(".node", { opacity: 1, scale: 1, z: (i) => NODES[i].z });
  $$(".node").forEach((n) => n.classList.add("is-lit"));
  gsap.set(".step", { opacity: 1 });
  $$(".beat").forEach((b) => b.classList.add("is-in"));
});
