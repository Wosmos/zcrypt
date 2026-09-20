"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Lock } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The hero visual: five ordinary files crossing the line, one after another.
 *
 * The old hero had no product on screen at all, only a claim. This shows the
 * claim happening instead. Filenames are deliberately human (a passport scan, a
 * tax return, wedding photos) because the previous page never named a single
 * thing a normal person owns, which is most of why a non-coder read it as a
 * developer tool.
 *
 * The scramble is cosmetic and says so: it is a visual of sealing, not a live
 * encryption. The real encryptor, running actual crypto.subtle on a file the
 * visitor picks, lives further down the page where there is room to be honest
 * about it.
 */
const HEX = "0123456789abcdef";

const FILES = [
  { name: "passport-scan.pdf", size: "2.4 MB" },
  { name: "tax-return-2025.pdf", size: "880 KB" },
  { name: "wedding-photos.zip", size: "1.2 GB" },
  { name: "lease-signed.pdf", size: "310 KB" },
  { name: "savings.xlsx", size: "44 KB" },
];

/** Deterministic pseudo-hex, seeded by position, so no Math.random in render. */
function hexFor(seed: number, length: number): string {
  let out = "";
  let x = seed * 2654435761;
  for (let i = 0; i < length; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    out += HEX[x % 16];
  }
  return out;
}

export function CrossingPanel() {
  const reduce = useReducedMotion();
  // How many rows have crossed. Starts at 0, walks to FILES.length, then holds.
  const [sealed, setSealed] = useState(0);
  const [tick, setTick] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    // Reduced motion gets the finished state immediately: the information is
    // "these end up unreadable", and that survives without the animation.
    if (reduce) {
      setSealed(FILES.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setSealed(i);
      if (i >= FILES.length) clearInterval(id);
    }, 520);
    return () => clearInterval(id);
  }, [reduce]);

  // Drives the frontier character re-randomising. Cheap: one state bump per
  // 90ms only while rows are still crossing.
  useEffect(() => {
    if (reduce || sealed >= FILES.length) return;
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, [reduce, sealed]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div
      className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]"
      aria-label="Five files being sealed on the device before upload"
    >
      {/* The single motif: the vertical line the files cross, with the lock node.
          Repeated in the boundary section further down so the page reads as one
          idea rather than a stack of unrelated cards. */}
      <div className="pointer-events-none absolute inset-y-6 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[var(--color-accent)]/45 to-transparent sm:block">
        <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-surface)]">
          <Lock className="h-3 w-3 text-[var(--color-accent)]" />
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between px-3 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          Your device
        </span>
        <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-muted)]">
          What we store
        </span>
      </div>

      {/* Both sides are on screen at once, permanently. An earlier version
          transformed each row in place, which meant that a few seconds after
          load the column headed "Your device" was showing ciphertext, flatly
          contradicting its own label. The comparison has to survive arriving
          late, so the filename stays and the ciphertext appears beside it. */}
      <ul className="space-y-1">
        {FILES.map((f, i) => {
          const done = i < sealed;
          const cipher = hexFor(i + 1 + (done ? 0 : tick), 14);
          return (
            <li
              key={f.name}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-500",
                done ? "bg-[var(--color-surface-1)]" : "bg-transparent",
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500",
                    done ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-muted)]/40",
                  )}
                />
                <span className="truncate text-sm text-[var(--color-text)]">{f.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {f.size}
                </span>
              </span>

              <span
                className={cn(
                  "truncate text-right font-mono text-[12px] transition-opacity duration-500",
                  done ? "text-[var(--color-text-muted)] opacity-100" : "opacity-0",
                )}
              >
                {cipher}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="px-3 pb-2 pt-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        Left is what you see. Right is everything we hold. We never have the key.
      </p>
    </div>
  );
}
