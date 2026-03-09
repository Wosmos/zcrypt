"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, useInView } from "motion/react";

export function AnimatedTimelineLine() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });

  return (
    <div ref={ref} className="absolute left-6 top-0 bottom-0 w-px">
      {/* Background track */}
      <div className="absolute inset-0 bg-[var(--color-border)]" />
      {/* Animated fill */}
      <motion.div
        className="absolute top-0 left-0 right-0 bg-emerald-500 origin-top"
        style={{ scaleY, height: "100%" }}
      />
      {/* Glow at the tip */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 blur-[2px]"
        style={{
          top: useTransform(scaleY, (v: number) => `calc(${v * 100}% - 6px)`),
        }}
      />
    </div>
  );
}

export function TimelineStep({
  step,
  index,
}: {
  step: { num: string; title: string; desc: string };
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
    >
      <div className="relative flex gap-5 py-6">
        <motion.div
          className="relative z-10 flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : {}}
          transition={{
            duration: 0.4,
            delay: 0.1 + index * 0.1,
            type: "spring",
            stiffness: 300,
          }}
        >
          {step.num}
        </motion.div>
        <div className="pt-1">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {step.desc}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
