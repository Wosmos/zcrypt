"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_FULL, MOTION_REDUCE, hexChar } from "./gsap";
import { Lock } from "@/lib/icons";
import { GitHubIcon, GitLabIcon, HuggingFaceIcon, TelegramIcon } from "./platform-marks";

/**
 * The signature scene: one file becomes eight sealed pieces in four places.
 *
 * Pinned for three viewports and scrubbed, so the visitor drives it. Scroll
 * forward and the card locks, fractures into tiles, and the tiles fly along
 * depth to the four platform nodes. Scroll back and it reassembles. That
 * reversibility is the point: it is a mechanism you can inspect, not a video.
 *
 * Three lines beside it say what each phase means, in plain words, and the
 * acronym never appears. The whole pipeline (chunk, compress, encrypt, hash,
 * push) is on the /developers page for people who want it.
 */
const TILES = 8;
// x/y are in a unit grid multiplied by SPREAD for both the node positions and
// the tile targets, so a tile always lands on its node. z is shallow enough
// that the nodes stay legible under perspective; at -300 they shrank to dots.
const SPREAD = 6;
const NODES = [
  { key: "github", Icon: GitHubIcon, x: -36, y: -30, z: -140 },
  { key: "gitlab", Icon: GitLabIcon, x: 36, y: -26, z: -190 },
  { key: "huggingface", Icon: HuggingFaceIcon, x: -32, y: 32, z: -170 },
  { key: "telegram", Icon: TelegramIcon, x: 34, y: 30, z: -120 },
];

export function PipelineScene() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const q = gsap.utils.selector(el);
      const mm = gsap.matchMedia();

      // Where each tile goes: two per node, with a little spread so they do not
      // stack into one shape.
      const targets = Array.from({ length: TILES }, (_, i) => {
        const n = NODES[i % NODES.length];
        const side = i < NODES.length ? -1 : 1;
        return {
          x: n.x * SPREAD + side * 18,
          y: n.y * SPREAD + side * 12,
          z: n.z,
          rot: side * 14,
        };
      });

      mm.add(MOTION_FULL, () => {
        gsap.set(q(".vault-tile"), { x: 0, y: 0, z: 0, opacity: 0, rotationY: 0 });
        gsap.set(q(".vault-node"), { opacity: 0.35, z: -200, scale: 0.9 });
        gsap.set(q(".pipe-step"), { opacity: 0.55 });
        gsap.set(q(".pipe-card"), { rotationY: -14, rotationX: 6 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: "top top",
            end: "+=260%",
            pin: q(".pipe-pin"),
            scrub: 0.8,
            anticipatePin: 1,
          },
          defaults: { ease: "power1.inOut" },
        });

        tl
          // Phase 1: lock. The card squares up and the lock lights.
          .to(q(".pipe-card"), { rotationY: 0, rotationX: 0, duration: 1 }, 0)
          .to(q(".pipe-lock"), { scale: 1.15, duration: 0.4 }, 0.6)
          .to(q(".pipe-lock"), { scale: 1, duration: 0.4 }, 1)
          .to(q(".pipe-step-1"), { opacity: 1, duration: 0.4 }, 0.4)
          // Phase 2: fracture. The whole slab (face AND glass) fades as the
          // tiles take its place; leaving the empty glass behind read as a
          // second object hanging in the scene. Tiles shrink and spread far
          // enough that gaps open between them, which is what makes eight
          // rectangles read as one thing coming apart.
          .to(q(".pipe-face, .pipe-lock"), { opacity: 0, duration: 0.6 }, 1.4)
          .to(q(".vault-tile"), { opacity: 1, duration: 0.5, stagger: 0.03 }, 1.4)
          .to(
            q(".vault-tile"),
            {
              x: (i) => ((i % 4) - 1.5) * 34,
              y: (i) => (Math.floor(i / 4) - 0.5) * 44,
              z: 60,
              scale: 0.82,
              rotationZ: (i) => ((i * 53) % 9) - 4,
              duration: 0.8,
            },
            1.7,
          )
          .to(q(".pipe-step-1"), { opacity: 0.55, duration: 0.3 }, 1.6)
          .to(q(".pipe-step-2"), { opacity: 1, duration: 0.4 }, 1.7)
          // Phase 3: scatter to the nodes, which light up as tiles arrive.
          .to(
            q(".vault-tile"),
            {
              x: (i) => targets[i].x,
              y: (i) => targets[i].y,
              z: (i) => targets[i].z,
              rotationY: (i) => targets[i].rot,
              scale: 0.55,
              duration: 1.4,
              stagger: 0.06,
              ease: "power2.inOut",
            },
            2.6,
          )
          .to(q(".vault-node"), { opacity: 1, z: (i) => NODES[i].z, scale: 1, duration: 1.2 }, 2.8)
          .add(() => q(".vault-node").forEach((n) => n.classList.add("is-lit")), 3.6)
          .to(q(".pipe-step-2"), { opacity: 0.55, duration: 0.3 }, 2.8)
          .to(q(".pipe-step-3"), { opacity: 1, duration: 0.4 }, 3.0)
          .to({}, { duration: 0.6 });

        // Un-light nodes when scrubbing back before the arrival point.
        tl.eventCallback("onUpdate", () => {
          if (tl.time() < 3.6) q(".vault-node").forEach((n) => n.classList.remove("is-lit"));
        });

        return () => tl.kill();
      });

      mm.add(MOTION_REDUCE, () => {
        // Final frame: tiles at the nodes, nodes lit, all three steps on.
        gsap.set(q(".pipe-face, .pipe-lock"), { opacity: 0 });
        gsap.set(q(".vault-tile"), {
          opacity: 1,
          scale: 0.55,
          x: (i) => targets[i].x,
          y: (i) => targets[i].y,
          z: (i) => targets[i].z,
        });
        gsap.set(q(".vault-node"), { opacity: 1, scale: 1, z: (i) => NODES[i].z });
        q(".vault-node").forEach((n) => n.classList.add("is-lit"));
        gsap.set(q(".pipe-step"), { opacity: 1 });
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
      <div className="pipe-pin relative h-dvh w-full overflow-hidden">
        <div className="mx-auto grid h-full max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Steps */}
          <div className="relative z-10">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
              What actually happens
            </p>
            <h2 className="font-heading mt-3 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              Your file never travels whole.
            </h2>
            <ol className="mt-8 space-y-5">
              {[
                [
                  "1",
                  "Locked on your device.",
                  "Sealed with a key only you hold, before a byte leaves.",
                ],
                ["2", "Split into pieces.", "Cut into pieces. No piece means anything alone."],
                [
                  "3",
                  "Stored in accounts you own.",
                  "Kept in storage that is yours. We hold a map, never the contents.",
                ],
              ].map(([n, t, d]) => (
                <li key={n} className={`pipe-step pipe-step-${n} flex gap-4`}>
                  <span className="font-mono text-sm text-[var(--color-accent)]">0{n}</span>
                  <div>
                    <p className="font-semibold text-[var(--color-text)]">{t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {d}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
              Scroll to drive it. Scroll back to undo it.
            </p>
          </div>

          {/* Scene */}
          <div className="vault-scene relative h-[420px] sm:h-[520px]" aria-hidden="true">
            <div className="vault-stage absolute inset-0">
              {/* Platform nodes on a receding grid */}
              {NODES.map(({ key, Icon, x, y }) => (
                <div
                  key={key}
                  className="vault-node"
                  style={{
                    left: `calc(50% + ${x * SPREAD}px)`,
                    top: `calc(50% + ${y * SPREAD}px)`,
                    marginLeft: -28,
                    marginTop: -28,
                  }}
                >
                  <Icon className="h-6 w-6" />
                </div>
              ))}

              {/* The file card */}
              {/* The card is a bare positioned container so it can hold the
                  tiles after the file is gone. The glass lives on the face and
                  fades with it; otherwise an empty slab hung in the scene. */}
              <div className="pipe-card absolute left-1/2 top-1/2 h-[220px] w-[300px] -translate-x-1/2 -translate-y-1/2 [transform-style:preserve-3d] sm:h-[260px] sm:w-[360px]">
                <div className="pipe-face vault-slab absolute inset-0 flex flex-col p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      On your device
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                      1.2 GB
                    </span>
                  </div>
                  <p className="mt-4 text-lg font-semibold text-[var(--color-text)]">
                    wedding-photos.zip
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {[92, 74, 86, 60].map((w, i) => (
                      <div
                        key={i}
                        className="h-1.5 rounded-full bg-[var(--color-surface-3)]"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                  <p className="mt-auto font-mono text-[10px] text-[var(--color-text-muted)]">
                    {Array.from({ length: 28 }, (_, i) => hexChar(i + 3)).join("")}
                  </p>
                </div>

                {/* Lock node on the card's seam */}
                <div className="pipe-lock vault-lock absolute -right-4 top-1/2 -translate-y-1/2">
                  <Lock className="h-3.5 w-3.5" />
                </div>

                {/* The eight tiles, laid over the card in a 4x2 grid, invisible
                    until the fracture phase. */}
                {Array.from({ length: TILES }, (_, i) => (
                  <div
                    key={i}
                    className="vault-tile"
                    style={{
                      left: `${(i % 4) * 25}%`,
                      top: `${Math.floor(i / 4) * 50}%`,
                      width: "25%",
                      height: "50%",
                    }}
                  >
                    <span className="absolute inset-x-2 bottom-2 truncate font-mono text-[9px] leading-none text-[var(--color-accent)]/70">
                      {Array.from({ length: 10 }, (_, k) => hexChar(k + i * 17)).join("")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
