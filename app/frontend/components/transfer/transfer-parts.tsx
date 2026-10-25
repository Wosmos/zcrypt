"use client";

import type { ReactNode } from "react";
import { useCachedThumbnail } from "@/hooks/useThumbnail";
import { extOf } from "@/lib/media-formats";
import { cn } from "@/lib/utils";

/** Semantic colours shared by every part of the panel. */
export const TONE = {
  ok: "var(--toast-success)",
  err: "var(--toast-error)",
  warn: "var(--toast-warning)",
  accent: "var(--color-accent)",
  waiting: "var(--color-surface-3)",
  track: "var(--color-surface-2)",
} as const;

/** One coloured share of a segmented bar or ring. */
export interface Segment {
  id: string;
  count: number;
  color: string;
  title: string;
}

/** A circular progress ring with optional centre content. */
export function ProgressRing({
  size,
  stroke,
  percent,
  color = TONE.accent,
  children,
}: {
  size: number;
  stroke: number;
  percent: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(100, Math.max(0, percent));
  return (
    <span
      className="relative inline-grid flex-none place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
        />
      </svg>
      {children}
    </span>
  );
}

/** The batch's segmented bar: each share shows its count on hover. */
export function SegmentBar({ segments, className }: { segments: Segment[]; className?: string }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
  return (
    <div
      className={cn(
        "flex h-[7px] gap-[2px] overflow-hidden rounded-full bg-[var(--color-surface-2)]",
        className,
      )}
      role="img"
      aria-label={segments.map((s) => s.title).join(", ")}
    >
      {segments
        .filter((s) => s.count > 0)
        .map((s) => (
          <i
            key={s.id}
            data-segment={s.id}
            title={s.title}
            className="block min-w-[3px] transition-[flex-basis] duration-500 hover:brightness-110 motion-reduce:transition-none"
            style={{ flexBasis: `${(s.count / total) * 100}%`, background: s.color }}
          />
        ))}
    </div>
  );
}

/** The segmented bar bent into a circle, for the phone orb. */
export function SegmentRing({
  size,
  stroke,
  segments,
}: {
  size: number;
  stroke: number;
  segments: Segment[];
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
  const lens = segments.map((s) => (s.count / total) * c);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={TONE.track}
        strokeWidth={stroke}
      />
      {segments.map((s, i) => (
        <circle
          key={s.id}
          data-arc={s.id}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeDasharray={`${lens[i]} ${c - lens[i]}`}
          strokeDashoffset={-starts[i]}
        />
      ))}
    </svg>
  );
}

/** A file's thumbnail from the shared cache, else a tile with its type. */
export function TransferThumb({
  fileId,
  name,
  size = 38,
  className,
}: {
  fileId?: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const url = useCachedThumbnail(fileId);
  const style = { width: size, height: size };
  if (url) {
    return (
      <span
        data-thumb="image"
        aria-hidden="true"
        className={cn(
          "block flex-none rounded-[10px] bg-cover bg-center corner-squircle",
          className,
        )}
        style={{ ...style, backgroundImage: `url("${url}")` }}
      />
    );
  }
  const ext = extOf(name).slice(0, 4).toUpperCase();
  return (
    <span
      data-thumb="type"
      aria-hidden="true"
      className={cn(
        "grid flex-none place-items-center rounded-[10px] bg-[var(--color-surface-2)] text-[9px] font-semibold tracking-wide text-[var(--color-text-muted)] corner-squircle",
        className,
      )}
      style={style}
    >
      {ext || "FILE"}
    </span>
  );
}
