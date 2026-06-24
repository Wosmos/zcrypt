"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useReducedMotion } from "motion/react";
import { Plus, ChevronDown, RotateCcw, RefreshCcw, Image as ImageIcon } from "@/lib/icons";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const SCALE_STEP = 0.25;

/**
 * Decrypted-image viewer: wheel + button zoom, drag-to-pan, 90° rotate, reset,
 * fit-to-screen. Pan is disabled when the image fits (scale ≤ 1). Reduced-motion
 * disables the smooth zoom transition. Renders from a blob object URL only.
 */
export function ImageViewer({ url, alt }: { url: string; alt: string }) {
  const reduce = useReducedMotion() ?? false;
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset all transforms whenever the image source changes (prev/next nav).
  useEffect(() => {
    reset();
  }, [url, reset]);

  const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP);
    },
    [zoomBy]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (scale <= 1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
    },
    [scale]
  );

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  }, []);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already be released
    }
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2))}
        className={cn(
          "flex flex-1 items-center justify-center overflow-hidden touch-none select-none",
          scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        )}
      >
        {/* Decrypted blob object URL; alt set, no external network. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          draggable={false}
          className={cn(
            "max-h-full max-w-full object-contain",
            !reduce && !draggingRef.current && "transition-transform duration-150"
          )}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
        />
      </div>

      {/* Floating control cluster */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-2 py-1.5 shadow-lg backdrop-blur">
          <IconButton
            icon={ChevronDown}
            label="Zoom out"
            onClick={() => zoomBy(-SCALE_STEP)}
            disabled={scale <= MIN_SCALE}
            iconClassName="h-4 w-4"
          />
          <span className="min-w-12 select-none text-center text-xs font-medium tabular-nums text-[var(--color-text-secondary)]">
            {Math.round(scale * 100)}%
          </span>
          <IconButton
            icon={Plus}
            label="Zoom in"
            onClick={() => zoomBy(SCALE_STEP)}
            disabled={scale >= MAX_SCALE}
            iconClassName="h-4 w-4"
          />
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden />
          <IconButton
            icon={RotateCcw}
            label="Rotate"
            onClick={() => setRotation((r) => (r - 90) % 360)}
            iconClassName="h-4 w-4"
          />
          <IconButton
            icon={ImageIcon}
            label="Fit to screen"
            onClick={reset}
            iconClassName="h-4 w-4"
          />
          <IconButton
            icon={RefreshCcw}
            label="Reset"
            onClick={reset}
            iconClassName="h-4 w-4"
          />
        </div>
      </div>
    </div>
  );
}
