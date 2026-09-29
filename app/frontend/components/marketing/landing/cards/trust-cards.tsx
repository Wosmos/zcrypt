"use client";

import { type CSSProperties, type ReactElement, useEffect, useRef } from "react";
import { gsap, useGSAP, MOTION_FULL, MOTION_REDUCE } from "@/components/marketing/landing/gsap";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { EncryptScene, ScaleScene, StealthScene, OpenScene } from "./trust-scenes";
import { useSpotlight } from "./use-spotlight";

type Card = {
  key: string;
  num: string;
  label: string;
  title: string;
  body: string;
  chips: readonly string[];
  mono?: string;
  caption: string;
  Scene: () => ReactElement;
};

const CARDS: readonly Card[] = [
  {
    key: "encryption",
    num: "01",
    label: "ENCRYPTION",
    title: "Locked before it leaves your device",
    body: "Your password makes the key, right on your device. We never get a copy, so there is nothing for us to lose, leak or hand over.",
    chips: [
      "AES-256-GCM",
      "Key stays on your device",
      "File names locked too",
      "A changed byte gets caught",
    ],
    mono: "AES-256-GCM",
    caption: "sealed on this device",
    Scene: EncryptScene,
  },
  {
    key: "scale",
    num: "02",
    label: "SCALE",
    title: "Room that keeps growing",
    body: "Big files are cut into pieces and spread across your accounts. Your only limit is the free space you already have.",
    chips: ["Pieces of 4 to 32 MB", "New spot before one fills", "Telegram: no ceiling"],
    caption: "every account is more room",
    Scene: ScaleScene,
  },
  {
    key: "stealth",
    num: "03",
    label: "STEALTH",
    title: "Nothing about it looks interesting",
    body: "Pieces get dull names and ordinary commit messages. To anyone looking, it's one more quiet side project.",
    chips: ["Random file names", "Boring commit messages", "Names like quick-loader-v2"],
    mono: "quick-loader-v2",
    caption: "chore: refresh build cache",
    Scene: StealthScene,
  },
  {
    key: "open",
    num: "04",
    label: "OPEN",
    title: "Every line is public",
    body: "Read the code, check the maths, or run it on your own computer. You don't have to take our word for it.",
    chips: ["MIT licensed", "Run it yourself with Docker", "Full source on GitHub"],
    caption: "read it, fork it, run it",
    Scene: OpenScene,
  },
];

const STACK = "(min-width: 768px) and (min-height: 600px)";

function Chip({ text, mono }: { text: string; mono?: string }) {
  if (!mono || !text.includes(mono)) return <li className="zc-chip">{text}</li>;
  const [before, after] = text.split(mono);
  return (
    <li className="zc-chip">
      {before}
      <span className="zc-chip-mono">{mono}</span>
      {after}
    </li>
  );
}

/** Why trust it: four cards that stack on scroll from 768px, a plain list on phones. */
export function TrustCards() {
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useSpotlight(list);

  useEffect(() => {
    const el = list.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const reduce = window.matchMedia(MOTION_REDUCE);
    if (reduce.matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          (e.target as HTMLElement).dataset.live = e.isIntersecting ? "on" : "off";
        }
      },
      { threshold: 0.2 },
    );
    for (const s of el.querySelectorAll<HTMLElement>(".zc-scene")) io.observe(s);
    return () => io.disconnect();
  }, []);

  useGSAP(
    () => {
      const el = list.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add(`${MOTION_FULL} and ${STACK}`, () => {
        const slots = gsap.utils.toArray<HTMLElement>(".zc-tslot", el);
        const naturalTop = (j: number) => {
          const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
          let y = el.getBoundingClientRect().top + window.scrollY;
          for (let k = 0; k < j; k++) y += slots[k].offsetHeight + gap;
          return y;
        };
        slots.forEach((slot, i) => {
          if (i === slots.length - 1) return;
          const card = slot.querySelector<HTMLElement>(".zc-tcard");
          const dim = slot.querySelector<HTMLElement>(".zc-tdim");
          if (!card || !dim) return;
          gsap
            .timeline({
              scrollTrigger: {
                trigger: el,
                start: () => naturalTop(i + 1) - window.innerHeight * 0.9,
                end: () => naturalTop(i + 1) - window.innerHeight * 0.2,
                scrub: true,
                invalidateOnRefresh: true,
              },
            })
            .fromTo(card, { scale: 1 }, { scale: 0.955, ease: "none" }, 0)
            .fromTo(dim, { opacity: 0 }, { opacity: 0.35, ease: "none" }, 0);
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="trust" className="pv2-sec zc-trust" aria-labelledby="h-trust">
      <div className="pv2-wrap">
        <SectionHead
          id="h-trust"
          eyebrow="Why trust it"
          title="Built so you never have to trust us"
          lede="Every layer is built for privacy, and every line of it is open source."
        />
        <ol ref={list} className="zc-tlist zc-spotlist">
          {CARDS.map(({ key, num, label, title, body, chips, mono, caption, Scene }, i) => (
            <li key={key} className="zc-tslot" style={{ "--i": i } as CSSProperties}>
              <article
                className="zc-tcard pv2-card zc-spot pv2-ring corner-squircle"
                aria-labelledby={`zc-t-${key}`}
              >
                <span className="zc-tdim" aria-hidden="true" />
                <div className="zc-tgrid">
                  <div className="zc-tcopy">
                    <p className="zc-teye">
                      <span className="zc-tnum">{num}</span>
                      <span className="zc-tsep"> / </span>
                      <span className="zc-tlab">{label}</span>
                    </p>
                    <h3 id={`zc-t-${key}`} className="zc-th3">
                      {title}
                    </h3>
                    <p className="zc-tbody">{body}</p>
                    <ul className="zc-chips">
                      {chips.map((c) => (
                        <Chip key={c} text={c} mono={mono} />
                      ))}
                    </ul>
                  </div>
                  <figure className="zc-scene corner-squircle" aria-hidden="true">
                    <Scene />
                    <figcaption className="zc-cap">{caption}</figcaption>
                  </figure>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
