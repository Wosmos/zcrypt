"use client";

import { motion } from "motion/react";

export function Marquee({
  items,
  reverse = false,
}: {
  items: readonly string[] | string[];
  reverse?: boolean;
}) {
  return (
    <div className="relative flex w-full overflow-hidden py-6 select-none bg-[var(--color-bg)]">
      {/* Edge Fades: Keeps it from looking "cut off" */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--color-bg)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--color-bg)] to-transparent" />

      <motion.div
        className="flex min-w-full shrink-0 items-center gap-4" // Reduced gap
        initial={{ x: reverse ? "-50%" : "0%" }}
        animate={{ x: reverse ? "0%" : "-50%" }}
        transition={{
          duration: 100,
          repeat: Infinity,
          ease: "linear"
        }}
        whileHover={{ animationPlayState: "paused" }}
      >
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            {/* The Text Style: Bold, Italic, Mixed Fill */}
            <span
              className={`
                text-xl md:text-2xl font-black italic tracking-tighter uppercase whitespace-nowrap font-heading
                transition-colors duration-300
                ${i % 2 === 0 
                  ? "text-[var(--color-text-primary)]" 
                  : "text-cyan-950 dark:text-cyan-500 [-webkit-text-stroke:1px_var(--color-text-muted)] opacity-50"
                }
                group-hover:text-cyan-500
              `}
            >
              {item}
            </span>

            {/* Subtle Dev-Style Separator */}
            <span className="text-cyan-500/40 font-light text-2xl">/</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}