"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import "@/components/marketing/landing/chrome.css";

const KEY = "zc-sticky-dismissed";
const EASE_IN = [0.05, 0.7, 0.1, 1] as const;
const EASE_OUT = [0.3, 0, 0.8, 0.15] as const;

function readDismissed() {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Phone-only sign-up bar: appears once How it works is reached, hides at the closing CTA and footer. */
export function StickyCta() {
  const reduce = useReducedMotion();
  const [past, setPast] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const how = document.getElementById("how");
    let pastIo: IntersectionObserver | null = null;
    let onScroll: (() => void) | null = null;
    if (how) {
      pastIo = new IntersectionObserver(
        ([e]) => {
          if (e) setPast(e.isIntersecting);
        },
        { rootMargin: "100000px 0px 0px 0px" },
      );
      pastIo.observe(how);
    } else {
      onScroll = () => setPast(window.scrollY > window.innerHeight);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    const inView = new Set<Element>();
    const blockIo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target);
        else inView.delete(e.target);
      }
      setBlocked(inView.size > 0);
    });
    for (const el of document.querySelectorAll("#start, footer")) blockIo.observe(el);

    return () => {
      pastIo?.disconnect();
      blockIo.disconnect();
      if (onScroll) window.removeEventListener("scroll", onScroll);
    };
  }, [dismissed]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {}
  };

  const show = past && !blocked && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="zk-bar"
          role="region"
          aria-label="Get started"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: reduce ? 0.2 : 0.32, ease: EASE_IN },
          }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : 24,
            transition: { duration: 0.18, ease: EASE_OUT },
          }}
          className="zk-bar lg-panel fixed right-3 left-3 z-40 flex h-[60px] items-center gap-1.5 rounded-[20px] corner-squircle py-2 pr-1 pl-4 md:hidden"
        >
          <p className="min-w-0 flex-1 text-[14px] leading-tight font-medium text-pretty text-[var(--color-text)]">
            Free. Nothing to set up.
          </p>
          <Link
            href="/register"
            className={cn(
              "group inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-3.5 text-[14px] font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
            )}
          >
            Start free
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide the sign-up bar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]/70 hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
