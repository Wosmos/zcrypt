// Prototype B, The Disintegration.
//
// Scroll choreography, all scrubbed and reversible:
//   Hero (pinned 250vh)
//     0 to 4   the passport dissolves: 600 glyph cells switch on in a
//              noise order with an edge-first bias, the document fades
//              under them, the headline thickens from 500 to 800.
//     1.5 to 5 "That is all we would ever see." decodes out of hex.
//     5 to 10  the glyphs stream into four platform marks, which light.
//   Story      four slabs, words rise in as each one enters.
//   Act two (pinned 200vh)
//     lock, fracture into 8 tiles, tiles fly to the four marks.
//   Then the shared sections from ../shared.

import { COPY } from "../shared/copy.js";
import { PLATFORMS, LOCK, hexChar, hexString } from "../shared/marks.js";
import { renderCipher } from "../shared/cipher.js";
import { renderEighty } from "../shared/eighty.js";
import { renderFeatures } from "../shared/icons.js";
import * as S from "../shared/sections.js";

const { gsap, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);
if (window.Flip) gsap.registerPlugin(window.Flip);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- Build the DOM ----------

document.body.insertAdjacentHTML("afterbegin", S.nav());
$("#rest").innerHTML = [
  S.eightySection(),
  S.featuresSection(),
  S.cipherSection(),
  S.plugSection(),
  S.priceSection(),
  S.catchSection(),
  S.closeSection(),
  S.footer(),
].join("");

const COLS = 30;
const ROWS = 20;
const N = COLS * ROWS;

// Glyph cells over the artefact.
const cellsRoot = $("[data-cells]");
cellsRoot.innerHTML = Array.from({ length: N }, (_, i) => `<span>${hexChar(i * 7 + 3)}</span>`).join("");
const cells = $$("span", cellsRoot);

// Platform marks, hero and act two.
const markHtml = (p) => `<div class="mark"><span class="ic">${p.svg}</span><span class="lb">${p.label}</span></div>`;
$("[data-marks]").innerHTML = PLATFORMS.map(markHtml).join("");
$("[data-row]").innerHTML = PLATFORMS.map(markHtml).join("");

// Act two card bits.
$("[data-flock]").innerHTML = LOCK;
$("[data-fhex]").textContent = hexString(28, 3);
const TILES = 8;
$("[data-tiles]").innerHTML = Array.from(
  { length: TILES },
  (_, i) =>
    `<div class="tile" style="left:${(i % 4) * 25}%;top:${Math.floor(i / 4) * 50}%">${hexString(10, i * 17)}</div>`,
).join("");

renderEighty($("[data-eighty]"), { reduce: S.REDUCE });
renderFeatures($("[data-features]"), { reduce: S.REDUCE });
renderCipher($("[data-cipher]"));
S.wireSticky(".hero");
S.wireStrikes(S.REDUCE);

// ---------- Dissolve order ----------
// Seeded hash so the order is stable across reloads, blended with distance
// from the centre so the edges go first and the middle of the passport is
// the last thing to become unreadable.
function hash(i) {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => score(a) - score(b));
function score(i) {
  const cx = ((i % COLS) + 0.5) / COLS - 0.5;
  const cy = (Math.floor(i / COLS) + 0.5) / ROWS - 0.5;
  const d = Math.max(Math.abs(cx), Math.abs(cy)) * 2; // 0 centre, 1 edge
  return hash(i) * 0.62 + (1 - d) * 0.38;
}

// ---------- Geometry for the stream ----------
// Cell centres come from the grid maths; mark centres are measured. Both
// are re-measured on every ScrollTrigger refresh so resizing stays honest.
const stage = $("[data-stage]");
const heroMarks = $$(".mark", $("[data-marks]"));
let geo = { cw: 1, ch: 1, mk: [] };
function measureHero() {
  const s = stage.getBoundingClientRect();
  geo = {
    cw: s.width / COLS,
    ch: s.height / ROWS,
    mk: heroMarks.map((m) => {
      const r = $(".ic", m).getBoundingClientRect();
      return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
    }),
  };
}
const cellX = (i) => ((i % COLS) + 0.5) * geo.cw;
const cellY = (i) => (Math.floor(i / COLS) + 0.5) * geo.ch;

const scene = $("[data-scene]");
const fcard = $("[data-fcard]");
const rowMarks = $$(".mark", $("[data-row]"));
const tiles = $$(".tile");
let tgeo = { tw: 1, th: 1, mk: [] };
function measureAct2() {
  const c = fcard.getBoundingClientRect();
  tgeo = {
    tw: c.width / 4,
    th: c.height / 2,
    mk: rowMarks.map((m) => {
      const r = $(".ic", m).getBoundingClientRect();
      return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
    }),
  };
}
ScrollTrigger.addEventListener("refreshInit", () => {
  measureHero();
  measureAct2();
});
measureHero();
measureAct2();

// ---------- Headline splits ----------
// SplitText measures glyphs, so it waits for Satoshi. Everything below
// runs from init(), after document.fonts.ready.
const h1 = $("[data-h1]");
const h1b = $("[data-h1b]");
let h1Split;
let bChars = [];
let bFinal = [];

function applyDecode(n) {
  bChars.forEach((c, i) => {
    if (bFinal[i].trim() === "") return;
    if (i < n) {
      c.textContent = bFinal[i];
      c.classList.remove("is-hex");
    } else {
      c.textContent = hexChar(i * 13 + Math.floor(n));
      c.classList.add("is-hex");
    }
  });
}

// ---------- Motion ----------
// Debug helpers for screenshots: ?still skips the entrance tweens,
// ?p=0.5 scrolls to that progress of the hero timeline once laid out.
const dbg = new URLSearchParams(location.search);
const STILL = dbg.has("still");

function init() {
h1Split = SplitText.create(h1, { type: "words", wordsClass: "word", aria: "hidden" });
const h1bSplit = SplitText.create(h1b, { type: "words,chars", wordsClass: "word", charsClass: "char" });
bChars = h1bSplit.chars;
bFinal = bChars.map((c) => c.textContent);

const mm = gsap.matchMedia();

mm.add("(prefers-reduced-motion: no-preference)", () => {
  // Settle-in on load. Real text is already painted; this only moves it.
  const intro = gsap.timeline({ paused: STILL });
  intro.from(h1Split.words, {
    yPercent: 60,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.05,
  }, 0.1)
    .from(
      [".hero-copy .byline", ".hero-copy .lede", ".hero-copy .ctas", ".hero-copy .trust"],
      { y: 16, opacity: 0, duration: 0.7, ease: "power2.out", stagger: 0.08 },
      0.4,
    )
    .from(".passport", { y: 40, rotate: -9, opacity: 0, duration: 1.1, ease: "power3.out" }, 0.2)
    .from(".photos", { y: 40, rotate: 12, opacity: 0, duration: 1.1, ease: "power3.out" }, 0.35);
  if (STILL) intro.progress(1);

  // --- Hero, pinned and scrubbed ---
  applyDecode(0);
  const dissolve = { n: 0 };
  let last = 0;
  const applyCells = () => {
    const n = Math.floor(dissolve.n);
    if (n === last) return;
    if (n > last) for (let i = last; i < n; i++) cells[order[i]].classList.add("on");
    else for (let i = n; i < last; i++) cells[order[i]].classList.remove("on");
    last = n;
  };
  const decode = { n: 0 };

  const hero = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "+=250%",
      pin: ".hero-pin",
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
    defaults: { ease: "none" },
  });

  hero
    .to(dissolve, { n: N, duration: 4, onUpdate: applyCells }, 0)
    .to("[data-art]", { opacity: 0.06, duration: 3, ease: "power1.in" }, 1)
    .to(h1, { fontWeight: 800, duration: 4 }, 0)
    .to("[data-hint]", { opacity: 0, duration: 0.4 }, 0)
    .to(h1b, { opacity: 1, duration: 0.5 }, 1.5)
    .to(decode, { n: bChars.length, duration: 3.5 }, 1.8)
    // The stream. Each cell heads for the mark it belongs to (i mod 4).
    .to(
      cells,
      {
        x: (i) => geo.mk[i % 4].x - cellX(i),
        y: (i) => geo.mk[i % 4].y - cellY(i),
        scale: 0.35,
        opacity: 0,
        duration: 3,
        ease: "power2.in",
        stagger: { each: 0.004, from: "random" },
      },
      5,
    )
    .fromTo(
      heroMarks,
      { opacity: 0, scale: 0.7 },
      { opacity: 1, scale: 1, duration: 1.4, ease: "power2.out", stagger: 0.25 },
      6.6,
    )
    .to("[data-rowlabel]", { opacity: 1, duration: 1 }, 7.6)
    .to({}, { duration: 1.2 });

  // The decode is derived from the playhead rather than from tween state, so
  // a refresh or a restored scroll position always shows the right frame.
  const syncDecode = () =>
    applyDecode(gsap.utils.clamp(0, 1, (hero.time() - 1.8) / 3.5) * bChars.length);
  hero.eventCallback("onUpdate", syncDecode);
  ScrollTrigger.addEventListener("refresh", syncDecode);

  // --- Story slabs ---
  const splits = $$("[data-split]").map((el) =>
    SplitText.create(el, { type: "words", wordsClass: "word", aria: "hidden" }),
  );
  $$(".slab").forEach((slab) => {
    const words = $$(".word", slab);
    gsap.from(words, {
      yPercent: 70,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      stagger: 0.025,
      scrollTrigger: { trigger: slab, start: "top 65%", once: true },
    });
    const n = $(".n", slab);
    if (n) {
      gsap.fromTo(
        n,
        { yPercent: -30 },
        { yPercent: -70, ease: "none", scrollTrigger: { trigger: slab, start: "top bottom", end: "bottom top", scrub: true } },
      );
    }
  });

  // --- Act two, pinned and scrubbed ---
  const steps = $$("[data-step]");
  const setStep = (k) => steps.forEach((s, i) => s.classList.toggle("on", i === k));
  const tileTargets = Array.from({ length: TILES }, (_, i) => ({
    node: i % 4,
    side: i < 4 ? -1 : 1,
  }));

  gsap.set(tiles, { opacity: 0, x: 0, y: 0, scale: 1, rotate: 0 });
  gsap.set("[data-flock]", { scale: 0, transformOrigin: "center" });
  gsap.set(fcard, { rotate: -3, y: 0 });

  const act2 = gsap.timeline({
    scrollTrigger: {
      trigger: ".act2",
      start: "top top",
      end: "+=200%",
      pin: ".act2-pin",
      scrub: 0.7,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (st) => {
        const p = st.progress;
        setStep(p < 0.3 ? 0 : p < 0.55 ? 1 : 2);
      },
    },
    defaults: { ease: "power1.inOut" },
  });

  act2
    // Lock.
    .to(fcard, { rotate: 0, duration: 1 }, 0)
    .to("[data-flock]", { scale: 1.2, duration: 0.5, ease: "back.out(3)" }, 0.5)
    .to("[data-flock]", { scale: 1, duration: 0.4 }, 1)
    // Fracture. The face and lock give way to the eight tiles.
    .to(["[data-fface]", "[data-flock]"], { opacity: 0, duration: 0.6 }, 1.5)
    .to(tiles, { opacity: 1, duration: 0.4, stagger: 0.03 }, 1.5)
    .to(
      tiles,
      {
        x: (i) => ((i % 4) - 1.5) * 26,
        y: (i) => (Math.floor(i / 4) - 0.5) * 36,
        scale: 0.86,
        rotate: (i) => ((i * 53) % 9) - 4,
        duration: 0.8,
      },
      1.8,
    )
    // Scatter to the marks.
    .to(
      tiles,
      {
        x: (i) => tgeo.mk[tileTargets[i].node].x - ((i % 4) + 0.5) * tgeo.tw + tileTargets[i].side * 10,
        y: (i) => tgeo.mk[tileTargets[i].node].y - (Math.floor(i / 4) + 0.5) * tgeo.th + tileTargets[i].side * 8,
        scale: 0.42,
        rotate: (i) => tileTargets[i].side * 12,
        duration: 1.6,
        stagger: 0.06,
        ease: "power2.inOut",
      },
      2.8,
    )
    .add(() => rowMarks.forEach((m) => m.classList.add("lit")), 4.1)
    .to({}, { duration: 0.8 });
  act2.eventCallback("onUpdate", () => {
    if (act2.time() < 4.1) rowMarks.forEach((m) => m.classList.remove("lit"));
  });

  if (dbg.has("p")) {
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      const st = hero.scrollTrigger;
      window.scrollTo(0, st.start + parseFloat(dbg.get("p")) * (st.end - st.start));
    });
  }

  return () => {
    ScrollTrigger.removeEventListener("refresh", syncDecode);
    hero.kill();
    act2.kill();
    splits.forEach((s) => s.revert());
  };
});

mm.add("(prefers-reduced-motion: reduce)", () => {
  // Final frames, no motion. The passport is already noise that has gone
  // to its four homes; the second headline reads; the tiles sit at the marks.
  gsap.set(h1, { fontWeight: 800 });
  gsap.set("[data-art]", { opacity: 0.06 });
  gsap.set(h1b, { opacity: 1 });
  applyDecode(bChars.length);
  gsap.set("[data-hint]", { opacity: 0 });
  gsap.set(heroMarks, { opacity: 1 });
  gsap.set("[data-rowlabel]", { opacity: 1 });
  cells.forEach((c) => c.classList.remove("on"));
  gsap.set(["[data-fface]", "[data-flock]"], { opacity: 0 });
  gsap.set(tiles, {
    opacity: 1,
    scale: 0.42,
    x: (i) => tgeo.mk[i % 4].x - ((i % 4) + 0.5) * tgeo.tw,
    y: (i) => tgeo.mk[i % 4].y - (Math.floor(i / 4) + 0.5) * tgeo.th,
  });
  rowMarks.forEach((m) => m.classList.add("lit"));
  $$("[data-step]").forEach((s) => s.classList.add("on"));
});
}

if (document.fonts?.ready) document.fonts.ready.then(init);
else init();
