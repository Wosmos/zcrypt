"use client";

import Link from "next/link";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE } from "./gsap";
import { DecodeText } from "./decode-text";
import { ArrowRight, Check, Lock } from "@/lib/icons";

/**
 * The hero. A vault door that the visitor opens by scrolling.
 *
 * The section is pinned for two viewports. As you scroll, the two steel leaves
 * swing open on real hinges (rotateY around their outer edges), the light
 * leaking through the seam floods the frame, and the camera pushes forward
 * into the room behind. The headline, CTAs and trust row live on the dark half
 * so price, promise and action are all on screen one, then part with the
 * leaves so the visitor is carried through rather than past.
 *
 * Everything is CSS 3D on the compositor: two planes, a glow layer, and a
 * receding grid. No canvas. The H1 is real text from first paint.
 *
 * Reduced motion: the door is shown already open, the room visible, nothing
 * pinned. The information survives without the reveal.
 */
const TRUST = ["Free forever", "No card", "Nothing to install", "Open source"];

export function VaultDoor() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      mm.add(MOTION_FULL, () => {
        gsap.set(q(".vault-leaf-l"), { rotationY: -4 });
        gsap.set(q(".vault-leaf-r"), { rotationY: 4 });
        gsap.set(q(".vault-room"), { opacity: 0.2, z: -400 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=180%",
            pin: q(".vault-pin"),
            scrub: 0.6,
            anticipatePin: 1,
          },
          defaults: { ease: "none" },
        });

        tl
          // Leaves swing open on their hinges.
          .to(q(".vault-leaf-l"), { rotationY: -108 }, 0)
          .to(q(".vault-leaf-r"), { rotationY: 108 }, 0)
          // Light through the gap blooms, then settles as the room takes over.
          // Capped well under full: at 1.0 the bloom flooded the frame flat
          // cyan and the headline dropped below readable contrast.
          .to(q(".vault-glow"), { opacity: 0.55, scale: 1.25 }, 0)
          .to(q(".vault-glow"), { opacity: 0.22, scale: 1.1 }, 0.55)
          // Camera pushes through.
          .to(q(".vault-stage"), { z: 520 }, 0)
          .to(q(".vault-room"), { opacity: 0.9, z: 0 }, 0.15)
          // Copy rides the leaves, then hands off.
          .to(q(".vault-copy"), { opacity: 0, y: -40, z: 200 }, 0.55);

        return () => tl.kill();
      });

      mm.add(MOTION_REDUCE, () => {
        gsap.set(q(".vault-leaf-l"), { rotationY: -100 });
        gsap.set(q(".vault-leaf-r"), { rotationY: 100 });
        gsap.set(q(".vault-glow"), { opacity: 0.5, scale: 1.4 });
        gsap.set(q(".vault-room"), { opacity: 0.85 });
      });

      return () => {
        mm.revert();
        ScrollTrigger.refresh();
      };
    },
    { scope: root },
  );

  return (
    <div ref={root} className="vault relative">
      {/* The pinned frame. Height is the viewport; the trigger element above it
          provides the scroll runway so nothing shifts when pinning begins. */}
      <div className="vault-pin relative h-dvh w-full overflow-hidden bg-[var(--color-bg)]">
        <div className="vault-scene absolute inset-0">
          <div className="vault-stage absolute inset-0">
            {/* The room, furthest back. */}
            <div className="vault-room" aria-hidden="true" />

            {/* Light leaking through the seam. */}
            <div className="vault-glow" aria-hidden="true" />

            {/* The door. */}
            <div className="vault-door" aria-hidden="true">
              <div className="vault-leaf vault-leaf-l" />
              <div className="vault-leaf vault-leaf-r" />
            </div>

            {/* The seam itself, with the lock, sitting in front of the leaves so
                it reads as the thing that opens. Fades as the leaves part. */}
            <div className="pointer-events-none absolute inset-y-[14%] left-[var(--seam-x)] w-px -translate-x-1/2">
              <div className="vault-seam h-full w-px" />
              <div className="vault-lock absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Lock className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Copy. Positioned over the door, not inside a leaf, so it can leave
            on its own path. */}
        <div className="vault-copy relative z-10 mx-auto flex h-full max-w-6xl flex-col justify-center px-6 pt-28 pb-16 sm:pt-32">
          <Link
            href="/about"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] backdrop-blur transition-colors hover:border-[var(--color-accent)]/40"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-[10px] font-bold text-[var(--color-on-accent)]">
              W
            </span>
            Wasif, Karachi. Built this after losing a 4 GB upload at 80 percent.
          </Link>

          <h1 className="font-heading mt-7 max-w-3xl text-[2.75rem] font-bold leading-[1.02] tracking-[-0.03em] text-[var(--color-text)] sm:text-6xl lg:text-[4.5rem]">
            <DecodeText trigger="mount" duration={1.1} as="span" className="block">
              Free cloud storage
            </DecodeText>
            <DecodeText trigger="mount" delay={0.35} duration={1.1} as="span" className="block">
              that cannot read your files.
            </DecodeText>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            Not &ldquo;we promise not to look.&rdquo; I built it so I can&apos;t. Everything is
            locked on your device before it uploads. Start in one click: no card, no setup, no
            storage account to plug in.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-accent)] px-7 py-3.5 text-base font-semibold text-[var(--color-on-accent)] shadow-[0_0_40px_-10px_var(--color-accent)] transition-opacity hover:opacity-90"
            >
              Start free, no card
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#the-line"
              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 px-6 py-3.5 text-base font-medium text-[var(--color-text)] backdrop-blur transition-colors hover:border-[var(--color-accent)]/50"
            >
              Watch it encrypt
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-text-muted)]">
            {TRUST.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                {t}
              </span>
            ))}
          </div>

          <p className="mt-10 flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
            <span className="inline-block h-4 w-px animate-pulse bg-[var(--color-accent)]" />
            Scroll to open
          </p>
        </div>
      </div>
    </div>
  );
}
