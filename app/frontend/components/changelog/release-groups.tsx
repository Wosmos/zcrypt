"use client";

import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, ShieldCheck, Sparkles, Zap } from "@/lib/icons";
import type { ChangeKind, Release } from "@/lib/changelog";

export const KIND_ICON: Record<ChangeKind, ComponentType<{ className?: string }>> = {
  new: Sparkles,
  improved: Zap,
  fixed: CheckCircle2,
  security: ShieldCheck,
};

export const KIND_STYLES: Record<ChangeKind, { chip: string; dot: string; icon: string }> = {
  new: {
    chip: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    icon: "text-cyan-600 dark:text-cyan-300",
  },
  improved: {
    chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
    icon: "text-sky-600 dark:text-sky-300",
  },
  fixed: {
    chip: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    icon: "text-amber-600 dark:text-amber-300",
  },
  security: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    icon: "text-emerald-600 dark:text-emerald-300",
  },
};

export function KindChip({ kind, className }: { kind: ChangeKind; className?: string }) {
  const t = useTranslations("changelog.page.kinds");
  const Icon = KIND_ICON[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]",
        KIND_STYLES[kind].chip,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
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

export function KindCounts({ release, className }: { release: Release; className?: string }) {
  const t = useTranslations("changelog.page.kinds");
  return (
    <ul className={cn("m-0 flex list-none flex-wrap items-center gap-1.5 p-0", className)}>
      {release.groups.map((g) => {
        const Icon = KIND_ICON[g.kind];
        return (
          <li
            key={g.kind}
            title={`${t(g.kind)}: ${g.items.length}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
              KIND_STYLES[g.kind].chip,
            )}
          >
            <Icon className="h-3 w-3" />
            <span aria-hidden="true">{g.items.length}</span>
            <span className="sr-only">{`${t(g.kind)}: ${g.items.length}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
