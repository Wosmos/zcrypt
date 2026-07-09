import { useCallback } from "react";
import type { RefObject } from "react";

/** Toggles the browser Fullscreen API on the given element ref. */
export function useToggleFullscreen(ref: RefObject<HTMLElement | null>) {
  return useCallback(() => {
    const node = ref.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void node.requestFullscreen?.().catch(() => {});
    }
  }, [ref]);
}
