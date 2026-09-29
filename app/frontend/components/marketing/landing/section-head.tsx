import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Accent } from "@/components/marketing/ui/page-hero";

/** Stable heading id from plain-text copy, for aria-labelledby. */
export function headId(text: ReactNode, fallback = "section") {
  const base = typeof text === "string" ? text : fallback;
  return `h-${base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
}

export function SectionHead({
  id,
  eyebrow,
  title,
  lede,
  accent,
  align = "center",
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  accent?: string | false;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("pv2-head", align === "left" && "pv2-head-left", className)}>
      {eyebrow ? <p className="pv2-eyebrow">{eyebrow}</p> : null}
      <h2 id={id} className="pv2-h2">
        {title}
        <Accent text={title} accent={accent} />
      </h2>
      {lede ? <p className="pv2-lede">{lede}</p> : null}
    </div>
  );
}
