"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The signature moment: the same 4 GB upload, twice.
 *
 * Left is what happened to Wasif on TeraBox. It crawls, reaches 80 percent,
 * stalls, and dies. Right is the same file here: it drops its connection at
 * chunk five and resumes from chunk five instead of zero.
 *
 * This is the one thing on the page that needs no decoding. Everybody has
 * watched an upload fail near the end, and nobody needs "resumable chunked
 * transfer" explained after seeing it. That is why it sits where the story
 * reaches the 4 GB failure rather than in a features grid.
 *
 * Runs once, when scrolled into view, so it is not already over by the time
 * anyone arrives. Reduced motion gets both end states with no animation.
 */
const CHUNKS = 8;
const DROP_AT = 5;

export function EightyPercent() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();

  const [leftPct, setLeftPct] = useState(0);
  const [leftDead, setLeftDead] = useState(false);
  const [rightChunks, setRightChunks] = useState(0);
  const [dropped, setDropped] = useState(false);
  const [rightDone, setRightDone] = useState(false);

  useEffect(() => {
    if (reduce) {
      setLeftPct(80);
      setLeftDead(true);
      setRightChunks(CHUNKS);
      setRightDone(true);
      return;
    }
    if (!inView) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Left: fast to 55, then visibly labours to 80, then dies. The deceleration
    // is the point; a linear bar that stops would read as a loading state.
    const leftSteps: [number, number][] = [
      [300, 55],
      [700, 66],
      [1100, 73],
      [1500, 77],
      [1900, 79],
      [2300, 80],
    ];
    leftSteps.forEach(([at, pct]) => timers.push(setTimeout(() => setLeftPct(pct), at)));
    timers.push(setTimeout(() => setLeftDead(true), 3400));

    // Right: discrete chunks, a real stall at five, then resume from five.
    for (let i = 1; i <= DROP_AT; i++) {
      timers.push(setTimeout(() => setRightChunks(i), 300 + i * 260));
    }
    timers.push(setTimeout(() => setDropped(true), 300 + DROP_AT * 260 + 150));
    timers.push(setTimeout(() => setDropped(false), 300 + DROP_AT * 260 + 750));
    for (let i = DROP_AT + 1; i <= CHUNKS; i++) {
      timers.push(
        setTimeout(() => setRightChunks(i), 300 + DROP_AT * 260 + 750 + (i - DROP_AT) * 260),
      );
    }
    timers.push(
      setTimeout(
        () => setRightDone(true),
        300 + DROP_AT * 260 + 750 + (CHUNKS - DROP_AT) * 260 + 200,
      ),
    );

    return () => timers.forEach(clearTimeout);
  }, [inView, reduce]);

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2">
      {/* Left: the thing that failed */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          The free cloud I was using
        </p>
        <p className="mt-3 truncate text-sm text-[var(--color-text)]">4 GB of photos</p>
        <div className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">4.00 GB</div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-500 ease-out",
              leftDead ? "bg-red-500" : "bg-[var(--color-text-muted)]",
            )}
            style={{ width: `${leftPct}%` }}
          />
        </div>

        <p
          className={cn(
            "mt-3 text-sm transition-colors",
            leftDead ? "text-red-500" : "text-[var(--color-text-muted)]",
          )}
        >
          {leftDead ? "Upload failed. Start again." : `${leftPct}%`}
        </p>
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-[13px] text-[var(--color-text-muted)]">
          Four gigabytes. Fifty minutes. Nothing saved.
        </p>
      </div>

      {/* Right: the same file here */}
      <div className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)] p-5">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-accent)]">
          The same file here
        </p>
        <p className="mt-3 truncate text-sm text-[var(--color-text)]">4 GB of photos</p>
        <div className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">
          4.00 GB, sealed on your device
        </div>

        {/* Discrete chunks, because "it resumes" only lands if you can see the
            pieces it resumes from. */}
        <div className="mt-4 flex gap-1" aria-hidden="true">
          {Array.from({ length: CHUNKS }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors duration-300",
                i < rightChunks ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-3)]",
              )}
            />
          ))}
        </div>

        <p
          className={cn(
            "mt-3 text-sm transition-colors",
            dropped ? "text-amber-500" : "text-[var(--color-text-muted)]",
          )}
        >
          {dropped
            ? "Connection dropped"
            : rightDone
              ? "Sealed and stored. Nothing to redo."
              : `Chunk ${rightChunks} of ${CHUNKS}`}
        </p>
        <p className="mt-4 border-t border-[var(--color-border)] pt-3 text-[13px] text-[var(--color-text-muted)]">
          Dropped at chunk five. Carried on from chunk five.
        </p>
      </div>
    </div>
  );
}
