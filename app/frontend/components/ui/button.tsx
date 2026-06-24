import { ButtonHTMLAttributes, forwardRef } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
}

const variantStyles = {
  primary:
    "bg-[#1a1f36] text-white hover:bg-[#252b45] active:bg-[#0f1225] dark:bg-cyan-600 dark:text-white dark:hover:bg-cyan-500 dark:active:bg-cyan-700 shadow-lg shadow-[#1a1f36]/20 dark:shadow-cyan-600/25",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-1)] border border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
  danger:
    "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30",
  ghost:
    "bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]",
};

const sizeStyles = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-6 text-sm gap-2 rounded-xl",
  icon: "h-9 w-9 p-0 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";

/**
 * CVA variants consumed by shadcn/ui primitives that expect
 * `buttonVariants` from `@/components/ui/button` (e.g. alert-dialog). The
 * bespoke `Button` component above keeps its own API; this is purely for
 * shadcn primitives and ad-hoc `className={buttonVariants(...)}` usage.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--color-accent-hover)] shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent hover:bg-[var(--color-surface-1)] hover:border-[var(--color-border-hover)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[var(--color-surface-3)]",
        ghost: "hover:bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
