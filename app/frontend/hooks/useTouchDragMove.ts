"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDragMove, type DragItem } from "@/hooks/useDragMove";

/**
 * Touch drag-and-drop for the Vault explorer (mobile).
 *
 * The HTML5 drag API is mouse-only — touchscreens never fire it — so file moves
 * had no drag gesture on phones. This hook adds one, driving the SAME
 * `useDragMove` store the desktop path uses (so folder drop-highlighting reuses
 * `overTarget` unchanged) and handing the drop back to the explorer.
 *
 * Gesture (coexists with the long-press context menu):
 *   • touchstart on a card → arm a hold timer (HOLD_MS).
 *   • move BEFORE the hold fires → it's a scroll; we bail and never touch it.
 *   • hold fires, THEN you move → the item is "picked up": we start the drag and
 *     follow the finger. (Radix opens its menu on a hold WITHOUT movement, so the
 *     two never collide; we only suppress the browser contextmenu once a drag is
 *     actually live.)
 *   • drag over a folder card (marked `data-folder-drop="<id>"`) highlights it;
 *     release drops the item in. Near the top/bottom edge we auto-scroll.
 *
 * The drag preview is positioned imperatively (a plain DOM node on <body>) so the
 * finger-follow never re-renders React — only the folder highlight (which changes
 * rarely) goes through the store.
 *
 * Zero effect unless `enabled` (the explorer passes `isMobile`), so the desktop
 * pointer path is byte-for-byte untouched.
 */

const HOLD_MS = 220; // press this long before a drag can begin
const MOVE_CANCEL_PX = 12; // moved farther than this before the hold → treat as scroll
const DRAG_START_PX = 6; // after the hold, moving this far commits to a drag
const EDGE_ZONE = 72; // px from the scroller's top/bottom that auto-scrolls
const EDGE_SPEED = 14; // px per frame while in the edge zone

interface TouchDragOptions {
  /** Gate the whole thing to touch/mobile. When false, this is a no-op. */
  enabled: boolean;
  /** Can `item` drop into folder `destId`? (folder-into-itself etc. rejected). */
  canDropOn: (item: DragItem, destFolderId: string) => boolean;
  /** Perform the move once the finger releases over a valid folder. */
  onDrop: (item: DragItem, destFolderId: string) => void;
  /** Id of the scrolling element for edge auto-scroll (defaults to the app main). */
  scrollContainerId?: string;
}

export function useTouchDragMove({
  enabled,
  canDropOn,
  onDrop,
  scrollContainerId = "main-content",
}: TouchDragOptions) {
  const startDrag = useDragMove((s) => s.startDrag);
  const endDrag = useDragMove((s) => s.endDrag);
  const setOverTarget = useDragMove((s) => s.setOverTarget);

  // Latest callbacks in a ref so the document listeners stay referentially stable
  // (added once per press, removed on cleanup — must be the same fn identity).
  const cbRef = useRef({ canDropOn, onDrop, enabled });
  cbRef.current = { canDropOn, onDrop, enabled };

  const st = useRef({
    item: null as DragItem | null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    held: false, // hold timer fired
    dragging: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    raf: null as number | null,
    scroller: null as HTMLElement | null,
    ghost: null as HTMLElement | null,
  });

  const folderIdAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const folderEl = el?.closest<HTMLElement>("[data-folder-drop]");
    return folderEl?.getAttribute("data-folder-drop") ?? null;
  };

  const updateHover = useCallback(
    (x: number, y: number) => {
      const s = st.current;
      if (!s.item) return;
      const dest = folderIdAt(x, y);
      if (dest && cbRef.current.canDropOn(s.item, dest)) setOverTarget(dest);
      else setOverTarget(undefined);
    },
    [setOverTarget]
  );

  // ── edge auto-scroll (runs while dragging near a scroller edge) ──────────────
  const tickAutoScroll = useCallback(() => {
    const s = st.current;
    if (!s.dragging || !s.scroller) {
      s.raf = null;
      return;
    }
    const rect = s.scroller.getBoundingClientRect();
    let dy = 0;
    if (s.lastY < rect.top + EDGE_ZONE) dy = -EDGE_SPEED;
    else if (s.lastY > rect.bottom - EDGE_ZONE) dy = EDGE_SPEED;
    if (dy !== 0) {
      s.scroller.scrollTop += dy;
      updateHover(s.lastX, s.lastY); // content moved under a stationary finger
    }
    s.raf = requestAnimationFrame(tickAutoScroll);
  }, [updateHover]);

  // ── imperative drag preview (no React re-render on finger move) ──────────────
  const moveGhost = (x: number, y: number) => {
    const g = st.current.ghost;
    if (g) g.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
  };
  const createGhost = (label: string) => {
    const g = document.createElement("div");
    g.textContent = label;
    g.style.position = "fixed";
    g.style.left = "0";
    g.style.top = "0";
    g.style.zIndex = "100";
    g.style.maxWidth = "60vw";
    g.style.overflow = "hidden";
    g.style.textOverflow = "ellipsis";
    g.style.whiteSpace = "nowrap";
    g.style.padding = "8px 12px";
    g.style.borderRadius = "12px";
    g.style.border = "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)";
    g.style.background = "var(--color-surface)";
    g.style.color = "var(--color-text)";
    g.style.font = "500 12px/1.2 ui-sans-serif, system-ui, -apple-system, sans-serif";
    g.style.boxShadow = "0 14px 34px -10px rgba(0,0,0,0.55)";
    g.style.pointerEvents = "none";
    g.style.willChange = "transform";
    document.body.appendChild(g);
    st.current.ghost = g;
  };

  // ── stable document listeners (added on press, removed on cleanup) ───────────
  const onMoveRef = useRef<(e: TouchEvent) => void>(() => {});
  const onEndRef = useRef<(e: TouchEvent) => void>(() => {});
  const onCtxRef = useRef<(e: Event) => void>(() => {});

  const teardown = useCallback(() => {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    if (s.raf) cancelAnimationFrame(s.raf);
    document.removeEventListener("touchmove", onMoveRef.current);
    document.removeEventListener("touchend", onEndRef.current);
    document.removeEventListener("touchcancel", onEndRef.current);
    document.removeEventListener("contextmenu", onCtxRef.current, true);
    if (s.ghost) s.ghost.remove();
    const wasDragging = s.dragging;
    s.item = null;
    s.held = false;
    s.dragging = false;
    s.timer = null;
    s.raf = null;
    s.scroller = null;
    s.ghost = null;
    if (wasDragging) {
      setOverTarget(undefined);
      endDrag();
    }
  }, [endDrag, setOverTarget]);

  const beginDrag = useCallback(() => {
    const s = st.current;
    if (!s.item || s.dragging) return;
    s.dragging = true;
    s.scroller = document.getElementById(scrollContainerId);
    startDrag(s.item);
    createGhost(s.item.name);
    moveGhost(s.lastX, s.lastY);
    if (s.raf == null) s.raf = requestAnimationFrame(tickAutoScroll);
  }, [scrollContainerId, startDrag, tickAutoScroll]);

  // Wire the listener refs once.
  useEffect(() => {
    onMoveRef.current = (e: TouchEvent) => {
      const s = st.current;
      if (!s.item) return;
      const t = e.touches[0];
      if (!t) return;
      s.lastX = t.clientX;
      s.lastY = t.clientY;
      const dist = Math.hypot(t.clientX - s.startX, t.clientY - s.startY);

      if (s.dragging) {
        e.preventDefault(); // hold the page still while dragging
        moveGhost(t.clientX, t.clientY);
        updateHover(t.clientX, t.clientY);
        return;
      }
      if (!s.held) {
        // Moved before the hold fired → this is a scroll, not a drag. Bail.
        if (dist > MOVE_CANCEL_PX) teardown();
        return;
      }
      // Held long enough; a deliberate move now commits to a drag.
      if (dist > DRAG_START_PX) {
        e.preventDefault();
        beginDrag();
      }
    };

    onEndRef.current = () => {
      const s = st.current;
      if (s.dragging && s.item) {
        const dest = folderIdAt(s.lastX, s.lastY);
        if (dest && cbRef.current.canDropOn(s.item, dest)) {
          cbRef.current.onDrop(s.item, dest);
        }
      }
      teardown();
    };

    // Swallow the browser's long-press contextmenu ONLY once an actual drag is
    // underway — otherwise a plain long-press (hold without moving) would be
    // eaten here and the file's context menu would never open on mobile.
    onCtxRef.current = (e: Event) => {
      if (st.current.dragging) e.preventDefault();
    };
  }, [beginDrag, teardown, updateHover]);

  // ── public: attach to each draggable card's onTouchStart ─────────────────────
  const onPressStart = useCallback(
    (item: DragItem, e: React.TouchEvent) => {
      if (!cbRef.current.enabled) return;
      const t = e.touches[0];
      if (!t) return;
      teardown(); // clear any stale press first
      const s = st.current;
      s.item = item;
      s.startX = s.lastX = t.clientX;
      s.startY = s.lastY = t.clientY;
      s.held = false;
      s.dragging = false;
      s.timer = setTimeout(() => {
        st.current.held = true;
      }, HOLD_MS);
      document.addEventListener("touchmove", onMoveRef.current, { passive: false });
      document.addEventListener("touchend", onEndRef.current);
      document.addEventListener("touchcancel", onEndRef.current);
      document.addEventListener("contextmenu", onCtxRef.current, true);
    },
    [teardown]
  );

  // Clean up listeners + ghost if the component unmounts mid-press.
  useEffect(() => () => teardown(), [teardown]);

  return { onPressStart };
}
