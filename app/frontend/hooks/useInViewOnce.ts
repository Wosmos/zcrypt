import { useEffect, useRef, useState } from "react";

/**
 * Fires once when the ref'd element first enters the viewport (or the
 * `rootMargin`-expanded/shrunk bounds), then disconnects. Shared by the
 * marketing scroll-reveal wrappers so each doesn't reimplement its own
 * IntersectionObserver.
 */
export function useInViewOnce<T extends Element>(rootMargin = "0px") {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, isVisible };
}
