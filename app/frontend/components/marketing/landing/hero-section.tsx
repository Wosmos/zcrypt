"use client";

import Link from "next/link";
import { Shield, ArrowRight } from "@/lib/icons";
import { Underlined } from "./pencil-underline";
import { MarketingHero } from "@/components/marketing/marketing-hero";

export function HeroSection() {
  return (
    <MarketingHero
      minHeight="min-h-dvh"
      badge={
        <div className="inline-flex items-center gap-2.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-sm font-medium text-cyan-600 backdrop-blur-sm dark:text-cyan-400">
          <Shield className="h-3.5 w-3.5" />
          <span className="tracking-wide">Private by design</span>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
        </div>
      }
      headline={
        <h1 className="font-heading text-[2.75rem] font-bold leading-[1.12] tracking-tight sm:text-6xl lg:text-7xl">
          <span className="mx-auto block w-fit px-1 pt-1 pb-3 italic leading-[1.2] bg-gradient-to-r from-cyan-500 via-cyan-600 to-cyan-400 bg-clip-text text-transparent dark:from-cyan-400 dark:to-cyan-300">
            The Encrypted Drive
          </span>
          You{" "}
          <Underlined variant="ink" delay={0.5}>
            Actually Own
          </Underlined>
        </h1>
      }
      subtext={
        <>
          A real drive — folders, instant previews, organized your way —
          encrypted before anything leaves your device and stored in accounts
          you already own,{" "}
          <Underlined variant="highlight" delay={0.6}>
            readable only by you
          </Underlined>
          .
        </>
      }
      cta={
        <Link
          href="/register"
          className="inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-base font-semibold text-slate-900 bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
        >
          Create your vault
          <ArrowRight className="h-4 w-4" />
        </Link>
      }
    />
  );
}
