"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group relative border-b border-[var(--color-border)] last:border-none">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left transition-all"
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full transition-all duration-300",
            isOpen ? "bg-cyan-500 scale-125 shadow-[0_0_8px_rgba(6,182,212,0.5)]" : "bg-[var(--color-border-hover)]"
          )} />
          <span className="text-[14px] font-medium tracking-tight text-[var(--color-text)]">
            {question}
          </span>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 opacity-40 transition-transform duration-500 cubic-bezier(0.16,1,0.3,1)",
          isOpen && "rotate-180 opacity-100 text-cyan-500"
        )} />
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
            <div className="pb-4 pl-[22px] pr-8">
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)] border-l-2 border-cyan-500/10 pl-4">
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}