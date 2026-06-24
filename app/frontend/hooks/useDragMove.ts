"use client";

import { create } from "zustand";

/**
 * Shared drag-and-drop coordination for moving files/folders in the Vault.
 *
 * Native HTML5 DnD carries an id via dataTransfer, but drag-over highlighting
 * and "can I drop here?" checks need the dragged item's identity synchronously
 * during dragover (dataTransfer.getData is unreadable then). This tiny store
 * lets the file table, folder cards, and breadcrumb crumbs (all siblings)
 * coordinate without prop drilling.
 */

export type DragKind = "file" | "folder";

export interface DragItem {
  kind: DragKind;
  id: string;
  /** Display name, used for the drag preview + toasts. */
  name: string;
  /** For folders: the current parent so we can no-op a drop onto the same parent. */
  parentId?: string | null;
}

interface DragMoveStore {
  dragging: DragItem | null;
  /** Id of the folder currently hovered as a drop target (null = Root crumb). */
  overTarget: string | null | undefined;

  startDrag: (item: DragItem) => void;
  endDrag: () => void;
  setOverTarget: (target: string | null | undefined) => void;
}

export const useDragMove = create<DragMoveStore>((set) => ({
  dragging: null,
  overTarget: undefined,

  startDrag: (item) => set({ dragging: item }),
  endDrag: () => set({ dragging: null, overTarget: undefined }),
  setOverTarget: (overTarget) => set({ overTarget }),
}));

/**
 * Whether `item` can be dropped onto a destination folder (null = Root).
 * Prevents: dropping a folder into itself, and no-op drops where the item is
 * already in the destination. (Deep descendant checks would need the full tree;
 * the backend rejects cycles, and we reconcile on error.)
 */
export function canDrop(item: DragItem | null, destFolderId: string | null): boolean {
  if (!item) return false;
  if (item.kind === "folder") {
    if (item.id === destFolderId) return false; // into itself
    if ((item.parentId ?? null) === destFolderId) return false; // already there
    return true;
  }
  // file: no-op if already in this folder is handled by the caller (it knows
  // the file's current folder); allow by default here.
  return true;
}

export const DRAG_MIME = "application/x-zcrypt-move";

/* ────────────────────────────────────────────────────────────────────────────
 * Custom drag ghost (OWNER 2 — "tilt-on-drag" + bulk stacked-count ghost).
 *
 * Native HTML5 DnD lets us swap the drag image via `dataTransfer.setDragImage`.
 * We build a styled, throwaway node, position it off-screen, register it as the
 * drag image, then remove it on the next tick (the browser snapshots it
 * synchronously). A single dragged sheet is lifted + tilted + shadowed; a bulk
 * drag (≥2 selected) becomes a stacked card showing the count ("4 items").
 *
 * Zero hardcoded hex — only `--color-*` tokens. Reduced-motion → NO tilt/scale
 * (a plain, upright ghost), honoring the caller's `tilt` flag which the explorer
 * derives from `useReducedMotion()`.
 * ──────────────────────────────────────────────────────────────────────────── */

interface DragGhostOptions {
  /** Apply the rotate + scale lift. The explorer passes `!prefersReducedMotion`. */
  tilt: boolean;
  /** ≥2 → render a stacked "N items" ghost instead of a single labeled sheet. */
  count?: number;
  /** Label for a single-item ghost (the file/folder name). */
  label?: string;
}

/**
 * Build a styled drag-image node and register it on the drag event. Returns
 * nothing; the node is auto-removed after the browser has snapshotted it.
 *
 * Call inside `onDragStart`, AFTER `setData`/`effectAllowed`, e.g.:
 *   setDragGhost(e, { tilt: !prefersReducedMotion, label: file.original_name });
 */
export function setDragGhost(
  e: { dataTransfer: DataTransfer },
  { tilt, count = 1, label }: DragGhostOptions
): void {
  if (typeof document === "undefined") return;
  const dt = e.dataTransfer;
  if (!dt || typeof dt.setDragImage !== "function") return;

  const bulk = count >= 2;

  const ghost = document.createElement("div");
  // Off-screen container; the browser snapshots it for the drag image.
  ghost.style.position = "fixed";
  ghost.style.top = "-1000px";
  ghost.style.left = "-1000px";
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "9999";
  // Tilt + lift only when motion is allowed (reduced-motion → upright).
  ghost.style.transform = tilt ? "rotate(-4deg) scale(1.04)" : "none";
  ghost.style.transformOrigin = "center";

  // Stacked backing cards for a bulk drag (offset behind the front card).
  if (bulk) {
    for (let i = 2; i >= 1; i--) {
      const back = document.createElement("div");
      back.style.position = "absolute";
      back.style.top = `${i * 4}px`;
      back.style.left = `${i * 4}px`;
      back.style.right = `${-i * 4}px`;
      back.style.bottom = `${-i * 4}px`;
      back.style.borderRadius = "12px";
      back.style.border = "1px solid var(--color-border)";
      back.style.background = "var(--color-surface)";
      back.style.boxShadow = "0 8px 24px -8px rgba(0,0,0,0.45)";
      ghost.appendChild(back);
    }
  }

  const card = document.createElement("div");
  card.style.position = "relative";
  card.style.display = "flex";
  card.style.alignItems = "center";
  card.style.gap = "10px";
  card.style.maxWidth = "260px";
  card.style.padding = "10px 14px";
  card.style.borderRadius = "12px";
  card.style.border = "1px solid var(--color-border)";
  card.style.background = "var(--color-surface)";
  card.style.color = "var(--color-text)";
  card.style.font =
    "500 13px/1.2 ui-sans-serif, system-ui, -apple-system, sans-serif";
  card.style.boxShadow = "0 14px 34px -10px rgba(0,0,0,0.55)";
  card.style.whiteSpace = "nowrap";
  card.style.overflow = "hidden";

  // Accent count badge for bulk; otherwise a small file glyph.
  const badge = document.createElement("span");
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.flex = "0 0 auto";
  badge.style.height = "22px";
  badge.style.minWidth = "22px";
  badge.style.padding = "0 6px";
  badge.style.borderRadius = "7px";
  badge.style.fontSize = "12px";
  badge.style.fontWeight = "600";
  if (bulk) {
    // Accent fill; surface-colored numerals read against it in both themes.
    badge.style.background = "var(--color-accent)";
    badge.style.color = "var(--color-surface)";
    badge.textContent = String(count);
  } else {
    badge.style.background = "var(--color-surface-2)";
    badge.style.color = "var(--color-accent)";
    badge.textContent = "1";
  }
  card.appendChild(badge);

  const text = document.createElement("span");
  text.style.overflow = "hidden";
  text.style.textOverflow = "ellipsis";
  text.style.maxWidth = "200px";
  text.textContent = bulk ? `${count} items` : (label ?? "1 item");
  card.appendChild(text);

  ghost.appendChild(card);
  document.body.appendChild(ghost);

  // Anchor near the cursor (a little inside the card so it reads as "held").
  try {
    dt.setDragImage(ghost, 24, 20);
  } catch {
    // setDragImage can throw in rare engines; the default ghost is fine.
  }

  // Remove after the browser has taken its synchronous snapshot.
  setTimeout(() => {
    ghost.remove();
  }, 0);
}
