"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE, hexChar } from "../preview/gsap";
import { Lock } from "@/lib/icons";
import { GitHubIcon, GitLabIcon, HuggingFaceIcon, TelegramIcon } from "../preview/platform-marks";

/**
 * How is it unlimited? The signature scene.
 *
 * One file card. Scroll, and it squares up and takes a lock. Scroll on, and
 * the card is cut into four tall strips, each carrying a slice of ciphertext.
 * Scroll on, and the strips slide down onto four platform marks, sink into
 * them, and the marks light. That is the whole mechanism, in one picture a
 * non-coder can follow: your file never travels whole, and every account you
 * connect is another place a strip can go.
 *
 * Pinned, scrubbed both ways. Landing points are measured from the live
 * layout so the strips land dead centre on any width.
 */
const MARKS = [
  { key: "github", label: "GitHub", Icon: GitHubIcon },
  { key: "gitlab", label: "GitLab", Icon: GitLabIcon },
  { key: "huggingface", label: "Hugging Face", Icon: HuggingFaceIcon },
  { key: "telegram", label: "Telegram", Icon: TelegramIcon },
];
const STEPS = [
  ["Sealed on your device.", "Locked with a key only you hold, before a byte leaves."],
  ["Cut into pieces.", "No piece means anything on its own."],
  [
    "Spread across accounts you already own.",
    "One piece here, one there. Connect another account and there is more room. That is why there is no limit.",
  ],
];

export function PipelineV2() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();
      const steps = q(".v2-steps li");
      const light = (n: number) => () =>
        steps.forEach((s, i) => s.classList.toggle("is-on", i < n));
      const card = q(".v2-pfile")[0];
      const pieces = q(".v2-piece");
      const marks = q(".v2-mark");

      // Where a strip lands: dead centre on its ring. Measured live, and the
      // delta is added to the strip's current transform.
      const landing = (i: number, tile: HTMLElement) => {
        const a = tile.getBoundingClientRect();
        const b = (marks[i].querySelector(".ring") as HTMLElement).getBoundingClientRect();
        return {
          x: Number(gsap.getProperty(tile, "x")) + (b.left + b.width / 2 - (a.left + a.width / 2)),
          y: Number(gsap.getProperty(tile, "y")) + (b.top + b.height / 2 - (a.top + a.height / 2)),
        };
      };

      mm.add(MOTION_FULL, () => {
        gsap.set(card, { rotationY: -18, rotationX: 8 });
        gsap.set(pieces, { opacity: 0 });
        gsap.set(marks, { opacity: 0.45 });
        gsap.set(q(".v2-plock"), { scale: 0 });
        light(0)();

        const tl = gsap.timeline({
          defaults: { ease: "power1.inOut" },
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=220%",
            pin: q(".v2-pipe-pin")[0],
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.call(light(1), undefined, 0)
          .to(card, { rotationY: 0, rotationX: 0, duration: 1 }, 0)
          .to(q(".v2-plock"), { scale: 1, duration: 0.4, ease: "back.out(2)" }, 0.7)
          .call(light(2), undefined, 1.4)
          .to(q(".v2-pface, .v2-plock"), { opacity: 0, duration: 0.5 }, 1.4)
          .to(pieces, { opacity: 1, duration: 0.4, stagger: 0.05 }, 1.4)
          .to(pieces, { x: (i) => (i - 1.5) * 14, scale: 0.9, duration: 0.6 }, 1.7)
          .call(light(3), undefined, 2.6)
          .to(
            pieces,
            {
              x: (i, t) => landing(i, t as HTMLElement).x,
              y: (i, t) => landing(i, t as HTMLElement).y,
              scale: 0.3,
              duration: 1.2,
              stagger: 0.08,
              ease: "power2.inOut",
            },
            2.6,
          )
          .to(marks, { opacity: 1, duration: 0.6, stagger: 0.08 }, 3.0)
          .to(
            pieces,
            { scale: 0.08, opacity: 0, duration: 0.35, stagger: 0.08, ease: "power2.in" },
            3.85,
          )
          .call(() => marks.forEach((m) => m.classList.add("is-lit")), undefined, 3.95)
          .to({}, { duration: 0.6 });

        tl.eventCallback("onUpdate", () => {
          if (tl.time() < 3.95) marks.forEach((m) => m.classList.remove("is-lit"));
        });
        const onInit = () => tl.invalidate();
        ScrollTrigger.addEventListener("refreshInit", onInit);
        return () => {
          ScrollTrigger.removeEventListener("refreshInit", onInit);
          tl.kill();
        };
      });

      mm.add(MOTION_REDUCE, () => {
        light(3)();
        gsap.set(q(".v2-pface, .v2-plock"), { opacity: 0 });
        gsap.set(pieces, { opacity: 0 });
        gsap.set(marks, { opacity: 1 });
        marks.forEach((m) => m.classList.add("is-lit"));
        const pin = q(".v2-pipe-pin")[0];
        pin.style.height = "auto";
        pin.style.minHeight = "0";
        pin.style.paddingBlock = "6rem";
      });

      return () => {
        mm.revert();
        ScrollTrigger.refresh();
      };
    },
    { scope: root },
  );

  return (
    <section ref={root} className="v2-pipe relative" id="how">
      <div className="v2-pipe-pin">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="relative z-10">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
              How is it unlimited?
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
              Your file never travels whole.
            </h2>
            <ol className="v2-steps mt-8 space-y-5">
              {STEPS.map(([t, d], i) => (
                <li key={t}>
                  <span className="font-mono text-sm text-[var(--color-accent)]">0{i + 1}</span>
                  <div>
                    <p className="font-semibold text-[var(--color-text)]">{t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {d}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="v2-pipe-hint mt-8 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
              Scroll to drive it. Scroll back to undo it.
            </p>
          </div>

          <div className="v2-pipe-scene" aria-hidden="true">
            <div className="v2-pipe-stage">
              <div className="v2-pfile">
                <div className="v2-pface">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      On your device
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                      2.4 MB
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-[var(--color-text)]">
                    passport-scan.pdf
                  </p>
                  <div className="mt-auto space-y-1.5">
                    {[88, 64, 76, 42].map((w) => (
                      <i key={w} style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
                <span className="v2-plock">
                  <Lock className="h-4 w-4" />
                </span>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="v2-piece" style={{ left: `${i * 25}%` }}>
                    {Array.from({ length: 24 }, (_, k) => hexChar(k + i * 31)).join("")}
                  </div>
                ))}
              </div>

              <div className="v2-marks">
                {MARKS.map(({ key, label, Icon }) => (
                  <div key={key} className="v2-mark">
                    <span className="ring vault-node">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="lbl">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
