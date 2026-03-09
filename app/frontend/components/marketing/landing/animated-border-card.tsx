"use client";

import { useRef } from "react";
import { motion, useInView, useMotionValue, useMotionTemplate } from "motion/react";
import { cn } from "@/lib/utils";

export function AnimatedBorderCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const background = useMotionTemplate`radial-gradient(300px at ${mouseX}px ${mouseY}px, rgba(16,185,129,0.12), transparent 80%)`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      onMouseMove={handleMouseMove}
      className={cn("relative group", className)}
    >
      {/* Animated gradient border */}
      <div className="absolute -inset-px rounded-2xl overflow-hidden">
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              "conic-gradient(from var(--border-angle, 0deg), transparent 30%, rgba(16,185,129,0.3) 50%, transparent 70%)",
            animation: "borderRotate 4s linear infinite",
          }}
        />
      </div>
      {/* Spotlight glow on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}
