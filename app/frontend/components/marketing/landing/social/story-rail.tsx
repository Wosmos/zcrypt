"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "@/lib/icons";
import { useReducedMotion } from "motion/react";
import { SectionHead } from "../section-head";
import { STORY_SCENES } from "./story-icons";

const BEATS: readonly { n: string }[] = [{ n: "01" }, { n: "02" }, { n: "03" }, { n: "04" }];

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The maker's story as a native, swipeable rail of four cards. */
export function StoryRail() {
  const t = useTranslations("site");
  const railRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const still = useReducedMotion();
  const [live, setLive] = useState(false);
  const [near, setNear] = useState<readonly boolean[]>(() => BEATS.map((_, i) => i === 0));
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const cards = useCallback(
    () => Array.from(railRef.current?.querySelectorAll<HTMLElement>("[data-beat]") ?? []),
    [],
  );

  const padStart = useCallback(() => {
    const rail = railRef.current;
    return rail ? Number.parseFloat(getComputedStyle(rail).scrollPaddingInlineStart) || 0 : 0;
  }, []);

  const startOffset = useCallback((rail: HTMLElement, el: HTMLElement) => {
    const rtl = getComputedStyle(rail).direction === "rtl";
    return rtl ? rail.scrollWidth - el.offsetLeft - el.offsetWidth : el.offsetLeft;
  }, []);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const x = Math.abs(rail.scrollLeft);
    setAtStart(x <= 2);
    setAtEnd(x >= max - 2);
    const list = cards();
    if (x >= max - 2) {
      setActive(list.length - 1);
      return;
    }
    const pad = padStart();
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    list.forEach((el, i) => {
      const dist = Math.abs(startOffset(rail, el) - pad - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  }, [cards, padStart, startOffset]);

  const goTo = useCallback(
    (i: number) => {
      const rail = railRef.current;
      const list = cards();
      const target = list[Math.max(0, Math.min(list.length - 1, i))];
      if (!rail || !target) return;
      const offset = startOffset(rail, target) - padStart();
      rail.scrollTo({
        left: getComputedStyle(rail).direction === "rtl" ? -offset : offset,
        behavior: reduceMotion() ? "auto" : "smooth",
      });
    },
    [cards, padStart, startOffset],
  );

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  useEffect(() => {
    const rail = railRef.current;
    const section = sectionRef.current;
    if (!rail || !section || typeof IntersectionObserver === "undefined") return;
    const list = cards();
    const focus = new IntersectionObserver(
      (entries) => {
        const updates = new Map<number, boolean>();
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const isNear = e.intersectionRatio >= 0.6;
          el.dataset.near = isNear ? "true" : "false";
          updates.set(list.indexOf(el), isNear);
        }
        setNear((prev) => prev.map((v, i) => updates.get(i) ?? v));
      },
      { root: rail, threshold: [0, 0.6, 1] },
    );
    list.forEach((el) => focus.observe(el));
    const seen = new IntersectionObserver(([e]) => setLive(Boolean(e?.isIntersecting)), {
      threshold: 0.2,
    });
    seen.observe(section);
    return () => {
      focus.disconnect();
      seen.disconnect();
    };
  }, [cards]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === back) {
      e.preventDefault();
      goTo(active - 1);
    }
  };

  const progress = (
    <div className="zs-segs">
      {BEATS.map((b, i) => (
        <button
          key={b.n}
          type="button"
          className="zs-seg"
          aria-label={t("home.story.goTo", { n: i + 1 })}
          aria-current={i === active ? "step" : undefined}
          data-on={i === active ? "true" : undefined}
          onClick={() => goTo(i)}
        >
          <span className="zs-seg-bar" aria-hidden="true" />
        </button>
      ))}
    </div>
  );

  return (
    <section ref={sectionRef} id="why" className="pv2-sec zs-why" aria-labelledby="h-why">
      <div className="pv2-wrap zs-why-top">
        <SectionHead
          id="h-why"
          eyebrow={t("home.story.eyebrow")}
          title={t("home.story.title")}
          align="left"
          className="zs-why-head"
        />
        <div className="zs-why-ctrl">
          {progress}
          <div className="zs-arrows">
            <button
              type="button"
              className="zs-round"
              aria-label={t("home.story.prev")}
              disabled={atStart}
              onClick={() => goTo(active - 1)}
            >
              <ChevronLeft className="size-5 rtl:-scale-x-100" />
            </button>
            <button
              type="button"
              className="zs-round"
              aria-label={t("home.story.next")}
              disabled={atEnd}
              onClick={() => goTo(active + 1)}
            >
              <ChevronRight className="size-5 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={railRef}
        className="zs-rail"
        role="region"
        aria-label={t("home.story.rail")}
        tabIndex={0}
        onKeyDown={onKey}
      >
        {BEATS.map((b, i) => {
          const Scene = STORY_SCENES[i];
          return (
            <article
              key={b.n}
              data-beat={b.n}
              className="zs-beat pv2-card pv2-ring corner-squircle"
              aria-labelledby={`zs-beat-${b.n}`}
            >
              <div className="zs-beat-stage">
                <span className="zs-beat-n" aria-hidden="true">
                  {b.n}
                </span>
                <Scene play={live && !still && near[i] === true} />
              </div>
              <div className="zs-beat-copy">
                <h3 id={`zs-beat-${b.n}`} className="zs-beat-h">
                  <span className="sr-only">{t("home.story.part", { n: i + 1 })} </span>
                  {t(`home.story.beats.${i}.title`)}
                </h3>
                <p className="zs-beat-p">{t(`home.story.beats.${i}.body`)}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="pv2-wrap">
        <div className="zs-why-mseg">{progress}</div>
        <div className="zs-sign">
          <p className="zs-sign-line">{t("home.story.sign")}</p>
          <p className="zs-sign-meta">
            <span className="zs-sign-name">Wosmo</span>
            <span aria-hidden="true"> · </span>
            <Link href="/about" className="zs-link">
              {t("home.story.longer")}
              <ArrowRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
