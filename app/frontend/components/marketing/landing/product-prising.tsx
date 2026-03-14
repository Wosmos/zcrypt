"use client";

import { useRef, useState } from "react";
import { Check, X, ArrowRight, Crown, Zap, Shield } from "@/lib/icons";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { plans, competitors, trustBadges } from "@/lib/data";
import type { Plan } from "@/lib/data";

const iconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = { Zap, Crown };

// ─── Scatter configs for 3 cards: [Free, Pro, Plus] ─────────
// Left card flies left, center drops down, right flies right
const scatterConfigs = [
  { x: -80, y: 30, rotate: -7 },
  { x: 0, y: 70, rotate: 0 },
  { x: 80, y: 30, rotate: 7 },
];

function ScatterCard({
  plan,
  annual,
  index,
  scrollProgress,
}: {
  plan: Plan;
  annual: boolean;
  index: number;
  scrollProgress: MotionValue<number>;
}) {
  const scatter = scatterConfigs[index];

  // Bell-curve: assemble between 0.25–0.75, scatter at edges (enter/exit)
  const rawX = useTransform(scrollProgress, [0, 0.25, 0.75, 1], [
    scatter.x, 0, 0, scatter.x,
  ]);
  const rawY = useTransform(scrollProgress, [0, 0.25, 0.75, 1], [
    scatter.y, 0, 0, scatter.y,
  ]);
  const rawRotate = useTransform(scrollProgress, [0, 0.25, 0.75, 1], [
    scatter.rotate, 0, 0, scatter.rotate,
  ]);
  const rawOpacity = useTransform(scrollProgress, [0, 0.15, 0.85, 1], [
    0, 1, 1, 0,
  ]);
  const rawScale = useTransform(
    scrollProgress,
    [0, 0.25, 0.75, 1],
    plan.highlight
      ? [0.88, 1.04, 1.04, 0.88]
      : [0.92, 1, 1, 0.92]
  );

  const springCfg = { stiffness: 70, damping: 18 };
  const x = useSpring(rawX, springCfg);
  const y = useSpring(rawY, springCfg);
  const rotate = useSpring(rawRotate, springCfg);
  const scale = useSpring(rawScale, springCfg);

  return (
    <motion.div style={{ x, y, rotate, opacity: rawOpacity, scale }}>
      <PlanCard plan={plan} annual={annual} />
    </motion.div>
  );
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = annual ? plan.annual : plan.monthly;
  const isPaid = price > 0;
  const Icon = plan.icon ? iconMap[plan.icon] : null;
  const annualSavings =
    plan.monthly > 0 ? (plan.monthly - plan.annual) * 12 : 0;

  // ─── Highlighted "Most Popular" card ──────────────────────
  if (plan.highlight) {
    return (
      <div className="relative flex flex-col rounded-2xl p-px overflow-hidden z-10 lg:scale-[1.04]">
        {/* Animated gradient border */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "conic-gradient(from var(--border-angle, 0deg), #00d5e4, #3b82f6, #8b5cf6, #00d5e4)",
            animation: "borderRotate 3s linear infinite",
          }}
        />

        {/* Inner card — light/dark aware */}
        <div className="relative flex flex-col rounded-[15px] bg-white dark:bg-slate-950 m-px flex-1">
          {/* Ambient glow */}
          <div className="absolute inset-0 rounded-[15px] overflow-hidden pointer-events-none">
            <div className="absolute -top-1/2 -left-1/4 w-3/4 h-full bg-cyan-500/5 dark:bg-cyan-500/8 blur-[60px] rounded-full" />
            <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-blue-500/5 dark:bg-blue-500/6 blur-[40px] rounded-full" />
          </div>

          <div className="relative p-6 flex flex-col flex-1">
            {/* Badge */}
            <div className="absolute -top-px left-1/2 -translate-x-1/2 z-20">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-b-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-500/30">
                <Crown className="h-3 w-3" />
                {plan.badge}
              </span>
            </div>

            {/* Social proof */}
            {plan.socialProof && (
              <div className="mt-4 mb-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-cyan-600/80 dark:text-cyan-400/80 tracking-wide uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
                  {plan.socialProof}
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                {Icon && (
                  <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                )}
                <span className="text-sm font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  {plan.name}
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`${plan.name}-${annual}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white"
                  >
                    ${price}
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm text-slate-400">/mo</span>
              </div>

              {/* Annual savings callout */}
              {annual && annualSavings > 0 && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1"
                >
                  You save ${annualSavings}/year
                </motion.p>
              )}

              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {plan.desc}
              </p>
            </div>

            {/* Key Stats */}
            <div className="mt-5 grid grid-cols-1 gap-2">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-200 dark:border-white/10">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Storage
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {plan.storage}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-200 dark:border-white/10">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Max file
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {plan.maxFile}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Concurrent
                </span>
                <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">
                  {plan.concurrent}
                </span>
              </div>
            </div>

            {/* Features */}
            <ul className="mt-5 space-y-2.5 flex-1">
              {plan.features.map((f) => (
                <li key={f.text} className="flex items-start gap-2.5">
                  {f.included ? (
                    <Check className="h-4 w-4 text-cyan-500 dark:text-cyan-400 mt-0.5 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-sm leading-tight",
                      f.included
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-slate-400 dark:text-slate-600"
                    )}
                  >
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="mt-6">
              {isPaid ? (
                <button
                  disabled
                  className="relative flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white cursor-not-allowed overflow-hidden opacity-60"
                >
                  Coming Soon
                </button>
              ) : (
                <Link
                  href="/register"
                  className="relative flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-xl hover:shadow-cyan-500/25 transition-all duration-200 overflow-hidden"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                    initial={{ x: "-100%" }}
                    animate={{ x: "200%" }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatDelay: 3,
                      ease: "easeInOut",
                    }}
                  />
                </Link>
              )}
            </div>

            {/* Trust micro-copy */}
            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-3 flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" />
              30-day money-back guarantee
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Standard card ────────────────────────────────────────
  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/50 p-6 transition-all">
      <div>
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon className="h-4 w-4 text-cyan-500" />}
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {plan.name}
          </span>
        </div>

        <div className="flex items-baseline gap-1 mb-1">
          <AnimatePresence mode="wait">
            <motion.span
              key={`${plan.name}-${annual}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white"
            >
              ${price}
            </motion.span>
          </AnimatePresence>
          <span className="text-sm text-slate-400">/mo</span>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {plan.desc}
        </p>
      </div>

      {/* Key Stats */}
      <div className="mt-5 grid grid-cols-1 gap-2">
        <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
          <span className="text-xs text-slate-400">Storage</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {plan.storage}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
          <span className="text-xs text-slate-400">Max file</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {plan.maxFile}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5">
          <span className="text-xs text-slate-400">Concurrent</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            {plan.concurrent}
          </span>
        </div>
      </div>

      {/* Features */}
      <ul className="mt-5 space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2.5">
            {f.included ? (
              <Check className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
            ) : (
              <X className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
            )}
            <span
              className={cn(
                "text-sm leading-tight",
                f.included
                  ? "text-slate-600 dark:text-slate-400"
                  : "text-slate-400 dark:text-slate-600"
              )}
            >
              {f.text}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-6">
        {isPaid ? (
          <button
            disabled
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed"
          >
            Coming Soon
          </button>
        ) : (
          <Link
            href="/register"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Full pass-through: 0 = grid top at viewport bottom, 1 = grid bottom at viewport top
  const { scrollYProgress } = useScroll({
    target: gridRef,
    offset: ["start end", "end start"],
  });

  return (
    <section id="pricing" className="py-24 px-6 relative overflow-hidden">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
            Pricing
          </p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Privacy shouldn&apos;t cost a fortune.
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg max-w-xl mx-auto">
            More storage, better encryption, lower price. Simple.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 bg-slate-100 dark:bg-white/5 rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-all",
                !annual
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-all relative",
                annual
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              Annual
              <span className="absolute -top-2.5 -right-3 text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
                -25%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards — 3-column, Pro centered, bidirectional scatter */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start"
        >
          {plans.map((plan, i) => (
            <ScatterCard
              key={plan.name}
              plan={plan}
              annual={annual}
              index={i}
              scrollProgress={scrollYProgress}
            />
          ))}
        </div>

        {/* Competitor Comparison */}
        <div className="mt-20">
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              See how we stack up.
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-lg mx-auto">
              More privacy. More storage. Less money. Not even close.
            </p>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 pr-4">
                    Provider
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 px-3">
                    Price
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 px-3">
                    Storage
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 px-3">
                    Zero-Knowledge
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 px-3">
                    BYOB
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider pb-4 pl-3">
                    Open Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr
                    key={c.name}
                    className={cn(
                      "border-t border-slate-100 dark:border-white/5",
                      c.highlight &&
                        "bg-cyan-500/[0.04] dark:bg-cyan-500/[0.02]"
                    )}
                  >
                    <td className="py-4 pr-4">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          c.highlight
                            ? "text-cyan-600 dark:text-cyan-400"
                            : "text-slate-700 dark:text-slate-300"
                        )}
                      >
                        {c.name}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-center">
                      <span
                        className={cn(
                          "text-sm font-bold",
                          c.highlight
                            ? "text-cyan-600 dark:text-cyan-400"
                            : "text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {c.price}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-center">
                      <span
                        className={cn(
                          "text-sm font-bold",
                          c.highlight
                            ? "text-cyan-600 dark:text-cyan-400"
                            : "text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {c.storage}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-center">
                      {c.zeroKnowledge ? (
                        <Check
                          className={cn(
                            "h-5 w-5 mx-auto",
                            c.highlight ? "text-cyan-500" : "text-slate-400"
                          )}
                        />
                      ) : (
                        <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                    <td className="py-4 px-3 text-center">
                      {c.byob ? (
                        <Check
                          className={cn(
                            "h-5 w-5 mx-auto",
                            c.highlight ? "text-cyan-500" : "text-slate-400"
                          )}
                        />
                      ) : (
                        <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                    <td className="py-4 pl-3 text-center">
                      {c.openSource ? (
                        <Check
                          className={cn(
                            "h-5 w-5 mx-auto",
                            c.highlight ? "text-cyan-500" : "text-slate-400"
                          )}
                        />
                      ) : (
                        <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Trust Bar */}
        <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-8 opacity-40">
            {trustBadges.map((badge) => (
              <span
                key={badge}
                className="text-[10px] font-bold tracking-widest uppercase"
              >
                {badge}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Prices shown in USD. Annual billing saves 25%.
          </p>
        </div>
      </div>
    </section>
  );
}
