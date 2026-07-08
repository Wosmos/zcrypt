"use client";

import { useCallback, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { File, Copy, Check, ShieldCheck, Link2, Lock, Trash2 } from "@/lib/icons";
import { cn, formatDate } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { toast } from "@/store/toast";

/**
 * Shared building blocks for the file + folder "Get info" drawers
 * (<DetailsDrawer /> and <FolderDetailsDrawer />). Behaviourally identical to
 * the copies each drawer used to carry — the props exist only to reproduce the
 * few places the two drawers diverge (mono value, callout text, folder-only file
 * count, link glyph, row background).
 */

/** A plain label/value row (no copy). */
export function MetaRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: typeof File;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="truncate text-sm tabular-nums text-[var(--color-text)]">{value}</span>
    </div>
  );
}

/** A copyable value with an IconButton copy affordance. `mono` renders the value
 *  in a smaller monospace face. */
export function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate text-sm text-[var(--color-text)]", mono && "font-mono text-xs")}>
          {value}
        </span>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          onClick={copy}
          iconClassName={cn("h-3.5 w-3.5", copied && "text-[var(--color-accent)]")}
          className="h-7 w-7 flex-shrink-0"
        />
      </div>
    </div>
  );
}

/** The AES-256-GCM assurance callout shown at the foot of both detail drawers. */
export function EncryptionAssuranceCard({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 p-4">
      <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

/**
 * One active share-link row with a revoke affordance. `fileCount` (folder links)
 * prepends a "N file(s) ·" segment; `showLinkIcon` leads with a link glyph; the
 * caller supplies the row background via `containerClassName`.
 */
export function ShareLinkRow({
  token,
  hasPassword,
  downloadCount,
  maxDownloads,
  expiresAt,
  fileCount,
  showLinkIcon = false,
  containerClassName,
  onRevoke,
}: {
  token: string;
  hasPassword: boolean;
  downloadCount: number;
  maxDownloads: number;
  expiresAt?: string | null;
  fileCount?: number;
  showLinkIcon?: boolean;
  containerClassName?: string;
  onRevoke: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2",
        containerClassName
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {showLinkIcon && <Link2 className="h-3 w-3 flex-shrink-0 text-[var(--color-accent)]" />}
          <code className="truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
            …{token.slice(-8)}
          </code>
          {hasPassword && (
            <Lock className="h-3 w-3 flex-shrink-0 text-amber-500" aria-label="Password protected" />
          )}
        </div>
        <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {fileCount !== undefined && `${fileCount} file${fileCount === 1 ? "" : "s"} · `}
          {downloadCount}{maxDownloads > 0 ? `/${maxDownloads}` : ""} downloads
          {expiresAt && ` · expires ${formatDate(expiresAt)}`}
        </p>
      </div>
      <IconButton
        icon={Trash2}
        label="Revoke link"
        variant="ghost"
        onClick={onRevoke}
        iconClassName="h-3.5 w-3.5 text-red-500"
        className="h-7 w-7 flex-shrink-0 hover:bg-red-500/10"
      />
    </div>
  );
}
