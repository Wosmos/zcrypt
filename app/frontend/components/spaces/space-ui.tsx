"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { HTMLAttributes } from "react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { AvatarStack } from "@/components/ui/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/utils";
import { spacePerms } from "@/lib/spaces";
import type { SharedVault } from "@/types";
import { AlertTriangle, File as FileIcon, Users } from "@/lib/icons";

const ROLE_VARIANT = {
  Owner: "accent",
  Admin: "violet",
  Editor: "blue",
  Viewer: "muted",
} as const;

export function RoleBadge({ role }: { role: "Owner" | "Admin" | "Editor" | "Viewer" }) {
  const t = useTranslations("spaces");
  return (
    <Badge variant={ROLE_VARIANT[role]} className="flex-shrink-0 px-2 py-0 text-[11px]">
      {t(`role.${role.toLowerCase()}`)}
    </Badge>
  );
}

export function StorageMeter({ used, limit }: { used: number; limit: number }) {
  const t = useTranslations("spaces");
  if (limit <= 0) {
    return (
      <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {t("card.storageUsed", { used: formatBytes(used) })}
      </p>
    );
  }
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
      >
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : "bg-[var(--color-accent)]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {t("card.storageOf", { used: formatBytes(used), limit: formatBytes(limit) })}
      </p>
    </div>
  );
}

export function SpaceCard({
  vault,
  name,
  description,
  userId,
  index,
  itemProps,
}: {
  vault: SharedVault;
  name: string;
  description: string;
  userId: string | undefined;
  index: number;
  itemProps: HTMLAttributes<HTMLAnchorElement> & { "data-item-id": string };
}) {
  const t = useTranslations("spaces");
  const perms = spacePerms(vault, userId);
  const files = vault.file_count ?? vault.file_ids?.length ?? 0;
  const members = vault.member_count ?? 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="h-full"
    >
      <Link
        href={`/spaces/${vault.id}`}
        role="option"
        {...itemProps}
        className="panel group flex h-full w-full flex-col gap-4 p-5 text-left outline-none transition-colors hover:border-[var(--color-border-hover)] focus-visible:border-[var(--color-accent)]/50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
              <RoleBadge role={perms.label} />
            </div>
            <p className="mt-0.5 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {description || t("card.noDescription")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <StorageMeter used={vault.used_bytes ?? 0} limit={vault.size_limit_bytes} />
          {vault.needs_rotation && perms.rotate && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {t("card.rotationPending")}
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <AvatarStack members={vault.member_preview ?? []} total={members} />
          <span className="flex items-center gap-1.5 text-xs tabular-nums text-[var(--color-text-muted)]">
            <FileIcon className="h-3.5 w-3.5" />
            {t("shared.fileCount", { count: files })}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

export function SpaceCardSkeleton() {
  return (
    <div className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/5 rounded-md" />
          <Skeleton className="h-3 w-4/5 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-3 w-1/3 rounded-md" />
      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-3 w-12 rounded-md" />
      </div>
    </div>
  );
}
