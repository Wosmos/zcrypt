"use client";

import { useRef, type ReactElement } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE } from "../preview/gsap";
import { EightyPercent } from "../preview/eighty-percent";

/**
 * Why this exists, as a strip you scroll sideways through.
 *
 * Four beats, each carried by an icon that acts the beat out rather than a
 * number in a box: a drive that fills and locks, a gift that turns out to be
 * an eye, the 80 percent bar that dies (the real demo, embedded), and a price
 * tag that flips to read YOU. Icons play once as their card slides into view
 * and again on hover.
 *
 * The strip is pinned and driven by scroll on desktop. Reduced motion, and
 * every phone, get a vertical stack with the icons in their final state.
 */
type Beat = {
  n: string;
  t: string;
  p: string;
  icon: ReactElement;
  play: (tl: gsap.core.Timeline, q: (s: string) => HTMLElement[]) => void;
  demo?: boolean;
};

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const BEATS: Beat[] = [
  {
    n: "01",
    t: "I ran out of room",
    p: "Google Drive tapped me on the shoulder at 15 GB and asked for my card. So I made a second account. Then a third. For a week I was splitting one folder across three logins like a low-budget digital smuggler.",
    icon: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path
          className="i-cloud"
          d="M36 86a20 20 0 0 1-3-39.7A26 26 0 0 1 83 40a18 18 0 0 1 3 46"
          {...S}
        />
        <rect
          className="i-track"
          x="34"
          y="60"
          width="52"
          height="10"
          rx="5"
          {...S}
          opacity="0.35"
        />
        <rect className="i-fill" x="34" y="60" width="52" height="10" rx="5" fill="currentColor" />
        <g className="i-lock" style={{ transformOrigin: "60px 90px" }}>
          <rect x="50" y="86" width="20" height="14" rx="3" {...S} />
          <path d="M54 86v-4a6 6 0 0 1 12 0v4" {...S} />
        </g>
        <text
          className="i-full"
          x="60"
          y="112"
          textAnchor="middle"
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize="10"
          fill="currentColor"
        >
          15 GB FULL
        </text>
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-fill"),
        { scaleX: 0, transformOrigin: "34px 65px" },
        { scaleX: 1, duration: 1.1, ease: "power1.inOut" },
      )
        .fromTo(
          q(".i-lock"),
          { scale: 0 },
          { scale: 1, duration: 0.4, ease: "back.out(3)" },
          "-=0.1",
        )
        .fromTo(q(".i-full"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, "<")
        .to(q(".i-cloud"), { x: -2, duration: 0.06, yoyo: true, repeat: 5 }, "<");
    },
  },
  {
    n: "02",
    t: "The free terabyte had a catch",
    p: "TeraBox said one terabyte, free. What they did not say: the download button is hidden like a state secret, and the fine print treats your files as theirs to scan and learn from.",
    icon: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <rect className="i-box" x="24" y="50" width="72" height="50" rx="6" {...S} />
        <g className="i-lid" style={{ transformOrigin: "24px 50px" }}>
          <rect x="18" y="36" width="84" height="16" rx="4" {...S} />
          <path d="M60 36v16" {...S} />
        </g>
        <path className="i-ribbon" d="M60 52v48" {...S} />
        <text
          className="i-tb"
          x="60"
          y="82"
          textAnchor="middle"
          fontFamily="ui-monospace, Menlo, monospace"
          fontSize="12"
          fontWeight="700"
          fill="currentColor"
        >
          1 TB
        </text>
        <g className="i-eye" style={{ transformOrigin: "60px 74px" }}>
          <path d="M40 74c8-11 32-11 40 0-8 11-32 11-40 0Z" {...S} />
          <circle cx="60" cy="74" r="5" fill="currentColor" />
        </g>
      </svg>
    ),
    play: (tl, q) => {
      tl.set(q(".i-eye"), { scale: 0, opacity: 0 })
        .fromTo(
          q(".i-lid"),
          { rotation: 0 },
          { rotation: -70, duration: 0.6, ease: "back.out(1.4)" },
          0.3,
        )
        .to(q(".i-tb, .i-ribbon"), { opacity: 0, duration: 0.3 }, 0.55)
        .to(q(".i-eye"), { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, 0.75)
        .to(
          q(".i-eye circle"),
          { x: -4, duration: 0.5, yoyo: true, repeat: 3, ease: "sine.inOut" },
          1.2,
        );
    },
  },
  {
    n: "03",
    t: "Then it failed at 80 percent",
    p: "I uploaded a 4 GB folder, watched it crawl to 80 percent, and watched it fail. My first thought was not let me retry. It was why am I handing my life to a company whose business is knowing what is inside it.",
    icon: <span />,
    play: () => {},
    demo: true,
  },
  {
    n: "04",
    t: "The price tag was me",
    p: "Free storage was never free. I just had not read the price tag. Privacy is not a feature these companies forgot to add. It is the thing they quietly sell against. So I built the one with no limit and no one reading it.",
    icon: (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <g className="i-tag" style={{ transformOrigin: "60px 60px" }}>
          <path d="M30 30h34l30 30-34 34-30-30V30Z" {...S} />
          <circle cx="44" cy="44" r="4" fill="currentColor" />
          <text
            className="i-free"
            x="66"
            y="70"
            textAnchor="middle"
            fontFamily="var(--font-heading), sans-serif"
            fontSize="15"
            fontWeight="800"
            fill="currentColor"
            transform="rotate(45 66 70)"
          >
            FREE
          </text>
          <text
            className="i-you"
            x="66"
            y="70"
            textAnchor="middle"
            fontFamily="var(--font-heading), sans-serif"
            fontSize="17"
            fontWeight="800"
            fill="currentColor"
            transform="rotate(45 66 70)"
          >
            YOU
          </text>
        </g>
      </svg>
    ),
    play: (tl, q) => {
      tl.set(q(".i-you"), { opacity: 0 })
        .fromTo(
          q(".i-tag"),
          { rotation: -8 },
          { rotation: 6, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 },
        )
        .to(q(".i-tag"), { scaleX: 0, duration: 0.25, ease: "power2.in" }, 1.1)
        .set(q(".i-free"), { opacity: 0 })
        .set(q(".i-you"), { opacity: 1 })
        .to(q(".i-tag"), { scaleX: 1, duration: 0.35, ease: "back.out(1.8)" });
    },
  },
];

export function StoryStrip() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      const wireIcons = (containerAnimation?: gsap.core.Tween) => {
        const cleanups: (() => void)[] = [];
        gsap.utils.toArray<HTMLElement>(".v2-beat", el).forEach((card, i) => {
          const beat = BEATS[i];
          if (beat.demo) return;
          const iq = (s: string) => gsap.utils.toArray<HTMLElement>(s, card);
          let tl: gsap.core.Timeline | null = null;
          const build = () => {
            tl?.kill();
            tl = gsap.timeline({ paused: true });
            beat.play(tl, iq);
            return tl;
          };
          ScrollTrigger.create({
            trigger: card,
            containerAnimation,
            start: containerAnimation ? "left 70%" : "top 80%",
            once: true,
            onEnter: () => build().play(0),
          });
          const replay = () => build().play(0);
          card.addEventListener("pointerenter", replay);
          cleanups.push(() => card.removeEventListener("pointerenter", replay));
        });
        return () => cleanups.forEach((c) => c());
      };

      mm.add(`${MOTION_FULL} and (min-width: 761px)`, () => {
        const track = q(".v2-story-track")[0];
        const distance = () => track.scrollWidth - window.innerWidth;
        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: () => "+=" + distance(),
            pin: q(".v2-story-pin")[0],
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        const off = wireIcons(tween);
        return () => {
          off();
          tween.kill();
        };
      });

      mm.add(`${MOTION_FULL} and (max-width: 760px)`, () => {
        el.classList.add("v2-story-static");
        const off = wireIcons();
        return () => {
          off();
          el.classList.remove("v2-story-static");
        };
      });

      mm.add(MOTION_REDUCE, () => {
        el.classList.add("v2-story-static");
        // Final frames without motion.
        gsap.set(q(".i-lock, .i-eye"), { scale: 1, opacity: 1 });
        gsap.set(q(".i-lid"), { rotation: -70 });
        gsap.set(q(".i-tb, .i-ribbon, .i-free"), { opacity: 0 });
        gsap.set(q(".i-you, .i-full"), { opacity: 1 });
        return () => el.classList.remove("v2-story-static");
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="v2-story relative" id="story">
      <div className="v2-story-pin">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
            Why this exists
          </p>
          <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
            Free storage was never free.
          </h2>
        </div>
        <div className="v2-story-track">
          {BEATS.map((b) => (
            <article key={b.n} className="v2-beat vault-slab">
              <div className="flex items-start justify-between gap-4">
                {b.demo ? (
                  <span className="font-mono text-sm text-[var(--color-accent)]">{b.n}</span>
                ) : (
                  <div className="v2-beat-icon">{b.icon}</div>
                )}
                {!b.demo && (
                  <span className="font-mono text-sm text-[var(--color-accent)]">{b.n}</span>
                )}
              </div>
              <div>
                <h3 className="font-heading font-bold text-[var(--color-text)]">{b.t}</h3>
                <p className="mt-3 max-w-[58ch] leading-relaxed text-[var(--color-text-secondary)]">
                  {b.p}
                </p>
                {b.demo && (
                  <div className="mt-6">
                    <EightyPercent />
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
