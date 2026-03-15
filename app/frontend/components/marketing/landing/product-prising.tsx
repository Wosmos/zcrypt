"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X, ArrowRight, Crown, Zap, Shield, Sparkles } from "@/lib/icons";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  useInView,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";
import { plans as defaultPlans, competitors, trustBadges } from "@/lib/data";
import type { Plan } from "@/lib/data";
import { getPlans } from "@/lib/api";
import type { PlanConfig } from "@/types";

const iconMap: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = { Zap, Crown };

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
  const scatter = scatterConfigs[index] ?? { x: 0, y: 50, rotate: 0 };

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

  if (plan.highlight) {
    return (
      <div className="relative flex flex-col rounded-2xl p-px overflow-hidden z-10 lg:scale-[1.04]">
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "conic-gradient(from var(--border-angle, 0deg), #00d5e4, #3b82f6, #8b5cf6, #00d5e4)",
            animation: "borderRotate 3s linear infinite",
          }}
        />

        <div className="relative flex flex-col rounded-[15px] bg-white dark:bg-slate-950 m-px flex-1 overflow-hidden">
          {/* Mesh gradient */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-1/2 -left-1/4 w-3/4 h-full bg-cyan-500/[0.07] dark:bg-cyan-500/[0.08] blur-[60px] rounded-full" />
            <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-blue-500/[0.06] blur-[40px] rounded-full" />
            <div className="absolute top-1/3 right-0 w-1/3 h-1/3 bg-violet-500/[0.04] blur-[40px] rounded-full" />
          </div>

          <div className="relative p-7 flex flex-col flex-1">
            <div className="absolute -top-px left-1/2 -translate-x-1/2 z-20">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-b-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-xs font-bold text-white shadow-lg shadow-cyan-500/30">
                <Crown className="h-3 w-3" />
                {plan.badge}
              </span>
            </div>

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
                {Icon && <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
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

            {/* Stats as pills */}
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-700 dark:text-cyan-300">
                {plan.storage}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-xs font-bold text-blue-700 dark:text-blue-300">
                {plan.maxFile} max
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 text-xs font-bold text-violet-700 dark:text-violet-300">
                {plan.concurrent}
              </span>
            </div>

            <ul className="mt-5 space-y-2.5 flex-1">
              {plan.features.map((f) => (
                <li key={f.text} className="flex items-start gap-2.5">
                  {f.included ? (
                    <div className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-cyan-500/15 dark:bg-cyan-500/20 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                  ) : (
                    <X className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
                  )}
                  <span className={cn("text-sm leading-tight", f.included ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-600")}>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>

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
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
                  />
                </Link>
              )}
            </div>

            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 mt-3 flex items-center justify-center gap-1">
              <Shield className="h-3 w-3" />
              30-day money-back guarantee
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Standard card — glass morphism ─────────────────────
  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-950/50 backdrop-blur-sm p-7 transition-all hover:border-slate-300 dark:hover:border-white/15 hover:shadow-lg hover:shadow-slate-900/5 dark:hover:shadow-black/20 group">
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-slate-300/50 dark:via-white/10 to-transparent" />

      <div>
        <div className="flex items-center gap-2 mb-2">
          {Icon && (
            <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/10 transition-colors">
              <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 group-hover:text-cyan-500 transition-colors" />
            </div>
          )}
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

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {plan.storage}
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {plan.maxFile} max
        </span>
        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {plan.concurrent}
        </span>
      </div>

      <ul className="mt-5 space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2.5">
            {f.included ? (
              <Check className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
            ) : (
              <X className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
            )}
            <span className={cn("text-sm leading-tight", f.included ? "text-slate-600 dark:text-slate-400" : "text-slate-400 dark:text-slate-600")}>
              {f.text}
            </span>
          </li>
        ))}
      </ul>

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

function mapApiPlanToFrontend(p: PlanConfig): Plan {
  return {
    name: p.name,
    monthly: p.monthly_price,
    annual: p.annual_price,
    desc: p.description,
    storage: p.storage_display,
    maxFile: p.max_file_display,
    concurrent: p.concurrent_display,
    features: p.features,
    highlight: p.highlight,
    badge: p.badge,
    icon: p.icon,
    socialProof: p.social_proof ?? undefined,
  };
}

function ComparisonRow({ c, index }: { c: (typeof competitors)[number]; index: number }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });

  return (
    <motion.tr
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className={cn(
        "border-t border-slate-100 dark:border-white/5",
        c.highlight &&
          "bg-gradient-to-r from-cyan-500/[0.06] via-blue-500/[0.03] to-transparent dark:from-cyan-500/[0.04] dark:via-blue-500/[0.02]"
      )}
    >
      <td className="py-4 px-4">
        <span className={cn("text-sm font-semibold", c.highlight ? "text-cyan-600 dark:text-cyan-400" : "text-slate-700 dark:text-slate-300")}>
          {c.name}
          {c.highlight && (
            <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
              <Sparkles className="h-2.5 w-2.5" />
              You
            </span>
          )}
        </span>
      </td>
      <td className="py-4 px-3 text-center">
        <span className={cn("text-sm font-bold", c.highlight ? "text-cyan-600 dark:text-cyan-400" : "text-slate-600 dark:text-slate-400")}>
          {c.price}
        </span>
      </td>
      <td className="py-4 px-3 text-center">
        <span className={cn("text-sm font-bold", c.highlight ? "text-cyan-600 dark:text-cyan-400" : "text-slate-600 dark:text-slate-400")}>
          {c.storage}
        </span>
      </td>
      {[c.zeroKnowledge, c.byob, c.openSource].map((val, i) => (
        <td key={i} className="py-4 px-3 text-center">
          {val ? (
            <div className={cn("h-6 w-6 mx-auto rounded-full flex items-center justify-center", c.highlight ? "bg-cyan-500/15" : "bg-slate-100 dark:bg-white/5")}>
              <Check className={cn("h-3.5 w-3.5", c.highlight ? "text-cyan-500" : "text-slate-400")} />
            </div>
          ) : (
            <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
          )}
        </td>
      ))}
    </motion.tr>
  );
}

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const headerInView = useInView(sectionRef, { once: true, margin: "-60px" });

  useEffect(() => {
    getPlans()
      .then((res) => {
        const sorted = res.plans
          .filter((p) => p.monthly_price > 0 || p.id === "free")
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(mapApiPlanToFrontend);
        if (sorted.length > 0) {
          const highlightIdx = sorted.findIndex((p) => p.highlight);
          if (highlightIdx > -1 && sorted.length >= 3) {
            const centerIdx = Math.floor(sorted.length / 2);
            if (highlightIdx !== centerIdx) {
              const [highlighted] = sorted.splice(highlightIdx, 1);
              sorted.splice(centerIdx, 0, highlighted);
            }
          }
          setPlans(sorted);
        }
      })
      .catch(() => {});
  }, []);

  const { scrollYProgress } = useScroll({
    target: gridRef,
    offset: ["start end", "end start"],
  });

  return (
    <section id="pricing" className="py-24 px-6 relative overflow-hidden">
      {/* Section background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(0,147,163,0.06),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,213,228,0.04),transparent_70%)]" />
      </div>

      <div ref={sectionRef} className="mx-auto max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-4">
            <Sparkles className="h-3 w-3" />
            Pricing
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Privacy shouldn&apos;t cost a fortune.
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg max-w-xl mx-auto">
            More storage, better encryption, lower price. Simple.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 bg-slate-100/80 dark:bg-white/5 rounded-full p-1 backdrop-blur-sm border border-slate-200/50 dark:border-white/5">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-semibold transition-all",
                !annual
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
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
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              Annual
              <span className="absolute -top-2.5 -right-3 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                -25%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Cards */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {plans.map((plan, i) => (
            <ScatterCard key={plan.name} plan={plan} annual={annual} index={i} scrollProgress={scrollYProgress} />
          ))}
        </div>

        {/* Comparison */}
        <div className="mt-24">
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              See how we stack up.
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-lg mx-auto">
              More privacy. More storage. Less money. Not even close.
            </p>
          </div>

          <div className="overflow-x-auto -mx-6 px-6">
            <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-slate-950/40 backdrop-blur-sm overflow-hidden">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                    {["Provider", "Price", "Storage", "Zero-Knowledge", "BYOB", "Open Source"].map((h, i) => (
                      <th key={h} className={cn("text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3 px-3", i === 0 ? "text-left px-4" : "text-center")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {competitors.map((c, i) => (
                    <ComparisonRow key={c.name} c={c} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-14 flex flex-col md:flex-row items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-8">
            {trustBadges.map((badge) => (
              <span key={badge} className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-slate-400/60">
                <Shield className="h-3 w-3" />
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
