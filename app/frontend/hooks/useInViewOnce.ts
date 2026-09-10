import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Scroll-reveal visibility, with "visible" as the safe default.
 *
 * The reveal is an enhancement, never a prerequisite for reading the page.
 * `isVisible` therefore starts TRUE, and an element is only hidden when we
 * know we can bring it back: JS is running, IntersectionObserver exists, the
 * visitor hasn't asked for reduced motion, and the element is actually below
 * the fold. That hiding happens in a layout effect (before paint), so there's
 * no flash — and every other case, including server-rendered HTML, no-JS
 * crawlers, print, and screenshots taken before hydration, keeps the content
 * on screen instead of leaving a blank void where a section should be.
 *
 * Fires once, then disconnects.
 */
export function useInViewOnce<T extends Element>(rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(true);

  // useLayoutEffect so the hidden state is committed before the browser paints;
  // useEffect would let the element render visible for a frame and then blink out.
  /* v8 ignore start */ // the SSR arm can't run under jsdom, where window always exists
  const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
  /* v8 ignore stop */

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return; // no observer → stay visible
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen: showing it immediately beats animating it in.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    setIsVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Reveal on intersection — or if the element is already ABOVE the
        // viewport. A fast scroll, an anchor jump, or a restored scroll
        // position can carry an element clean past the observer between two
        // ticks; without this it would never intersect and would stay
        // invisible for the rest of the session.
        const scrolledPast = entry.boundingClientRect.top < 0;
        if (entry.isIntersecting || scrolledPast) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isVisible };
}
