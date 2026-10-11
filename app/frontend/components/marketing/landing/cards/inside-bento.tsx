"use client";

import { type ComponentType, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MOTION_REDUCE } from "@/components/marketing/landing/gsap";
import { SectionHead } from "@/components/marketing/landing/section-head";
import {
  DriveVignette,
  LockVignette,
  ResumeVignette,
  SendVignette,
  ShareVignette,
  SpacesVignette,
} from "./bento-vignettes";
import { useSpotlight } from "./use-spotlight";

type Tile = {
  key: string;
  size: "hero" | "wide" | "one";
  Vignette: ComponentType;
};

const TILES: readonly Tile[] = [
  { key: "drive", size: "hero", Vignette: DriveVignette },
  { key: "lock", size: "one", Vignette: LockVignette },
  { key: "share", size: "one", Vignette: ShareVignette },
  { key: "send", size: "one", Vignette: SendVignette },
  { key: "spaces", size: "one", Vignette: SpacesVignette },
  { key: "resume", size: "wide", Vignette: ResumeVignette },
];

/** What's inside: six feature tiles, two rows deep on desktop. */
export function InsideBento() {
  const t = useTranslations("site");
  const grid = useRef<HTMLDivElement>(null);
  useSpotlight(grid);

  useEffect(() => {
    const el = grid.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia(MOTION_REDUCE).matches) return;
    const tiles = Array.from(el.querySelectorAll<HTMLElement>(".zc-tile"));
    const later = tiles.filter((t) => t.getBoundingClientRect().top > window.innerHeight * 0.92);
    for (const t of later) t.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        shown.forEach((t, k) => {
          t.style.setProperty("--zc-d", `${Math.min(k, 5) * 50}ms`);
          t.dataset.reveal = "in";
          io.unobserve(t);
        });
      },
      { threshold: 0.15 },
    );
    for (const t of later) io.observe(t);
    return () => {
      io.disconnect();
      for (const t of later) delete t.dataset.reveal;
    };
  }, []);

  return (
    <section
      id="inside"
      className="pv2-sec zc-inside"
      aria-labelledby="h-inside"
      data-nav-tone="busy"
    >
      <div className="pv2-wrap">
        <SectionHead
          id="h-inside"
          eyebrow={t("home.bento.eyebrow")}
          title={t("home.bento.title")}
          lede={t("home.bento.lede")}
        />
        <div ref={grid} className="zc-bento zc-spotlist">
          {TILES.map(({ key, size, Vignette }) => (
            <article
              key={key}
              className={`zc-tile zc-tile-${key} zc-tile-${size} zc-spot pv2-ring corner-squircle`}
              aria-labelledby={`zc-b-${key}`}
            >
              <span className="zc-edge" aria-hidden="true" />
              <div className="zc-tin">
                <div className="zc-well corner-squircle" aria-hidden="true">
                  <div className="zc-vg">
                    <Vignette />
                  </div>
                </div>
                <div className="zc-tt">
                  <p className="zc-kick">{t(`home.bento.tiles.${key}.kicker`)}</p>
                  <h3 id={`zc-b-${key}`} className="zc-bh3">
                    {t(`home.bento.tiles.${key}.title`)}
                  </h3>
                  <p className="zc-sent">{t(`home.bento.tiles.${key}.sentence`)}</p>
                  <p className="zc-short">{t(`home.bento.tiles.${key}.short`)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
