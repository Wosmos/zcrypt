"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Thin progress bar shown at the top of the viewport during route transitions.
 * Uses CSS animation for a smooth, non-blocking visual indicator.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Route changed — transition complete
    setLoading(false);
    setProgress(0);
  }, [pathname]);

  useEffect(() => {
    if (!loading) return;
    // Simulate progress: fast start, slow approach to 90%
    setProgress(20);
    const t1 = setTimeout(() => setProgress(50), 150);
    const t2 = setTimeout(() => setProgress(70), 400);
    const t3 = setTimeout(() => setProgress(85), 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] h-0.5">
      <div
        className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all duration-300 ease-out"
        style={{
          width: loading ? `${progress}%` : "100%",
          opacity: loading ? 1 : 0,
          transition: loading
            ? "width 0.3s ease-out"
            : "width 0.15s ease-out, opacity 0.3s ease-out 0.1s",
        }}
      />
    </div>
  );
}

/**
 * Hook for components to trigger navigation with progress indication.
 * Wraps router.push in startTransition to keep current page visible.
 */
export function useNavigation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return { navigate, isPending };
}
