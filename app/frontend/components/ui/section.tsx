import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionProps {
  /** Optional section heading. */
  title?: string;
  /** Optional supporting copy under the heading. */
  description?: string;
  /** Right-aligned actions for this section (buttons, links). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A labelled content section to compose inside a `.panel`: optional title/description + actions, then children. */
export function Section({ title, description, actions, children, className }: SectionProps) {
  const hasHeader = title || description || actions;
  return (
    <section className={cn("space-y-4", className)}>
      {hasHeader && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
