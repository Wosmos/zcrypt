"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

// Shared prose primitives for the long-form marketing pages (terms, privacy,
// philosophy) so they stay visually consistent instead of each redefining these.

export function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-12 border-l-2 border-cyan-500/40 pl-6 py-2">
      <p className="text-xl sm:text-2xl font-medium italic text-[var(--color-text)] leading-relaxed">
        {children}
      </p>
    </blockquote>
  );
}

export function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2 text-base text-[var(--color-text-secondary)] leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-cyan-500 mt-0.5 shrink-0">&bull;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
