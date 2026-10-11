"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Lock, ShieldCheck } from "@/lib/icons";

export function DropOverlay({ active }: { active: boolean }) {
  const t = useTranslations("dashboard");
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="drop-overlay"
          role="presentation"
          className="pointer-events-none fixed inset-0 z-[60] p-3 sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <div className="absolute inset-0 bg-[var(--color-bg)]/80 backdrop-blur-md" />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 50% 50%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 70%)",
            }}
          />
          <motion.div
            className="relative flex h-full w-full flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-[var(--color-accent)]/70 shadow-[inset_0_0_60px_-20px_var(--color-accent)]"
            initial={{ scale: reduced ? 1 : 0.985 }}
            animate={{ scale: 1 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="relative grid h-24 w-24 place-items-center">
              {!reduced &&
                [0, 1].map((i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-[var(--color-accent)]"
                    initial={{ scale: 0.7, opacity: 0.55 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{
                      duration: 1.8,
                      ease: "easeOut",
                      repeat: Infinity,
                      delay: i * 0.9,
                    }}
                  />
                ))}
              <span className="relative grid h-20 w-20 place-items-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-surface)] shadow-[0_0_40px_-6px_var(--color-accent)]">
                <ShieldCheck className="h-9 w-9 text-[var(--color-accent)]" />
                <span className="absolute -bottom-1 -end-1 grid h-7 w-7 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                </span>
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5 px-6 text-center">
              <p className="text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl">
                {t("dropTitle")}
              </p>
              <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
                {t("dropHint")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
