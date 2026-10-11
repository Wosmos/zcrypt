"use client";

import { type CSSProperties, type ReactElement, type ReactNode, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { gsap, useGSAP, MOTION_FULL, MOTION_REDUCE } from "@/components/marketing/landing/gsap";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { EncryptScene, ScaleScene, StealthScene, OpenScene } from "./trust-scenes";
import { useSpotlight } from "./use-spotlight";

type Card = {
  key: string;
  num: string;
  chips: number;
  Scene: () => ReactElement;
};

const CARDS: readonly Card[] = [
  { key: "encryption", num: "01", chips: 4, Scene: EncryptScene },
  { key: "scale", num: "02", chips: 3, Scene: ScaleScene },
  { key: "stealth", num: "03", chips: 3, Scene: StealthScene },
  { key: "open", num: "04", chips: 3, Scene: OpenScene },
];

const STACK = "(min-width: 768px) and (min-height: 600px)";

/** Why trust it: four cards that stack on scroll from 768px, a plain list on phones. */
export function TrustCards() {
  const t = useTranslations("site");
  const mono = (chunks: ReactNode) => <span className="zc-chip-mono">{chunks}</span>;
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
          eyebrow={t("home.trust.eyebrow")}
          title={t("home.trust.title")}
          lede={t("home.trust.lede")}
        />
        <ol ref={list} className="zc-tlist zc-spotlist">
          {CARDS.map(({ key, num, chips, Scene }, i) => (
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
                      <span className="zc-tlab">{t(`home.trust.cards.${key}.label`)}</span>
                    </p>
                    <h3 id={`zc-t-${key}`} className="zc-th3">
                      {t(`home.trust.cards.${key}.title`)}
                    </h3>
                    <p className="zc-tbody">{t(`home.trust.cards.${key}.body`)}</p>
                    <ul className="zc-chips">
                      {Array.from({ length: chips }, (_, c) => (
                        <li key={c} className="zc-chip">
                          {t.rich(`home.trust.cards.${key}.chips.${c}`, { m: mono })}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <figure className="zc-scene corner-squircle" aria-hidden="true">
                    <Scene />
                    <figcaption className="zc-cap">
                      {t(`home.trust.cards.${key}.caption`)}
                    </figcaption>
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
