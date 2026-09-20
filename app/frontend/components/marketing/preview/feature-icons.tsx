"use client";

import { useRef, type ReactElement } from "react";
import { gsap, useGSAP, MOTION_FULL } from "./gsap";

/**
 * Six features, each with an icon that does the thing it describes.
 *
 * The Proton Drive influence: features as a calm grid with small, purposeful
 * icon animations rather than a bento of gradients. Each icon is inline SVG
 * with named parts, and a GSAP timeline plays it once when the tile scrolls in
 * and again on hover. The motion is the explanation: the lock closes, the file
 * splits, the key turns. A non-coder gets the idea before reading the caption.
 *
 * All strokes use currentColor so the tiles inherit theme tokens, and every
 * animation is transform or opacity only. Reduced motion: icons render in
 * their finished state and never move.
 */
type Feature = {
  key: string;
  title: string;
  body: string;
  Icon: (props: { className?: string }) => ReactElement;
  play: (tl: gsap.core.Timeline, q: (s: string) => HTMLElement[]) => void;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FEATURES: Feature[] = [
  {
    key: "lock",
    title: "Locked before it leaves",
    body: "Sealed on your device. What travels is unreadable to everyone, including us.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <rect className="i-body" x="10" y="21" width="28" height="19" rx="4" {...stroke} />
        <path className="i-shackle" d="M16 21v-5a8 8 0 0 1 16 0v5" {...stroke} />
        <circle className="i-dot" cx="24" cy="31" r="2.2" fill="currentColor" />
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(q(".i-shackle"), { y: -7 }, { y: 0, duration: 0.45, ease: "back.out(2)" }).fromTo(
        q(".i-dot"),
        { scale: 0, transformOrigin: "center" },
        { scale: 1, duration: 0.3, ease: "back.out(3)" },
        "-=0.1",
      );
    },
  },
  {
    key: "split",
    title: "Split into pieces",
    body: "Cut into pieces before storage. No single piece means anything on its own.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            className={`i-piece i-piece-${i}`}
            x={12 + (i % 2) * 13}
            y={12 + Math.floor(i / 2) * 13}
            width="11"
            height="11"
            rx="2.5"
            {...stroke}
          />
        ))}
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-piece"),
        { x: (i) => (i % 2 ? -6 : 6), y: (i) => (i < 2 ? 6 : -6), opacity: 0.4 },
        { x: 0, y: 0, opacity: 1, duration: 0.6, ease: "power3.out", stagger: 0.05 },
      ).to(
        q(".i-piece"),
        {
          x: (i) => (i % 2 ? 4 : -4),
          y: (i) => (i < 2 ? -4 : 4),
          duration: 0.5,
          ease: "power2.inOut",
        },
        "+=0.2",
      );
    },
  },
  {
    key: "key",
    title: "Only you hold the key",
    body: "Derived from your passphrase, stored nowhere. Not on your device, not on ours.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <g className="i-key" style={{ transformOrigin: "19px 24px" }}>
          <circle cx="19" cy="24" r="7" {...stroke} />
          <path d="M26 24h13M34 24v5M39 24v4" {...stroke} />
        </g>
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-key"),
        { rotation: -35 },
        { rotation: 0, duration: 0.7, ease: "back.out(1.6)" },
      )
        // Turn, then settle back. Left at 90 the key reads as a stray glyph
        // once the motion is over; the turn is the message, not the angle.
        .to(q(".i-key"), { rotation: 90, duration: 0.4, ease: "power2.inOut" }, "+=0.15")
        .to(q(".i-key"), { rotation: 0, duration: 0.5, ease: "power3.out" }, "+=0.2");
    },
  },
  {
    key: "resume",
    title: "Picks up where it dropped",
    body: "Drop the connection at 80 percent and it carries on from 80 percent.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path d="M10 30h28" {...stroke} opacity="0.3" />
        <path className="i-bar" d="M10 30h28" {...stroke} strokeWidth={3} />
        <circle className="i-head" cx="10" cy="30" r="3" fill="currentColor" />
        <path className="i-arrow" d="M24 14l4 4-4 4M28 18h-8" {...stroke} />
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-bar"),
        { strokeDasharray: 28, strokeDashoffset: 28 },
        { strokeDashoffset: 6, duration: 0.7, ease: "power1.inOut" },
      )
        .fromTo(q(".i-head"), { x: 0 }, { x: 22, duration: 0.7, ease: "power1.inOut" }, "<")
        .to(q(".i-head"), { opacity: 0.3, duration: 0.15, yoyo: true, repeat: 1 })
        .to(q(".i-bar"), { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" })
        .to(q(".i-head"), { x: 28, duration: 0.35, ease: "power2.out" }, "<")
        .fromTo(q(".i-arrow"), { opacity: 0, x: -4 }, { opacity: 1, x: 0, duration: 0.3 }, "-=0.2");
    },
  },
  {
    key: "own",
    title: "Stored where you already are",
    body: "Your pieces live in accounts you own. If zcrypt vanished, your files would not.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path
          className="i-cloud"
          d="M16 34a7 7 0 0 1-1-13.9A9 9 0 0 1 32 18a6.5 6.5 0 0 1 1 13"
          {...stroke}
        />
        <path className="i-down" d="M24 22v14M19 31l5 5 5-5" {...stroke} />
        <path className="i-base" d="M14 40h20" {...stroke} />
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-down"),
        { y: -8, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
      ).fromTo(
        q(".i-base"),
        { scaleX: 0, transformOrigin: "center" },
        { scaleX: 1, duration: 0.4, ease: "power2.out" },
        "-=0.2",
      );
    },
  },
  {
    key: "open",
    title: "Nothing to trust, only to check",
    body: "The code is open and the ciphertext is on this page. Never take my word for it.",
    Icon: ({ className }) => (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        <path className="i-brace-l" d="M18 12l-7 12 7 12" {...stroke} />
        <path className="i-brace-r" d="M30 12l7 12-7 12" {...stroke} />
        <path className="i-check" d="M20 25l3 3 6-7" {...stroke} />
      </svg>
    ),
    play: (tl, q) => {
      tl.fromTo(
        q(".i-brace-l"),
        { x: 6, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" },
      )
        .fromTo(
          q(".i-brace-r"),
          { x: -6, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" },
          "<",
        )
        .fromTo(
          q(".i-check"),
          { strokeDasharray: 14, strokeDashoffset: 14 },
          { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" },
          "-=0.1",
        );
    },
  },
];

export function FeatureIcons() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const mm = gsap.matchMedia();

      mm.add(MOTION_FULL, () => {
        const tiles = gsap.utils.toArray<HTMLElement>(".feat", el);
        const cleanups: (() => void)[] = [];

        tiles.forEach((tile, i) => {
          const f = FEATURES[i];
          const q = (s: string) => gsap.utils.toArray<HTMLElement>(s, tile);
          const build = () => {
            const tl = gsap.timeline({ paused: true });
            f.play(tl, q);
            return tl;
          };
          let tl = build();

          gsap.timeline({
            scrollTrigger: {
              trigger: tile,
              start: "top 85%",
              once: true,
              onEnter: () => tl.play(0),
            },
          });

          const replay = () => {
            tl.kill();
            tl = build();
            tl.play(0);
          };
          tile.addEventListener("pointerenter", replay);
          cleanups.push(() => tile.removeEventListener("pointerenter", replay));
        });

        return () => cleanups.forEach((c) => c());
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <div ref={root} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map(({ key, title, body, Icon }) => (
        <div
          key={key}
          className="feat vault-slab group p-6 transition-transform duration-300 hover:-translate-y-0.5"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-[var(--color-accent)] ring-1 ring-[var(--color-border)] transition-colors group-hover:ring-[var(--color-accent)]/40 group-hover:shadow-[0_0_28px_-8px_var(--color-accent)]">
            <Icon className="h-9 w-9" />
          </div>
          <h3 className="mt-5 text-base font-semibold text-[var(--color-text)]">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{body}</p>
        </div>
      ))}
    </div>
  );
}
