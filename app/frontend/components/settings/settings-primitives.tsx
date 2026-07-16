"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Native-settings primitives — the iOS/Android "grouped list" look that replaces
 * the old card-under-card layout on mobile: an uppercase group label over a
 * single rounded container whose rows are separated by hairline dividers (not
 * nested cards). Used by the mobile settings index and inside sections.
 */

/** A labelled group: small uppercase caption + one rounded, divided container. */
export function SettingGroup({
  label,
  footnote,
  children,
  className,
}: {
  label?: string;
  footnote?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 divide-y divide-[var(--color-border)]">
        {children}
      </div>
      {footnote && <p className="px-1 text-xs text-[var(--color-text-muted)]">{footnote}</p>}
    </div>
  );
}

interface RowInner {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned trailing content (value text, badge, switch, chevron). */
  trailing?: ReactNode;
}

function RowBody({ icon, title, subtitle, trailing }: RowInner) {
  return (
    <>
      {icon && (
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)] transition-colors group-hover:text-[var(--color-accent)]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--color-text)]">{title}</span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">{subtitle}</span>
        )}
      </span>
      {trailing}
    </>
  );
}

/** A tappable row that navigates to `href` (shows a chevron). */
export function LinkRow({
  href,
  icon,
  title,
  subtitle,
  trailing,
}: { href: string } & RowInner) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-[var(--color-surface-1)] focus-visible:bg-[var(--color-surface-1)]"
    >
      <RowBody
        icon={icon}
        title={title}
        subtitle={subtitle}
        trailing={
          <span className="flex flex-shrink-0 items-center gap-2 text-[var(--color-text-muted)]">
            {trailing}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        }
      />
    </Link>
  );
}

/** A tappable row that fires `onClick` (used for in-view navigation / actions). */
export function ButtonRow({
  onClick,
  icon,
  title,
  subtitle,
  trailing,
  chevron = true,
}: { onClick: () => void; chevron?: boolean } & RowInner) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-[var(--color-surface-1)] focus-visible:bg-[var(--color-surface-1)]"
    >
      <RowBody
        icon={icon}
        title={title}
        subtitle={subtitle}
        trailing={
          <span className="flex flex-shrink-0 items-center gap-2 text-[var(--color-text-muted)]">
            {trailing}
            {chevron && <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </span>
        }
      />
    </button>
  );
}

/** A static row that carries a value or control (no navigation). */
export function ValueRow({ icon, title, subtitle, trailing }: RowInner) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      <RowBody icon={icon} title={title} subtitle={subtitle} trailing={<span className="flex-shrink-0">{trailing}</span>} />
    </div>
  );
}
