"use client";

import { motion } from "motion/react";
import { Shield, Zap, Lock, HardDrive, RefreshCcw, Globe } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { bentoFeatures } from "@/lib/data";

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Shield,
  Zap,
  Lock,
  HardDrive,
  RefreshCcw,
  Globe,
};

export function BentoGrid() {
  return (
    <section className="py-24 px-4 bg-[var(--color-bg)]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
            Features
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Built for privacy
          </h2>
        </div>
        {/* Dense Grid Construction */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {bentoFeatures.map((f, i) => {
            const Icon = iconMap[f.icon];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-all hover:border-[var(--color-text-muted)]",
                  f.span
                )}
              >
                {/* 1. Background Pattern: Fills the white space */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none">
                  <div className="absolute inset-0 bg-[radial-gradient(#808080_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
                </div>

                {/* 2. Hover Glow: Makes the card feel "alive" */}
                <div className={cn(
                  "absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br to-transparent blur-xl -z-10",
                  f.bg
                )} />

                <div className="relative z-10 h-full flex flex-col">
                  <div className="mb-4 inline-flex items-center justify-center h-10 w-10 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-primary)] group-hover:scale-110 group-hover:text-cyan-500 transition-all">
                    {Icon && <Icon size={20} />}
                  </div>

                  <div className="mt-auto">
                    <h3 className="text-base font-bold tracking-tight mb-1 text-[var(--color-text-primary)]">
                      {f.title}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-snug">
                      {f.desc}
                    </p>
                  </div>
                </div>

                {/* 3. Subtle corner accent */}
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
