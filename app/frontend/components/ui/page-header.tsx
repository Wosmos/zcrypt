import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Primary page title rendered as an h1. */
  title: string;
  /** Optional supporting copy shown beneath the title. */
  description?: string;
  /** Small uppercase label rendered above the title (e.g. section name). */
  eyebrow?: string;
  /** Right-aligned actions slot (buttons, menus). */
  actions?: ReactNode;
  className?: string;
}

/** Standard page title block: eyebrow label, h1, description and a right-aligned actions slot. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        {description && (
          <p className="hidden md:flex max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-2 sm:pt-0.5">{actions}</div>
      )}
    </div>
  );
}
