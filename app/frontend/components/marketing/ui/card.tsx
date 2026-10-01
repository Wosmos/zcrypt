import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The homepage card surface (trust cards, story beats): gradient fill, soft ring, squircle corners. */
export const cardSurface = "pv2-card pv2-ring corner-squircle";

/** Smaller radius for dense grids. */
export const cardSurfaceSm = "pv2-card pv2-card-sm pv2-ring corner-squircle";

export function IconWell({
  icon: Icon,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <span className={cn("pv2-ic corner-squircle", className)} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function MarketingCard({
  as: Tag = "article",
  size = "md",
  className,
  children,
}: {
  as?: "article" | "div" | "li";
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn(size === "sm" ? cardSurfaceSm : cardSurface, className)}>{children}</Tag>
  );
}
