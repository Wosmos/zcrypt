"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  percent: number;
  stage?: string;
  eta?: string;
  variant?: "default" | "accent" | "success";
  className?: string;
}

const barColors = {
  default: "bg-[var(--color-text-muted)]",
  accent: "bg-indigo-500",
  success: "bg-emerald-500",
};

/**
 * Perceived-speed progress bar:
 * - Smoothly interpolates toward the real value
 * - Slowly creeps forward between real updates (optimistic)
 * - Shimmer overlay makes it look alive even when stalled
 */
export function ProgressBar({
  percent,
  stage,
  eta,
  variant = "accent",
  className,
}: ProgressBarProps) {
  const real = Math.min(100, Math.max(0, percent));
  const [visual, setVisual] = useState(real);
  const rafRef = useRef<number>(0);
  const lastRealRef = useRef(real);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    lastRealRef.current = real;
    setVisual((v) => Math.max(v, real));
  }, [real]);

  // Slow optimistic creep: advance ~0.3%/sec when idle, never exceed real+5 or 99
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setVisual((v) => {
        const target = lastRealRef.current;
        if (target >= 100) return 100;
        const cap = Math.min(target + 5, 99);
        const next = v + 0.3 * dt;
        return Math.min(next, cap);
      });

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const clamped = Math.min(100, Math.max(0, Math.round(visual)));

  return (
    <div className={cn("w-full", className)}>
      {(stage || eta) && (
        <div className="flex justify-between text-[11px] text-[var(--color-text-secondary)] mb-1.5">
          <span className="capitalize font-medium">{stage}</span>
          <div className="flex items-center gap-2">
            {eta && (
              <span className="text-[var(--color-text-muted)]">{eta}</span>
            )}
            <span className="tabular-nums">{clamped}%</span>
          </div>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className="relative h-full rounded-full transition-[width] duration-700 ease-out overflow-hidden"
          style={{ width: `${Math.max(clamped, 1)}%` }}
        >
          <div className={cn("absolute inset-0", barColors[variant])} />

          {/* Shimmer overlay — keeps bar looking alive even when stalled */}
          {clamped < 100 && (
            <div
              className="absolute inset-0 animate-progress-shimmer"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
