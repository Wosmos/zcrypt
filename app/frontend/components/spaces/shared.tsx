"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { createElement, useEffect, useState, type ReactNode, type RefObject } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { defaultIsTypingTarget } from "@/hooks/useKeyboardSelection";
import { cn, fileIconFor } from "@/lib/utils";
import { Check, ChevronRight, Users } from "@/lib/icons";

export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

export function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  return createElement(fileIconFor(name), { className });
}

export function SpaceGlyph({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20",
        className,
      )}
    >
      <Users className="h-5 w-5" />
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function SpaceBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const t = useTranslations("spaces");
  return (
    <nav aria-label={t("shared.breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
              )}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className={cn(
                    "truncate rounded px-1 py-0.5 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]",
                    FOCUS_RING,
                  )}
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className="truncate px-1 py-0.5 font-medium text-[var(--color-text)]"
                >
                  {c.label || " "}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Press `/` anywhere (outside inputs) to focus the given search field. */
export function useSlashToFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (defaultIsTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref]);
}

/** Number of columns a CSS grid currently lays out, kept in sync on resize. */
export function useGridColumns(ref: RefObject<HTMLElement | null>, active: boolean): number {
  const [cols, setCols] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const measure = () => {
      const tpl = getComputedStyle(el).gridTemplateColumns;
      const n = tpl ? tpl.split(" ").filter(Boolean).length : 1;
      setCols(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return active ? cols : 1;
}

/** Polite screen-reader announcements for selection and bulk actions. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

export function ShortcutsHelp({ items, title }: { items: [string, string][]; title: string }) {
  const t = useTranslations("spaces");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || defaultIsTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("shared.shortcutsLabel")}
          title={t("shared.shortcutsHint")}
          className={cn(
            "hidden h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] md:inline-flex",
            FOCUS_RING,
          )}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {items.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-[var(--color-text-secondary)]">{action}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in space-y-6">{children}</div>;
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error";
  children: ReactNode;
}) {
  const tones = {
    info: "border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)]",
    warn: "border-amber-500/25 bg-amber-500/10 text-[var(--color-text)]",
    error: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-3.5 py-2.5 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

/** Visual selection tick for a row whose own role="option" carries the state. */
export function SelectTick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
        checked
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)]"
          : "border-[var(--color-border-hover)] bg-transparent",
      )}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </span>
  );
}
