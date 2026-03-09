"use client";

import { Check, ArrowRight, Minus } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Legacy Cloud",
    price: "$20",
    desc: "Centralized storage with hidden fees.",
    features: ["Egress bandwidth limits", "Closed-source security", "Server-side encryption only", "Ad-targeted metadata"],
    highlight: false,
  },
  {
    name: "zpush",
    price: "$0",
    desc: "The open-source privacy standard.",
    features: ["Zero egress fees", "100% Client-side encryption", "Publicly auditable code", "Infinite Git-LFS storage"],
    highlight: true,
  },
  {
    name: "Cold Storage",
    price: "Usage",
    desc: "Complex AWS/Azure configurations.",
    features: ["Slow retrieval times", "Per-request pricing", "Complex CLI setup", "Vendor lock-in"],
    highlight: false,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6 relative">
      <div className="mx-auto max-w-5xl">
        {/* Header: Clean & Sophisticated */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            The new economics of storage.
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg max-w-xl mx-auto">
            zpush leverages Git-based protocols to remove the middlemen. 
            High performance, zero cost.
          </p>
        </div>

        {/* Pricing Grid: Balanced & Minimal */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 dark:bg-white/5 rounded-3xl overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col p-8 md:p-10 transition-colors bg-white dark:bg-slate-950",
                plan.highlight ? "z-10" : "bg-slate-50/50 dark:bg-slate-950/50"
              )}
            >
              {/* Subtle Highlight Glow for the center card */}
              {plan.highlight && (
                <div className="absolute inset-0 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.01] pointer-events-none" />
              )}

              <div className="relative z-10">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.2em] mb-4 block",
                  plan.highlight ? "text-emerald-500" : "text-slate-400"
                )}>
                  {plan.name}
                </span>
                
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="text-sm font-medium text-slate-400">/mo</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed min-h-[40px]">
                  {plan.desc}
                </p>
              </div>

              {/* Feature List */}
              <ul className="mt-10 space-y-4 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    {plan.highlight ? (
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Minus className="h-4 w-4 text-slate-300 dark:text-slate-700 mt-0.5 shrink-0" />
                    )}
                    <span className="text-[13px] text-slate-600 dark:text-slate-400 leading-tight">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Call to Action */}
              <div className="mt-10">
                <Link
                  href={plan.highlight ? "/register" : "#"}
                  className={cn(
                    "flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200",
                    plan.highlight
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-xl"
                      : "bg-transparent border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  {plan.highlight ? "Get Started" : "Compare"}
                  {plan.highlight && <ArrowRight className="h-4 w-4" />}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom "Audit" Footer */}
        <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-8 opacity-40 grayscale">
            <span className="text-[10px] font-bold tracking-widest uppercase">AES-256 Compliant</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">Open Source</span>
            <span className="text-[10px] font-bold tracking-widest uppercase">GDPR Ready</span>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Over <span className="text-emerald-500 font-bold">12.4PB</span> of data secured via zpush protocol.
          </p>
        </div>
      </div>
    </section>
  );
}