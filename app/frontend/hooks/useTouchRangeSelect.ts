"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Drag-to-select for the Vault grid (mobile), like the phone gallery: while
 * already in select mode, press a file card and sweep your finger across others
 * to select the range — no tapping each one. Dragging back toward the start
 * shrinks the range (releasing the newly-swept cards but never the ones that were
 * already selected when the sweep began).
 *
 * It runs ONLY while select mode is on (the explorer passes
 * `enabled: isMobile && selectMode`), so it never competes with the move-drag
 * (useTouchDragMove) or the long-press context menu, which own touches OUTSIDE
 * select mode. A short slop distance separates a plain tap (toggle one card,
 * handled by the card's onClick) from a sweep (range select).
 *
 * `onSweep` fires at most once per NEW card the finger enters — not once per
 * touchmove — so the explorer's selection setState (and the optional haptic tick)
 * runs a bounded number of times, and finger travel within one card is free.
 */

const MOVE_START_PX = 8; // move past this to commit to a sweep (vs a tap)
const EDGE_ZONE = 72; // px from the scroller edge that auto-scrolls
const EDGE_SPEED = 14; // px per frame while in the edge zone

interface Options {
  /** Gate to touch + select mode. When false this is a no-op. */
  enabled: boolean;
  /** Map a viewport point to the FILE id under it (null if not over a file card). */
  fileIdAt: (x: number, y: number) => string | null;
  /** Snapshot state right as a sweep begins (e.g. remember the current selection). */
  onSweepStart?: () => void;
  /** Select the inclusive range [anchorId, currentId]. Fires once per new card. */
  onSweep: (anchorId: string, currentId: string) => void;
  /** Scrolling element for edge auto-scroll (defaults to the app main). */
  scrollContainerId?: string;
}

export function useTouchRangeSelect({
  enabled,
  fileIdAt,
  onSweepStart,
  onSweep,
  scrollContainerId = "main-content",
}: Options) {
  // Latest callbacks in a ref so the document listeners stay referentially stable.
  const cbRef = useRef({ enabled, fileIdAt, onSweepStart, onSweep });
  cbRef.current = { enabled, fileIdAt, onSweepStart, onSweep };

  const st = useRef({
    anchor: null as string | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastId: null as string | null, // last file id we dispatched a sweep to (dedup)
    sweeping: false,
    scroller: null as HTMLElement | null,
    raf: null as number | null,
  });

  const noop = () => {};
  const onMoveRef = useRef<(e: TouchEvent) => void>(noop);
  const onEndRef = useRef<(e: TouchEvent) => void>(noop);

  const teardown = useCallback(() => {
    const s = st.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    document.removeEventListener("touchmove", onMoveRef.current);
    document.removeEventListener("touchend", onEndRef.current);
    document.removeEventListener("touchcancel", onEndRef.current);
    s.anchor = null;
    s.lastId = null;
    s.sweeping = false;
    s.scroller = null;
    s.raf = null;
  }, []);

  // Dispatch a range select only when the finger has entered a DIFFERENT file
  // card than last time — bounds setState/haptics to one call per card crossed.
  const sweepTo = (x: number, y: number) => {
    const s = st.current;
    const id = cbRef.current.fileIdAt(x, y);
    if (!id || id === s.lastId || !s.anchor) return;
    s.lastId = id;
    cbRef.current.onSweep(s.anchor, id);
  };

  // Auto-scroll while sweeping near a scroller edge, re-selecting under the
  // (stationary) finger as new cards slide into view.
  const tick = useCallback(() => {
    const s = st.current;
    if (!s.sweeping || !s.scroller) {
      s.raf = null;
      return;
    }
    const rect = s.scroller.getBoundingClientRect();
    let dy = 0;
    if (s.lastY < rect.top + EDGE_ZONE) dy = -EDGE_SPEED;
    else if (s.lastY > rect.bottom - EDGE_ZONE) dy = EDGE_SPEED;
    if (dy !== 0) {
      s.scroller.scrollTop += dy;
      sweepTo(s.lastX, s.lastY);
    }
    s.raf = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    onMoveRef.current = (e: TouchEvent) => {
      const s = st.current;
      if (!s.anchor) return;
      const t = e.touches[0];
      if (!t) return;
      s.lastX = t.clientX;
      s.lastY = t.clientY;
      const dist = Math.hypot(t.clientX - s.startX, t.clientY - s.startY);

      if (!s.sweeping) {
        if (dist <= MOVE_START_PX) return; // still might be a tap — wait
        s.sweeping = true;
        s.scroller = document.getElementById(scrollContainerId);
        cbRef.current.onSweepStart?.();
        // The anchor card itself is part of the range from the very first move.
        sweepTo(s.startX, s.startY);
        s.raf = requestAnimationFrame(tick);
      }
      // Own the gesture: stop the list from scrolling under the sweep.
      e.preventDefault();
      sweepTo(t.clientX, t.clientY);
    };

    onEndRef.current = () => teardown();
  }, [scrollContainerId, teardown, tick]);

  // Attach to each file card's onTouchStart while in select mode.
  const onPressStart = useCallback(
    (fileId: string, e: React.TouchEvent) => {
      if (!cbRef.current.enabled) return;
      const t = e.touches[0];
      if (!t) return;
      teardown(); // clear any stale press
      const s = st.current;
      s.anchor = fileId;
      s.startX = s.lastX = t.clientX;
      s.startY = s.lastY = t.clientY;
      s.lastId = null;
      s.sweeping = false;
      document.addEventListener("touchmove", onMoveRef.current, { passive: false });
      document.addEventListener("touchend", onEndRef.current);
      document.addEventListener("touchcancel", onEndRef.current);
    },
    [teardown]
  );

  // Clean up if the component unmounts mid-press.
  useEffect(() => () => teardown(), [teardown]);

  return { onPressStart };
}
