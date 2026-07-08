import type { ComponentType, ReactNode } from "react";

export interface CapabilityItem {
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: ReactNode;
  desc: ReactNode;
  /** Shape-2 ("accent") only: gradient classes e.g. "from-cyan-500/15 to-cyan-500/5". */
  accent?: string;
  /** Shape-2 ("accent") only: icon color class e.g. "text-cyan-500". */
  color?: string;
}

export interface CapabilityGridProps {
  items: CapabilityItem[];
  /** Optional centered section heading. Omit both to render the grid only. */
  heading?: ReactNode;
  subheading?: ReactNode;
  /** "simple" (default) icon-tile card, or "accent" gradient-tile card. */
  variant?: "simple" | "accent";
  /** Grid column classes. Default 3-up responsive grid. */
  gridClassName?: string;
  /**
   * Section background. `false` (default) = plain px-4 py-20; `true` adds the
   * border-y + surface treatment used on alternating sections.
   */
  surface?: boolean;
  /** Max-width of the inner wrapper. Default "max-w-5xl". */
  className?: string;
}

/**
 * The repeated capability/pillar card grid used across features/* pages. Renders
 * an optional centered heading block above a responsive grid of icon cards.
 * Supports two card shapes: "simple" (flat cyan icon tile) and "accent"
 * (per-item gradient tile that scales on hover).
 */
export function CapabilityGrid({
  items,
  heading,
  subheading,
  variant = "simple",
  gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  surface = false,
  className = "max-w-5xl",
}: CapabilityGridProps) {
  const sectionClassName = surface
    ? "border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20"
    : "px-4 py-20";

  return (
    <section className={sectionClassName}>
      <div className={`mx-auto ${className}`}>
        {(heading || subheading) && (
          <div className="mx-auto mb-12 max-w-2xl text-center">
            {heading && (
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h2>
            )}
            {subheading && <p className="mt-3 text-[var(--color-text-secondary)]">{subheading}</p>}
          </div>
        )}

        <ul className={`${gridClassName} list-none`}>
          {items.map((item, i) => {
            const { Icon } = item;
            if (variant === "accent") {
              return (
                <li key={i}>
                  <article className="card group p-6 transition-colors hover:border-cyan-500/30">
                    <div
                      className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent ?? ""} ${item.color ?? ""} transition-transform group-hover:scale-110`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-bold">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {item.desc}
                    </p>
                  </article>
                </li>
              );
            }
            return (
              <li key={i}>
                <article className="card p-6 transition-colors hover:border-cyan-500/30">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {item.desc}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
