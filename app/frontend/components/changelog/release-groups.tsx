"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ChangeKind, Release } from "@/lib/changelog";

const KIND_STYLES: Record<ChangeKind, { chip: string; dot: string }> = {
  new: {
    chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
  },
  improved: {
    chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  fixed: {
    chip: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  security: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
};

export function KindChip({ kind, className }: { kind: ChangeKind; className?: string }) {
  const t = useTranslations("changelog.page.kinds");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
        KIND_STYLES[kind].chip,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", KIND_STYLES[kind].dot)} />
      {t(kind)}
    </span>
  );
}

export function ReleaseGroups({
  release,
  compact = false,
  className,
}: {
  release: Release;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations(`changelog.${release.key}.items`);
  return (
    <div className={cn("space-y-6", className)}>
      {release.groups.map((group) => (
        <section key={group.kind} aria-label={group.kind} data-kind={group.kind}>
          <KindChip kind={group.kind} />
          <ul
            className={cn(
              "mt-3 space-y-2.5 text-[var(--color-text-secondary)]",
              compact ? "text-sm leading-relaxed" : "text-[15px] leading-relaxed",
            )}
          >
            {group.items.map((item) => (
              <li key={item} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-[0.6em] h-1 w-1 flex-none rounded-full",
                    KIND_STYLES[group.kind].dot,
                  )}
                />
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
