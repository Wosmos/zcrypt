import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

const BASE = "inline-flex items-center justify-center gap-2 rounded-full font-semibold";

const VARIANTS = {
  primary:
    "bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50",
  secondary:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]",
} as const;

const SIZES = {
  md: { primary: "pv2-cta px-7", secondary: "pv2-cta px-6" },
  lg: { primary: "px-8 py-3.5 text-base", secondary: "px-8 py-3.5 text-base" },
} as const;

export type PillVariant = keyof typeof VARIANTS;

export function pillClass(variant: PillVariant = "primary", size: keyof typeof SIZES = "md") {
  return cn(BASE, VARIANTS[variant], SIZES[size][variant]);
}

/** The homepage pill CTA: gradient primary or outline secondary. */
export function PillLink({
  href,
  variant = "primary",
  size = "md",
  icon: Icon,
  arrow,
  external,
  children,
  className,
}: {
  href: string;
  variant?: PillVariant;
  size?: keyof typeof SIZES;
  icon?: ComponentType<{ className?: string }>;
  arrow?: boolean;
  external?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const showArrow = arrow ?? variant === "primary";
  const body = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
      {showArrow ? <ArrowRight className="h-4 w-4" /> : null}
    </>
  );
  const cls = cn(pillClass(variant, size), className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}
