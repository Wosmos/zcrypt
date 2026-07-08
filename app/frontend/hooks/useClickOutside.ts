"use client";

import { useEffect, type RefObject } from "react";

/**
 * Call `onOutside` when a `mousedown` lands outside `ref`'s element. Folds the
 * byte-identical outside-click effect used by the notification center and the
 * avatar dropdown. `enabled` (default true) gates the listener — pass the "is
 * open" flag so the listener only runs while the panel is open.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, onOutside, ref]);
}
