// HTML builders for the sections every prototype shares. Pages call the
// ones they want, in the order they want, and hand-write their signature
// scenes. Everything returns a string.

import { COPY } from "./copy.js";
import { LOGO, PLATFORMS, ARROW } from "./marks.js";

export function nav() {
  return `
  <header class="nav">
    <a class="brand" href="../index.html" aria-label="zcrypt home">${LOGO}<span>${COPY.brand}</span></a>
    <nav class="links" aria-label="Primary">
      ${COPY.nav.map((l) => `<a href="${l.href}">${l.label}</a>`).join("")}
      <a href="#" class="btn btn-primary">Start free</a>
    </nav>
  </header>`;
}

export function byline() {
  return `<span class="byline"><span class="dot" aria-hidden="true">W</span>${COPY.hero.byline}</span>`;
}

export function trust() {
  return `<ul class="trust">${COPY.hero.trust.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

export function ctas() {
  const h = COPY.hero;
  return `
    <div class="ctas">
      <a href="#" class="btn btn-primary">${h.cta}${ARROW}</a>
      <a href="#cipher" class="btn btn-ghost">${h.cta2}</a>
    </div>`;
}

export function story() {
  const s = COPY.story;
  return `
  <section class="section story" id="story">
    <div class="wrap">
      <p class="kicker accent">${s.kicker}</p>
      <h2 class="h2" style="margin-top:14px">${s.h2}</h2>
      <div class="beats" style="margin-top:40px">
        ${s.beats
          .map(
            (b) => `
          <article class="beat">
            <span class="num">${b.n}</span>
            <div><h3>${b.t}</h3><p>${b.p}</p></div>
          </article>`,
          )
          .join("")}
      </div>
    </div>
  </section>`;
}

export function eightySection() {
  const e = COPY.eighty;
  return `
  <section class="section" id="eighty">
    <div class="wrap">
      <p class="kicker accent">${e.kicker}</p>
      <h2 class="h2" style="margin-top:14px">${e.h2}</h2>
      <div data-eighty style="margin-top:40px"></div>
    </div>
  </section>`;
}

export function featuresSection() {
  const f = COPY.features;
  return `
  <section class="section" id="features">
    <div class="wrap">
      <p class="kicker accent">${f.kicker}</p>
      <h2 class="h2" style="margin-top:14px">${f.h2}</h2>
      <div data-features style="margin-top:40px"></div>
    </div>
  </section>`;
}

export function cipherSection() {
  const c = COPY.cipher;
  return `
  <section class="section" id="cipher">
    <div class="wrap">
      <p class="kicker accent">${c.kicker}</p>
      <h2 class="h2" style="margin-top:14px">${c.h2}</h2>
      <div data-cipher style="margin-top:40px"></div>
    </div>
  </section>`;
}

export function platformsRow() {
  return `<div class="platforms">${PLATFORMS.map((p) => `<span>${p.svg}${p.label}</span>`).join("")}</div>`;
}

export function plugSection() {
  const p = COPY.plug;
  return `
  <section class="section" id="plug">
    <div class="wrap">
      <p class="kicker accent">${p.kicker}</p>
      <h2 class="h2" style="margin-top:14px">${p.h2}</h2>
      <div class="plug-grid" style="margin-top:40px">
        <div class="card plug-a">
          <p class="kicker">${p.a.t}</p>
          <p class="lede" style="margin-top:12px">${p.a.p}</p>
        </div>
        <div class="card accent plug-b">
          <p class="kicker accent">${p.b.t}</p>
          <p class="lede" style="margin-top:12px">${p.b.p}</p>
          <div style="margin-top:22px">${platformsRow()}</div>
        </div>
      </div>
    </div>
  </section>`;
}

export function priceSection() {
  const p = COPY.price;
  return `
  <section class="section price" id="price">
    <div class="wrap">
      <p class="kicker accent">${p.kicker}</p>
      <p class="zero" aria-label="Zero dollars">$0</p>
      <div class="strikes" style="margin-top:18px">
        ${p.strikes.map((s) => `<span class="strike">${s}</span>`).join("")}
      </div>
      <p class="lede" style="margin-top:22px">${p.p}</p>
    </div>
  </section>`;
}

export function catchSection() {
  const c = COPY.catch;
  return `
  <section class="section" id="catch">
    <div class="wrap">
      <div class="catch">
        <p class="kicker" style="color:var(--amber)">${c.kicker}</p>
        <h2 class="h2" style="margin-top:14px">${c.h2}</h2>
        <ul>
          ${c.items.map(([a, b]) => `<li><strong>${a}</strong> ${b}</li>`).join("")}
        </ul>
      </div>
    </div>
  </section>`;
}

export function closeSection() {
  const c = COPY.close;
  const h = COPY.hero;
  return `
  <section class="section close" id="close">
    <div class="wrap" style="text-align:center">
      <h2 class="h2" style="margin-inline:auto;max-width:none">${c.h2}</h2>
      <p class="lede" style="margin:16px auto 0">${c.p}</p>
      <div class="ctas" style="justify-content:center;margin-top:32px">
        <a href="#" class="btn btn-primary">${h.cta}${ARROW}</a>
        <a href="#" class="btn btn-link">${h.cta3}</a>
      </div>
    </div>
  </section>`;
}

export function footer() {
  const f = COPY.footer;
  return `
  <footer class="wrap footer">
    <span class="brand">${LOGO}${f.line}</span>
    <nav aria-label="Footer">${f.links.map((l) => `<a href="#">${l}</a>`).join("")}</nav>
  </footer>
  <div class="sticky-cta" data-sticky>
    <span class="t">Free, sealed, yours.</span>
    <a href="#" class="btn btn-primary">Start free</a>
  </div>`;
}

// Shows the sticky mobile bar once the hero is scrolled past.
export function wireSticky(heroSelector) {
  const bar = document.querySelector("[data-sticky]");
  const hero = document.querySelector(heroSelector);
  if (!bar || !hero || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(([e]) => bar.classList.toggle("show", !e.isIntersecting), {
    threshold: 0.05,
  }).observe(hero);
}

// Strikes the three price words one at a time when the price section enters.
export function wireStrikes(reduce) {
  const spans = [...document.querySelectorAll(".strike")];
  if (!spans.length) return;
  if (reduce) return spans.forEach((s) => s.classList.add("on"));
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      spans.forEach((s, i) => setTimeout(() => s.classList.add("on"), 300 + i * 320));
    },
    { threshold: 0.4 },
  );
  io.observe(spans[0].closest("section"));
}

export const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
