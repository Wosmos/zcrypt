/**
 * Edge auto-scroll gesture primitive.
 *
 * When a touch gesture (range-select sweep, drag-move) holds the finger near the
 * top or bottom of a scroller, this nudges the scroller each frame and re-runs
 * the gesture's hit-test so fresh content slides under the stationary finger.
 *
 * Shared by useTouchRangeSelect and useTouchDragMove — they differ only in the
 * active guard, the scroller lookup, the tracked point, and the post-scroll
 * callback, all injected via `opts`. The factory owns its own rAF handle.
 */

const EDGE_ZONE = 72; // px from the scroller edge that auto-scrolls
const EDGE_SPEED = 14; // px per frame while in the edge zone

export interface EdgeAutoScroll {
  /** Begin the rAF loop (idempotent — a no-op if already running). */
  start(): void;
  /** Cancel the rAF loop if running. */
  stop(): void;
}

export function createEdgeAutoScroll(opts: {
  /** Keep scrolling only while true; the loop stops itself when this goes false. */
  isActive: () => boolean;
  /** The scrolling element, or null to stop. */
  getScroller: () => HTMLElement | null;
  /** The current finger point (read live each frame). */
  getPoint: () => { x: number; y: number };
  /** Re-run the gesture hit-test after content scrolled under the finger. */
  onScrolled: (x: number, y: number) => void;
}): EdgeAutoScroll {
  let raf: number | null = null;

  const tick = () => {
    const scroller = opts.getScroller();
    if (!opts.isActive() || !scroller) {
      raf = null;
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const { x, y } = opts.getPoint();
    let dy = 0;
    if (y < rect.top + EDGE_ZONE) dy = -EDGE_SPEED;
    else if (y > rect.bottom - EDGE_ZONE) dy = EDGE_SPEED;
    if (dy !== 0) {
      scroller.scrollTop += dy;
      opts.onScrolled(x, y);
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (raf == null) raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    },
  };
}
