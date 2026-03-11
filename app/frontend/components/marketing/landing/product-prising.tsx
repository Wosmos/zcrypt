"use client";

import { useState } from "react";
import { Check, X, ArrowRight, Crown, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    desc: "Get started with generous free storage.",
    storage: "10 GB",
    maxFile: "500 MB",
    concurrent: "2 uploads",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "5 shares per month", included: true },
      { text: "CLI access", included: false },
      { text: "BYOB (Bring Your Own Backend)", included: false },
    ],
    highlight: false,
    badge: null,
    icon: null,
  },
  {
    name: "Plus",
    monthly: 4,
    annual: 3,
    desc: "For power users who need more space.",
    storage: "200 GB",
    maxFile: "5 GB",
    concurrent: "5 uploads",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "Unlimited shares", included: true },
      { text: "CLI access", included: true },
      { text: "BYOB (Bring Your Own Backend)", included: false },
    ],
    highlight: false,
    badge: null,
    icon: Zap,
  },
  {
    name: "Pro",
    monthly: 9,
    annual: 7,
    desc: "Maximum storage. Maximum freedom.",
    storage: "2 TB",
    maxFile: "25 GB",
    concurrent: "Unlimited",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "Unlimited shares", included: true },
      { text: "CLI access", included: true },
      { text: "BYOB (Bring Your Own Backend)", included: true },
    ],
    highlight: true,
    badge: "Best Value",
    icon: Crown,
  },
  {
    name: "Team",
    monthly: 6,
    annual: 5,
    desc: "Per user. Secure collaboration at scale.",
    storage: "1 TB / seat",
    maxFile: "25 GB",
    concurrent: "Unlimited",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "Unlimited shares", included: true },
      { text: "CLI access", included: true },
      { text: "BYOB (Bring Your Own Backend)", included: true },
    ],
    highlight: false,
    badge: null,
    icon: Sparkles,
  },
];

const competitors = [
  {
    name: "zpush Pro",
    price: "$9/mo",
    storage: "2 TB",
    zeroKnowledge: true,
    byob: true,
    openSource: true,
    highlight: true,
  },
  {
    name: "Dropbox Plus",
    price: "$12/mo",
    storage: "2 TB",
    zeroKnowledge: false,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Google One",
    price: "$10/mo",
    storage: "2 TB",
    zeroKnowledge: false,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Proton Drive",
    price: "$10/mo",
    storage: "500 GB",
    zeroKnowledge: true,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Tresorit",
    price: "$14/mo",
    storage: "1 TB",
    zeroKnowledge: true,
    byob: false,
    openSource: false,
    highlight: false,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-24 px-6 relative">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
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
              <span className="absolute -top-2.5 -right-3 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                -25%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const price = annual ? plan.annual : plan.monthly;
            const isPaid = price > 0;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  plan.highlight
                    ? "border-emerald-500/50 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.02] shadow-xl shadow-emerald-500/10 scale-[1.02] z-10"
                    : "border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950/50"
                )}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-lg shadow-emerald-500/30">
                      <Crown className="h-3 w-3" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {plan.icon && (
                      <plan.icon className="h-4 w-4 text-emerald-500" />
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
                    <span className="text-sm text-slate-400">
                      {plan.name === "Team" ? "/user/mo" : "/mo"}
                    </span>
                  </div>

                  <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {plan.desc}
                  </p>
                </div>

                {/* Key Stats */}
                <div className="mt-5 grid grid-cols-1 gap-2">
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                    <span className="text-xs text-slate-400">Storage</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{plan.storage}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-white/5">
                    <span className="text-xs text-slate-400">Max file</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{plan.maxFile}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-xs text-slate-400">Concurrent</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{plan.concurrent}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="mt-5 space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5">
                      {f.included ? (
                        <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-0.5 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-[13px] leading-tight",
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
                      className={cn(
                        "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200",
                        plan.highlight
                          ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                          : "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90"
                      )}
                    >
                      Get Started Free
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
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
                      c.highlight && "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02]"
                    )}
                  >
                    <td className="py-4 pr-4">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          c.highlight
                            ? "text-emerald-600 dark:text-emerald-400"
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
                            ? "text-emerald-600 dark:text-emerald-400"
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
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-slate-600 dark:text-slate-400"
                        )}
                      >
                        {c.storage}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-center">
                      {c.zeroKnowledge ? (
                        <Check className={cn("h-5 w-5 mx-auto", c.highlight ? "text-emerald-500" : "text-slate-400")} />
                      ) : (
                        <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                    <td className="py-4 px-3 text-center">
                      {c.byob ? (
                        <Check className={cn("h-5 w-5 mx-auto", c.highlight ? "text-emerald-500" : "text-slate-400")} />
                      ) : (
                        <X className="h-5 w-5 mx-auto text-slate-300 dark:text-slate-600" />
                      )}
                    </td>
                    <td className="py-4 pl-3 text-center">
                      {c.openSource ? (
                        <Check className={cn("h-5 w-5 mx-auto", c.highlight ? "text-emerald-500" : "text-slate-400")} />
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
            <span className="text-[10px] font-bold tracking-widest uppercase">AES-256 Compliant</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">Open Source</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">GDPR Ready</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Prices shown in USD. Annual billing saves 25%.
          </p>
        </div>
      </div>
    </section>
  );
}
