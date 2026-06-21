"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-[var(--color-surface)] transition-colors duration-200",
        isOpen
          ? "border-cyan-500/40"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]"
      )}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          {question}
        </span>
        {/* Plus that rotates into an × */}
        <span
          aria-hidden="true"
          className={cn(
            "relative flex h-5 w-5 flex-shrink-0 items-center justify-center text-cyan-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            isOpen && "rotate-45"
          )}
        >
          <span className="absolute h-px w-3 bg-current" />
          <span className="absolute h-3 w-px bg-current" />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
