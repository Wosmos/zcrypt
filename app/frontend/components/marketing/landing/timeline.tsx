"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { cn } from "@/lib/utils";

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
        className="absolute top-0 left-0 right-0 bg-cyan-500 origin-top"
        style={{ scaleY, height: "100%" }}
      />
      {/* Glow at the tip */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50 blur-[2px]"
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
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>("-80px");

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${index * 0.1}s` }}
      className={cn(
        "transition-[opacity,transform] duration-500 ease-out",
        isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-5"
      )}
    >
      <div className="relative flex gap-5 py-7">
        <div
          style={{ transitionDelay: `${0.1 + index * 0.1}s` }}
          className={cn(
            "relative z-10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-500/20 bg-[var(--color-bg)] text-xs font-bold text-cyan-600 shadow-sm dark:text-cyan-400",
            "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
        >
          {step.num}
        </div>
        <div className="pt-0.5">
          <h3 className="text-base font-bold tracking-tight font-heading">
            {step.title}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
            {step.desc}
          </p>
        </div>
      </div>
    </div>
  );
}
