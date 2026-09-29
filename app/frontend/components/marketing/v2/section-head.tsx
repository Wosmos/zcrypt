import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHead({
  id,
  eyebrow,
  title,
  lede,
  align = "center",
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn("pv2-head", align === "left" && "pv2-head-left", className)}>
      <p className="pv2-eyebrow">{eyebrow}</p>
      <h2 id={id} className="pv2-h2">
        {title}
        <span className="pv2-dot" aria-hidden="true">
          .
        </span>
      </h2>
      {lede ? <p className="pv2-lede">{lede}</p> : null}
    </div>
  );
}
