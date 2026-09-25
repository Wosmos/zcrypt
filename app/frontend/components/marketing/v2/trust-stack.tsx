"use client";

import { useRef, type ReactElement } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  FileLockedIcon,
  Key01Icon,
  Infinity01Icon,
  CloudUploadIcon,
  IncognitoIcon,
  RepositoryIcon,
  ViewOffSlashIcon,
  SourceCodeIcon,
  GitBranchIcon,
  ServerStack01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE } from "../preview/gsap";
import { cn } from "@/lib/utils";

/**
 * Why zcrypt: four cards that stack as you scroll, made touchable.
 *
 * Each card docks with a magnetic snap when it reaches its slot and the one
 * beneath recedes as the next covers it. Each visual is a small scene built
 * from the product's own icon set (Hugeicons), drawn on stroke by stroke and
 * then kept alive: a key flies into the locked file, a light runs the
 * infinity loop while accounts stack up beside it, repositories fan out
 * behind an incognito mark, and a source-to-server line draws itself to a
 * check. Three hard facts sit under each card as chips.
 *
 * Sticky pile-up and the recede are desktop only; phones get a plain stack.
 */
type Card = {
  num: string;
  label: string;
  heading: string;
  body: string;
  facts: string[];
  tone: string;
  scene: ReactElement;
  loop: (tl: gsap.core.Timeline, q: (s: string) => HTMLElement[]) => void;
};

function Ico({
  icon,
  size = 96,
  className,
  strokeWidth = 1.3,
}: {
  icon: IconSvgElement;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} className={className} />;
}

/** Stroke-by-stroke draw-on for every path inside the matched SVGs. */
function drawOn(tl: gsap.core.Timeline, svgs: HTMLElement[], at: number | string, duration = 1) {
  svgs.forEach((svg) => {
    const paths = Array.from(
      svg.querySelectorAll<SVGGeometryElement>("path, circle, rect, line, polyline"),
    );
    paths.forEach((p) => {
      const len = typeof p.getTotalLength === "function" ? p.getTotalLength() : 100;
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    });
    tl.to(paths, { strokeDashoffset: 0, duration, ease: "power2.out", stagger: 0.05 }, at);
  });
}

const CARDS: Card[] = [
  {
    num: "01",
    label: "ENCRYPTION",
    heading: "Encrypted before it ever leaves your device",
    body: "The key comes from your passphrase, on your device, and is never sent. AES-256-GCM detects tampering rather than just blocking it. There is no key on our side, so there is nothing for us to lose, leak or hand over.",
    facts: ["AES-256-GCM", "Key never leaves your device", "zstd before it seals"],
    tone: "text-cyan-500 dark:text-cyan-400",
    scene: (
      <div className="v2-scene">
        <div className="v2-scene-main s-file">
          <Ico icon={FileLockedIcon} size={128} />
        </div>
        <div className="v2-scene-float s-key">
          <Ico icon={Key01Icon} size={44} strokeWidth={1.6} />
        </div>
        <span className="v2-scene-label s-label">sealed on this device</span>
      </div>
    ),
    loop: (tl, q) => {
      drawOn(tl, q(".s-file svg"), 0, 1.2);
      tl.fromTo(
        q(".s-key"),
        { x: 150, y: -90, rotation: 40, opacity: 0 },
        { x: 150, y: -90, opacity: 1, duration: 0.3 },
        0.8,
      )
        .to(q(".s-key"), { x: 18, y: 14, rotation: 0, duration: 0.9, ease: "power3.inOut" }, 1.1)
        .to(q(".s-key"), { scale: 0.2, opacity: 0, duration: 0.3, ease: "power2.in" }, 1.95)
        .fromTo(
          q(".s-file"),
          { filter: "drop-shadow(0 0 0 rgba(0,213,228,0))" },
          { filter: "drop-shadow(0 0 22px rgba(0,213,228,0.7))", duration: 0.5 },
          2.1,
        )
        .fromTo(q(".s-label"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }, 2.3)
        .to({}, { duration: 1.6 })
        .to(q(".s-file, .s-label"), { opacity: 0, duration: 0.4 }, "+=0")
        .set(q(".s-file"), { opacity: 1, filter: "none" });
      tl.repeat(-1);
    },
  },
  {
    num: "02",
    label: "SCALE",
    heading: "Effectively unlimited storage",
    body: "Files are cut into pieces and uploaded in parallel. zcrypt watches how full each account is and opens a fresh repository before any platform limit. You are bounded only by the free space you already own, and Telegram has none.",
    facts: ["4 to 32 MiB pieces", "Repos rotate before they fill", "Telegram: no ceiling"],
    tone: "text-violet-500 dark:text-violet-400",
    scene: (
      <div className="v2-scene">
        <div className="v2-scene-main s-inf">
          <Ico icon={Infinity01Icon} size={140} strokeWidth={1.2} className="s-inf-track" />
          <Ico icon={Infinity01Icon} size={140} strokeWidth={1.6} className="s-inf-light" />
        </div>
        <div className="v2-scene-row">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="v2-scene-chip s-acct">
              <Ico icon={CloudUploadIcon} size={22} strokeWidth={1.6} />
            </span>
          ))}
        </div>
        <span className="v2-scene-label s-inf-label">every account is more room</span>
      </div>
    ),
    loop: (tl, q) => {
      const paths = q(".s-inf-light path");
      paths.forEach((p) => {
        const len = (p as unknown as SVGGeometryElement).getTotalLength();
        gsap.set(p, { strokeDasharray: `${len * 0.28} ${len}`, strokeDashoffset: 0 });
        tl.to(p, { strokeDashoffset: -len, duration: 3.4, ease: "none", repeat: -1 }, 0);
      });
      const chips = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
      chips
        .fromTo(
          q(".s-acct"),
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, stagger: 0.35, ease: "back.out(2.5)" },
        )
        .fromTo(
          q(".s-inf-label"),
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.4 },
          "-=0.2",
        )
        .to({}, { duration: 1.4 })
        .to(q(".s-acct, .s-inf-label"), { opacity: 0, duration: 0.4 });
      tl.add(chips, 0);
    },
  },
  {
    num: "03",
    label: "STEALTH",
    heading: "Nothing flags your vault",
    body: "Pieces are committed under plausible filenames, with ordinary commit messages, into repositories with unremarkable names. To anyone looking, your storage is one more quiet side project.",
    facts: ["Plausible filenames", "Ordinary commit messages", "Unremarkable repo names"],
    tone: "text-sky-500 dark:text-sky-400",
    scene: (
      <div className="v2-scene">
        <div className="v2-scene-fan">
          {["recipes-2024", "dotfiles", "notes-archive"].map((n, i) => (
            <div key={n} className={`v2-scene-repo s-repo s-repo-${i}`}>
              <Ico icon={RepositoryIcon} size={20} strokeWidth={1.6} />
              <span className="s-repo-name">{n}</span>
            </div>
          ))}
        </div>
        <div className="v2-scene-main s-mask">
          <Ico icon={IncognitoIcon} size={110} strokeWidth={1.2} />
        </div>
        <div className="v2-scene-float s-noeye">
          <Ico icon={ViewOffSlashIcon} size={30} strokeWidth={1.6} />
        </div>
      </div>
    ),
    loop: (tl, q) => {
      const names = [
        "recipes-2024",
        "dotfiles",
        "notes-archive",
        "quarterly-slides",
        "old-photos",
        "site-backup",
      ];
      let n = 2;
      // Fan width follows the tile so the labels never leave it on phones.
      const fan = () => (q(".v2-scene")[0].clientWidth < 420 ? 100 : 150);
      drawOn(tl, q(".s-mask svg"), 0, 1.1);
      tl.fromTo(
        q(".s-repo"),
        { xPercent: -50, x: 0, y: 0, opacity: 0 },
        {
          xPercent: -50,
          x: (i) => (i - 1) * fan(),
          y: (i) => Math.abs(i - 1) * 16,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: "back.out(1.5)",
        },
        0.5,
      ).fromTo(
        q(".s-noeye"),
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.5)" },
        1.3,
      );
      const shuffle = gsap.timeline({ repeat: -1, repeatDelay: 1.1 });
      shuffle
        .to(q(".s-repo-2"), { y: -30, scale: 0.9, duration: 0.35, ease: "power2.in" })
        .call(() => {
          n = (n + 1) % names.length;
          q(".s-repo-2 .s-repo-name")[0].textContent = names[n];
        })
        .to(q(".s-repo-2"), { y: 16, scale: 1, duration: 0.5, ease: "back.out(1.8)" });
      tl.add(shuffle, 2);
    },
  },
  {
    num: "04",
    label: "OPEN",
    heading: "Open source and self-hostable",
    body: "Audit the encryption yourself, or run the whole backend on your own machine. Bring-your-own-backend is available to everyone. Your trust is never assumed. It is earned by code you can read.",
    facts: ["Full source on GitHub", "Docker self-host in minutes", "Bring your own backend"],
    tone: "text-amber-500 dark:text-amber-400",
    scene: (
      <div className="v2-scene">
        <div className="v2-scene-row s-open-row">
          <span className="v2-scene-node s-node">
            <Ico icon={SourceCodeIcon} size={40} strokeWidth={1.4} />
          </span>
          <i className="v2-scene-wire s-wire" />
          <span className="v2-scene-node s-node">
            <Ico icon={GitBranchIcon} size={40} strokeWidth={1.4} />
          </span>
          <i className="v2-scene-wire s-wire" />
          <span className="v2-scene-node s-node">
            <Ico icon={ServerStack01Icon} size={40} strokeWidth={1.4} />
          </span>
        </div>
        <div className="v2-scene-float s-check">
          <Ico icon={CheckmarkCircle02Icon} size={36} strokeWidth={1.8} />
        </div>
        <span className="v2-scene-label s-open-label">read it, fork it, run it</span>
      </div>
    ),
    loop: (tl, q) => {
      drawOn(tl, q(".s-node svg"), 0, 0.9);
      tl.fromTo(
        q(".s-wire"),
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.5,
          stagger: 0.4,
          ease: "power2.out",
          transformOrigin: "left center",
        },
        0.6,
      )
        .fromTo(
          q(".s-check"),
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.5)" },
          1.6,
        )
        .fromTo(q(".s-open-label"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.4 }, 1.8)
        .to({}, { duration: 1.8 })
        .to(q(".s-wire, .s-check, .s-open-label"), { opacity: 0, duration: 0.4 })
        .set(q(".s-wire"), { opacity: 1, scaleX: 0 });
      tl.repeat(-1);
    },
  },
];

const stickyTop = (i: number) => 96 + i * 14;

export function TrustStack() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      const wireScenes = () => {
        const loops: gsap.core.Timeline[] = [];
        q(".v2-trust-card").forEach((card, i) => {
          const iq = (s: string) => gsap.utils.toArray<HTMLElement>(s, card);
          const tl = gsap.timeline({ paused: true });
          CARDS[i].loop(tl, iq);
          loops.push(tl);
          ScrollTrigger.create({
            trigger: card,
            start: "top 85%",
            end: "bottom 5%",
            onToggle: (st) => (st.isActive ? tl.play() : tl.pause()),
          });
        });
        return () => loops.forEach((t) => t.kill());
      };

      mm.add(`${MOTION_FULL} and (min-width: 768px)`, () => {
        const slots = q(".v2-trust-slot");
        const offScenes = wireScenes();
        const kills: (() => void)[] = [];

        slots.forEach((slot, i) => {
          const dock = slot.querySelector(".v2-trust-dock") as HTMLElement;
          const card = slot.querySelector(".v2-trust-card") as HTMLElement;

          // Magnetic dock: the last stretch of the arrival snaps with overshoot.
          if (i > 0) {
            const st = ScrollTrigger.create({
              trigger: slot,
              start: () => `top ${stickyTop(i) + 60}px`,
              onEnter: () =>
                gsap.fromTo(
                  dock,
                  { y: 26, scale: 0.985 },
                  { y: 0, scale: 1, duration: 0.7, ease: "back.out(2.4)" },
                ),
              onLeaveBack: () => gsap.to(dock, { y: 0, scale: 1, duration: 0.3 }),
            });
            kills.push(() => st.kill());
          }

          // Recede under the next card, scrubbed. Scale and lift only; the
          // card keeps its full brightness so the pile never goes muddy.
          const next = slots[i + 1];
          if (next) {
            const tw = gsap.to(card, {
              scale: 0.94,
              y: -14,
              ease: "none",
              scrollTrigger: { trigger: next, start: "top 95%", end: "top 18%", scrub: true },
            });
            kills.push(() => tw.kill());
          }

          // The scene tile leans toward the cursor.
          const tile = slot.querySelector(".v2-trust-visual") as HTMLElement;
          if (tile && window.matchMedia("(pointer: fine)").matches) {
            const x = gsap.quickTo(tile, "x", { duration: 0.6, ease: "power3.out" });
            const y = gsap.quickTo(tile, "y", { duration: 0.6, ease: "power3.out" });
            const rx = gsap.quickTo(tile, "rotationX", { duration: 0.6, ease: "power3.out" });
            const ry = gsap.quickTo(tile, "rotationY", { duration: 0.6, ease: "power3.out" });
            const move = (e: PointerEvent) => {
              const r = card.getBoundingClientRect();
              const px = (e.clientX - r.left) / r.width - 0.5;
              const py = (e.clientY - r.top) / r.height - 0.5;
              x(px * 18);
              y(py * 18);
              ry(px * 8);
              rx(-py * 8);
            };
            const leave = () => {
              x(0);
              y(0);
              rx(0);
              ry(0);
            };
            card.addEventListener("pointermove", move);
            card.addEventListener("pointerleave", leave);
            kills.push(() => {
              card.removeEventListener("pointermove", move);
              card.removeEventListener("pointerleave", leave);
            });
          }
        });

        return () => {
          offScenes();
          kills.forEach((k) => k());
        };
      });

      mm.add(`${MOTION_FULL} and (max-width: 767px)`, () => wireScenes());

      mm.add(MOTION_REDUCE, () => {
        // Final frames, nothing moving: strokes drawn, floats visible, wires full.
        gsap.set(q(".v2-scene svg *"), { strokeDasharray: "none", strokeDashoffset: 0 });
        gsap.set(q(".v2-scene-float, .v2-scene-label, .s-acct, .s-repo"), { opacity: 1 });
        gsap.set(q(".s-repo"), {
          xPercent: -50,
          x: (i) => (i - 1) * 150,
          y: (i) => Math.abs(i - 1) * 16,
        });
        gsap.set(q(".s-wire"), { scaleX: 1 });
        gsap.set(q(".s-key"), { opacity: 0 });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="v2-trust px-4 py-24 sm:px-6 sm:py-28" id="why">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
            Why zcrypt
          </p>
          <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
            Built so you never have to trust us.
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            Every layer built for privacy, and every line of it open source.
          </p>
        </div>

        <div className="space-y-8 lg:space-y-10">
          {CARDS.map((card, i) => (
            <div
              key={card.num}
              className="v2-trust-slot md:sticky"
              style={{ top: stickyTop(i), zIndex: i + 1 }}
            >
              <div className="v2-trust-dock">
                <article className="v2-trust-card vault-slab">
                  <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12">
                    <div className="min-w-0">
                      <span className="font-mono text-xs tracking-[0.1em] text-[var(--color-accent)]">
                        {card.num} / {card.label}
                      </span>
                      <h3 className="font-heading mt-4 text-2xl font-semibold tracking-tight text-[var(--color-text)] sm:text-3xl">
                        {card.heading}
                      </h3>
                      <p className="mt-3 leading-relaxed text-[var(--color-text-secondary)]">
                        {card.body}
                      </p>
                      <ul className="mt-5 flex flex-wrap gap-2">
                        {card.facts.map((f) => (
                          <li
                            key={f}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-1 text-[12px] text-[var(--color-text-secondary)]"
                          >
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={cn("v2-trust-visual", card.tone)}>{card.scene}</div>
                  </div>
                </article>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
