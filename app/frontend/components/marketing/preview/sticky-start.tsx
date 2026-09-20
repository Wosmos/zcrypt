"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@/lib/icons";

/**
 * A start button that follows you down the page, phones only.
 *
 * The audit measured the mobile page at 15,656px with exactly two signup links,
 * at y=484 and y=14418. Anyone convinced in the middle had nothing to press for
 * roughly thirteen thousand pixels. This appears once the hero is gone and can
 * be dismissed, because a bar that cannot be closed is worse than no bar.
 */
export function StickyStart() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {show && !dismissed && (
        <motion.div
          initial={reduce ? false : { y: 80 }}
          animate={{ y: 0 }}
          exit={reduce ? undefined : { y: 80 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur sm:hidden"
        >
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-tight text-[var(--color-text)]">
              Free. Nothing to set up.
            </p>
            <Link
              href="/register"
              className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-on-accent)]"
            >
              Start free
            </Link>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Hide the sign-up bar"
              className="shrink-0 rounded-lg p-2 text-[var(--color-text-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
