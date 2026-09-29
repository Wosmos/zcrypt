"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "@/lib/icons";
import { useReducedMotion } from "motion/react";
import { SectionHead } from "../section-head";
import { STORY_SCENES } from "./story-icons";

type Beat = { n: string; title: string; body: string };

const BEATS: readonly Beat[] = [
  {
    n: "01",
    title: "I ran out of room",
    body: "Google Drive tapped me on the shoulder at 15 GB and asked for my card. So I made a second account. Then a third. For a week I was splitting one folder across three logins like a low-budget digital smuggler.",
  },
  {
    n: "02",
    title: "The free terabyte came with fine print",
    body: "TeraBox said one terabyte, free. What they did not say: the download button is hidden like a state secret, and the fine print treats your files as theirs to scan and learn from.",
  },
  {
    n: "03",
    title: "Then it failed at 80 percent",
    body: "I uploaded a 4 GB folder, watched it crawl to 80 percent, and watched it fail. My first thought was not “let me retry”. It was “why am I handing my life to a company whose business is knowing what’s inside it”.",
  },
  {
    n: "04",
    title: "The price tag was me",
    body: "Free storage was never free. I just hadn't read the price tag. So I built the one with no limit and nobody reading it.",
  },
];

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The maker's story as a native, swipeable rail of four cards. */
export function StoryRail() {
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

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const x = rail.scrollLeft;
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
      const dist = Math.abs(el.offsetLeft - pad - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  }, [cards, padStart]);

  const goTo = useCallback(
    (i: number) => {
      const rail = railRef.current;
      const list = cards();
      const target = list[Math.max(0, Math.min(list.length - 1, i))];
      if (!rail || !target) return;
      rail.scrollTo({
        left: target.offsetLeft - padStart(),
        behavior: reduceMotion() ? "auto" : "smooth",
      });
    },
    [cards, padStart],
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
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === "ArrowLeft") {
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
          aria-label={`Go to part ${i + 1}`}
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
          eyebrow="Why this exists"
          title="Free storage was never free"
          align="left"
          className="zs-why-head"
        />
        <div className="zs-why-ctrl">
          {progress}
          <div className="zs-arrows">
            <button
              type="button"
              className="zs-round"
              aria-label="Previous part"
              disabled={atStart}
              onClick={() => goTo(active - 1)}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className="zs-round"
              aria-label="Next part"
              disabled={atEnd}
              onClick={() => goTo(active + 1)}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={railRef}
        className="zs-rail"
        role="region"
        aria-label="The story, in four parts"
        tabIndex={0}
        onKeyDown={onKey}
      >
        {BEATS.map((b, i) => {
          const Scene = STORY_SCENES[i];
          return (
            <article
              key={b.n}
              data-beat={b.n}
              className="zs-beat pv2-ring corner-squircle"
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
                  <span className="sr-only">Part {i + 1}: </span>
                  {b.title}
                </h3>
                <p className="zs-beat-p">{b.body}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="pv2-wrap">
        <div className="zs-why-mseg">{progress}</div>
        <div className="zs-sign">
          <p className="zs-sign-line">There is a team. It&apos;s me.</p>
          <p className="zs-sign-meta">
            <span className="zs-sign-name">Wosmo</span>
            <span aria-hidden="true"> · </span>
            <Link href="/about" className="zs-link">
              Read the longer version
              <ArrowRight className="size-3.5" />
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
