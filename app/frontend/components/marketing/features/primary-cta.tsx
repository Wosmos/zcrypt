import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/lib/icons";

/**
 * Canonical class string for the gradient primary CTA button used across every
 * features/* and vs/* marketing page (hero primary + closing CTA). Exported so
 * callers may inline the markup with the exact same styling instead of
 * importing the component.
 */
export const PRIMARY_CTA_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50";

export interface PrimaryCtaProps {
  /** Button label text. Default "Create your vault". */
  label?: ReactNode;
  /** Link target. Default "/register". */
  href?: string;
  /** Extra classes appended after the canonical string (rarely needed). */
  className?: string;
}

/**
 * The identical gradient "Create your vault" button that appears in every
 * marketing hero and closing CTA. Renders a next/link with the canonical
 * gradient styling and a trailing arrow.
 */
export function PrimaryCta({
  label = "Create your vault",
  href = "/register",
  className,
}: PrimaryCtaProps) {
  return (
    <Link href={href} className={className ? `${PRIMARY_CTA_CLASS} ${className}` : PRIMARY_CTA_CLASS}>
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
