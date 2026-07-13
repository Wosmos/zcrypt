"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./scroll-reveal";
import { STORAGE_PLATFORMS } from "./storage-platforms";

// BYOB is the core of the model: zcrypt never sells storage. Encrypted chunks
// live in accounts the user already owns — shown as a beam diagram from "your
// device" to the platforms (each with its real capacity). A given file's chunks
// stay within one repo on one platform; zcrypt rotates to fresh repos as they
// fill. The diagram represents where your library lives, not one file split
// across every cloud at once.

// Beams drawn in real pixel coordinates (viewBox = measured size) so the node
// stays a true circle and the curves aren't distorted.
const TARGET_FRACTIONS = [0.12, 0.37, 0.63, 0.88];

function FanBeams() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { w, h } = box;
  const startX = 96; // just right of the device node
  // Long horizontal lead-in, then a compact fan near the cards (capped ~220px)
  // so the beams don't stretch shallowly across the whole width.
  const splitX = Math.max(w * 0.45, w - 220);
  const midY = h / 2;
  const cx = (splitX + w) / 2;
  const path = (y: number) =>
    `M${startX} ${midY} L${splitX} ${midY} C ${cx} ${midY}, ${cx} ${y}, ${w} ${y}`;
  const targets = TARGET_FRACTIONS.map((f) => h * f);

  return (
    <div ref={ref} className="absolute inset-0">
      {w > 0 && (
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden
        >
          {targets.map((y, i) => (
            <path
              key={`rail-${i}`}
              d={path(y)}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={1.5}
            />
          ))}
          {targets.map((y, i) => (
            <path
              key={`flow-${i}`}
              d={path(y)}
              fill="none"
              stroke="rgb(6 182 212)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="6 16"
              className="animate-flow-dash"
              style={{ "--delay": `${i * 0.16}s` } as React.CSSProperties}
            />
          ))}
          <circle cx={splitX} cy={midY} r={4} fill="rgb(6 182 212)" />
        </svg>
      )}
    </div>
  );
}

export function BringYourOwnStorage() {
  return (
    <section className="px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <ScrollReveal className=" mx-auto mb-14 max-w-2xl text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Bring your own storage
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Encrypted chunks.{" "}
            <span className="inline-block bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text pb-1 text-transparent dark:from-cyan-400 dark:to-cyan-300">
              Storage you already own.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-[var(--color-text-secondary)]">
            After encryption, your files are split into ~10 MB chunks and stored as
            ordinary-looking objects across repos in your own GitHub, GitLab,
            Hugging Face, and Telegram accounts — zcrypt rotates to fresh repos on
            its own as they fill.
          </p>
        </ScrollReveal>

        {/* Fan-out diagram */}
        <ScrollReveal delay={0.1}>
          <div className="mx-auto flex max-w-4xl items-stretch">
            {/* Device + beams (desktop only) */}
            <div className="relative hidden min-h-[300px] flex-1 lg:block">
              <div className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center">
                <div className="grid h-[88px] w-[88px] place-items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Monitor className="h-9 w-9" />
                </div>
                <span className="mt-3 whitespace-nowrap font-mono text-[0.72rem] text-[var(--color-text-muted)]">
                  your device
                </span>
              </div>

              <FanBeams />
            </div>

            {/* Platform targets */}
            <div className="flex w-full flex-col gap-3 lg:w-[380px] lg:flex-shrink-0">
              {STORAGE_PLATFORMS.map((b) => {
                const Icon = b.Icon;
                return (
                  <div
                    key={b.name}
                    className="group flex items-center gap-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-all hover:translate-x-1 hover:border-cyan-500/40"
                  >
                    <div
                      className={cn(
                        "grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]",
                        b.colorClass
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold tracking-tight">{b.name}</h3>
                      <p className="font-mono text-[0.7rem] text-[var(--color-text-muted)]">
                        {b.capacity}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
