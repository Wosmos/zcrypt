"use client";

import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/utils";
import { spacePerms } from "@/lib/spaces";
import type { SharedVault } from "@/types";
import { AlertTriangle, File as FileIcon, Users } from "@/lib/icons";

function hueOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function MemberAvatar({
  id,
  label,
  className = "h-7 w-7 text-[11px]",
}: {
  id: string;
  label: string;
  className?: string;
}) {
  const hue = hueOf(id);
  return (
    <span
      aria-hidden
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold uppercase text-white ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 60% 52%), hsl(${(hue + 40) % 360} 60% 40%))`,
      }}
    >
      {(label.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function AvatarStack({
  members,
  total,
}: {
  members: { user_id: string; username: string }[];
  total: number;
}) {
  const extra = Math.max(0, total - members.length);
  return (
    <div className="flex items-center" aria-label={`${total} member${total === 1 ? "" : "s"}`}>
      <div className="flex -space-x-2">
        {members.map((m) => (
          <MemberAvatar
            key={m.user_id}
            id={m.user_id}
            label={m.username}
            className="h-7 w-7 text-[11px] ring-2 ring-[var(--color-surface)]"
          />
        ))}
        {extra > 0 && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] px-1.5 text-[11px] font-medium tabular-nums text-[var(--color-text-secondary)] ring-2 ring-[var(--color-surface)]">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

const ROLE_VARIANT = {
  Owner: "accent",
  Admin: "violet",
  Editor: "blue",
  Viewer: "muted",
} as const;

export function RoleBadge({ role }: { role: "Owner" | "Admin" | "Editor" | "Viewer" }) {
  return (
    <Badge variant={ROLE_VARIANT[role]} className="flex-shrink-0 px-2 py-0 text-[11px]">
      {role}
    </Badge>
  );
}

export function StorageMeter({ used, limit }: { used: number; limit: number }) {
  if (limit <= 0) {
    return (
      <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {formatBytes(used)} used
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
        {formatBytes(used)} of {formatBytes(limit)}
      </p>
    </div>
  );
}

export function SpaceCard({
  vault,
  userId,
  onOpen,
  index,
}: {
  vault: SharedVault;
  userId: string | undefined;
  onOpen: () => void;
  index: number;
}) {
  const perms = spacePerms(vault, userId);
  const files = vault.file_count ?? vault.file_ids?.length ?? 0;
  const members = vault.member_count ?? 1;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="panel group flex h-full w-full flex-col gap-4 p-5 text-left outline-none transition-colors hover:border-[var(--color-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{vault.name}</p>
            <RoleBadge role={perms.label} />
          </div>
          <p className="mt-0.5 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {vault.description || "No description"}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <StorageMeter used={vault.used_bytes ?? 0} limit={vault.size_limit_bytes} />
        {vault.needs_rotation && perms.manage && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Key rotation pending
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
        <AvatarStack members={vault.member_preview ?? []} total={members} />
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-[var(--color-text-muted)]">
          <FileIcon className="h-3.5 w-3.5" />
          {files} file{files === 1 ? "" : "s"}
        </span>
      </div>
    </motion.button>
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
