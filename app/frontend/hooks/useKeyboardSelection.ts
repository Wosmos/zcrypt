"use client";

import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, FocusEvent } from "react";

export interface KeyboardSelectionOptions<Id extends string = string> {
  ids: readonly Id[];
  columns?: number;
  selected: ReadonlySet<Id>;
  onSelectedChange: (next: Set<Id>) => void;
  onOpen?: (id: Id) => void;
  onDelete?: (ids: Id[]) => void;
  onEscape?: () => void;
  isTypingTarget?: (el: EventTarget | null) => boolean;
  selectableIds?: readonly Id[];
  onSelectionStart?: () => void;
  getItemElement?: (id: Id) => HTMLElement | null;
}

export interface KeyboardSelection<Id extends string = string> {
  focusedId: Id | null;
  setFocusedId: (id: Id | null) => void;
  rovingId: Id | null;
  anchorRef: { current: Id | null };
  onItemClick: (id: Id, e: MouseEvent) => void;
  onItemKeyDown: (id: Id, e: KeyboardEvent) => void;
  onContainerKeyDown: (e: KeyboardEvent) => void;
  selectAll: () => void;
  clear: () => void;
  selectRangeTo: (id: Id, additive: boolean) => void;
  moveFocus: (from: Id | null, delta: number, extend: boolean) => void;
  getItemProps: (id: Id) => {
    tabIndex: number;
    "aria-selected": boolean;
    "data-focused"?: boolean;
    onClick: (e: MouseEvent) => void;
    onKeyDown: (e: KeyboardEvent) => void;
    onFocus: (e: FocusEvent) => void;
  };
}

export function defaultIsTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t || typeof t !== "object") return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable === true;
}

export function useKeyboardSelection<Id extends string = string>(
  opts: KeyboardSelectionOptions<Id>,
): KeyboardSelection<Id> {
  const {
    ids,
    columns = 1,
    selected,
    onSelectedChange,
    onOpen,
    onDelete,
    onEscape,
    isTypingTarget = defaultIsTypingTarget,
    selectableIds = ids,
    onSelectionStart,
    getItemElement,
  } = opts;

  const [focusedId, setFocusedId] = useState<Id | null>(null);
  const anchorRef = useRef<Id | null>(null);

  const [prevIds, setPrevIds] = useState(ids);
  if (ids !== prevIds) {
    setPrevIds(ids);
    if (focusedId && !ids.includes(focusedId)) setFocusedId(ids[0] ?? null);
  }

  const rovingId = focusedId && ids.includes(focusedId) ? focusedId : (ids[0] ?? null);

  const selectRangeTo = (id: Id, additive: boolean) => {
    const anchor = anchorRef.current ?? id;
    const a = selectableIds.indexOf(anchor);
    const b = selectableIds.indexOf(id);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const next = additive ? new Set(selected) : new Set<Id>();
    for (const rid of selectableIds.slice(lo, hi + 1)) next.add(rid);
    onSelectedChange(next);
  };

  const toggle = (id: Id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const focusItem = (id: Id) => {
    setFocusedId(id);
    requestAnimationFrame(() => {
      const el =
        getItemElement?.(id) ??
        (typeof document !== "undefined"
          ? document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)
          : null);
      el?.focus();
    });
  };

  const moveFocus = (from: Id | null, delta: number, extend: boolean) => {
    if (ids.length === 0) return;
    const curIdx = from ? ids.indexOf(from) : -1;
    const nextIdx = Math.min(ids.length - 1, Math.max(0, (curIdx === -1 ? 0 : curIdx) + delta));
    const nextId = ids[nextIdx];
    focusItem(nextId);
    if (extend && selectableIds.includes(nextId)) {
      onSelectionStart?.();
      selectRangeTo(nextId, true);
    }
  };

  const selectAll = () => {
    if (selectableIds.length === 0) return;
    onSelectionStart?.();
    onSelectedChange(new Set(selectableIds));
  };

  const clear = useCallback(() => {
    anchorRef.current = null;
    onSelectedChange(new Set());
  }, [onSelectedChange]);

  const onItemClick = (id: Id, e: MouseEvent) => {
    setFocusedId(id);
    const toggleMod = e.metaKey || e.ctrlKey;
    if (e.shiftKey) {
      onSelectionStart?.();
      selectRangeTo(id, toggleMod);
      return;
    }
    anchorRef.current = id;
    onSelectionStart?.();
    if (toggleMod) {
      toggle(id);
      return;
    }
    onSelectedChange(new Set([id]));
  };

  const onItemKeyDown = (id: Id, e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const gridded = columns > 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(id, columns, e.shiftKey);
        return;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(id, -columns, e.shiftKey);
        return;
      case "ArrowRight":
        if (gridded) {
          e.preventDefault();
          moveFocus(id, 1, e.shiftKey);
        }
        return;
      case "ArrowLeft":
        if (gridded) {
          e.preventDefault();
          moveFocus(id, -1, e.shiftKey);
        }
        return;
      case "Home":
        e.preventDefault();
        if (ids.length > 0) moveFocus(id, -ids.length, e.shiftKey);
        return;
      case "End":
        e.preventDefault();
        if (ids.length > 0) moveFocus(id, ids.length, e.shiftKey);
        return;
      case " ":
        e.preventDefault();
        onSelectionStart?.();
        anchorRef.current = id;
        toggle(id);
        return;
      case "Enter":
        if (onOpen) {
          e.preventDefault();
          onOpen(id);
        }
        return;
      case "Escape":
        if (selected.size > 0) {
          e.preventDefault();
          clear();
          onEscape?.();
        }
        return;
      case "Delete":
      case "Backspace":
        if (e.key === "Backspace" && e.metaKey) return;
        if (!onDelete) return;
        e.preventDefault();
        onDelete(selected.has(id) ? Array.from(selected) : [id]);
        return;
      default:
        return;
    }
  };

  const onContainerKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
      if (selectableIds.length === 0) return;
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === "Escape" && selected.size > 0) {
      e.preventDefault();
      clear();
      onEscape?.();
    }
  };

  const getItemProps = (id: Id) => ({
    tabIndex: rovingId === id ? 0 : -1,
    "aria-selected": selected.has(id),
    ...(focusedId === id ? { "data-focused": true } : {}),
    onClick: (e: MouseEvent) => onItemClick(id, e),
    onKeyDown: (e: KeyboardEvent) => onItemKeyDown(id, e),
    onFocus: () => setFocusedId(id),
  });

  return {
    focusedId,
    setFocusedId,
    rovingId,
    anchorRef,
    onItemClick,
    onItemKeyDown,
    onContainerKeyDown,
    selectAll,
    clear,
    selectRangeTo,
    moveFocus,
    getItemProps,
  };
}
