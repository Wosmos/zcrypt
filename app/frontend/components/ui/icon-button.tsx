"use client";

import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Icon component (from "@/lib/icons"). */
  icon: IconComponent;
  /** Accessible label — used for both the tooltip text and aria-label. */
  label: string;
  /** Visual style of the underlying Button. */
  variant?: "primary" | "secondary" | "danger" | "ghost";
  /** Tooltip placement. */
  side?: "top" | "right" | "bottom" | "left";
  /** Icon size class override (defaults to h-4 w-4). */
  iconClassName?: string;
}

/**
 * Icon-only button — the app-wide standard for icon actions. Always renders a
 * shadcn Tooltip showing `label` and sets `aria-label`, so every icon action
 * stays accessible and consistent.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { icon: Icon, label, variant = "ghost", side = "top", iconClassName, className, ...props },
    ref
  ) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant={variant}
            size="icon"
            aria-label={label}
            className={className}
            {...props}
          >
            <Icon className={cn("h-4 w-4", iconClassName)} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
);

IconButton.displayName = "IconButton";
