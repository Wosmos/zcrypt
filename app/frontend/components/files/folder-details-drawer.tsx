"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { IconButton } from "@/components/ui/icon-button";
import { SkeletonText } from "@/components/ui/skeletons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Folder,
  File,
  FolderOpen,
  HardDrive,
  Lock,
  Database,
  Clock,
  Key,
  ShieldCheck,
  Copy,
  Check,
  Share2,
  Link2,
  Trash2,
} from "@/lib/icons";
import { listFolders, listFolderShares, revokeFolderShare, type FolderShareLink } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/store/toast";
import { formatBytes, formatDate, cn } from "@/lib/utils";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";

interface FolderDetailsDrawerProps {
  /** The folder to inspect; `null` keeps the drawer closed. */
  folder: DecryptedFolder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full vault file list — stats aggregate every file under `folder`. */
  files: FileMetadata[];
}

/**
 * Walk a folder's whole subtree (BFS, one fetch per level) and return the set of
 * folder ids it contains, INCLUDING the root. Each level goes through the shared
 * folders query cache (same key the explorer uses), so levels you've already
 * browsed — and repeat opens of this drawer — are served from cache instead of
 * re-hitting the API on every open.
 */
async function collectSubtreeIds(rootId: string): Promise<Set<string>> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  // Bounded by the folder count; the `ids` guard prevents revisiting.
  while (frontier.length > 0) {
    const childLists = await Promise.all(
      frontier.map((id) =>
        queryClient
          .fetchQuery({ queryKey: qk.folders(id), queryFn: () => listFolders(id) })
          .catch(() => [])
      )
    );
    const next: string[] = [];
    for (const list of childLists) {
      for (const f of list) {
        if (!ids.has(f.id)) {
          ids.add(f.id);
          next.push(f.id);
        }
      }
    }
    frontier = next;
  }
  return ids;
}

/** A plain label/value row. */
function MetaRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
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

/** A copyable monospace value. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-xs text-[var(--color-text)]">{value}</span>
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

/**
 * FolderDetailsDrawer — the folder equivalent of <DetailsDrawer /> (Get info).
 * Reuses the same right-side Sheet chrome and row style, and aggregates stats
 * over the folder's ENTIRE subtree: every file in it and in all nested
 * subfolders, the storage they take (original + encrypted), and space saved.
 */
export function FolderDetailsDrawer({ folder, open, onOpenChange, files }: FolderDetailsDrawerProps) {
  const [subtreeIds, setSubtreeIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(false);

  const folderId = folder?.id ?? "";

  // Active folder-share links — the folder equivalent of the file drawer's
  // sharing history. Same query key as the share modal, so a link created or
  // revoked there is reflected here instantly.
  const sharesQuery = useQuery({
    queryKey: qk.folderShares(folderId),
    queryFn: () => listFolderShares(folderId),
    enabled: open && !!folderId,
  });
  const activeShares = (sharesQuery.data ?? []).filter((s) => !s.revoked);
  const sharesLoading = open && !!folderId && sharesQuery.isPending;

  const [revokeTarget, setRevokeTarget] = useState<FolderShareLink | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeFolderShare(revokeTarget.id);
      void queryClient.invalidateQueries({ queryKey: qk.folderShares(folderId) });
      toast.success("Folder link revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }, [revokeTarget, folderId]);

  // Discover the subtree (lazy, when the drawer opens for a folder).
  useEffect(() => {
    if (!open || !folderId) return;
    let cancelled = false;
    setLoading(true);
    setSubtreeIds(null);
    collectSubtreeIds(folderId)
      .then((ids) => {
        if (!cancelled) setSubtreeIds(ids);
      })
      .catch(() => {
        if (!cancelled) setSubtreeIds(new Set([folderId]));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, folderId]);

  // Aggregate over every file whose folder is anywhere in the subtree.
  const stats = useMemo(() => {
    if (!subtreeIds) return null;
    const inSubtree = files.filter((f) => subtreeIds.has(f.folder_id ?? ""));
    return {
      fileCount: inSubtree.length,
      subfolderCount: subtreeIds.size - 1,
      originalBytes: inSubtree.reduce((sum, f) => sum + (f.original_size || 0), 0),
      encryptedBytes: inSubtree.reduce((sum, f) => sum + (f.encrypted_size || 0), 0),
    };
  }, [subtreeIds, files]);

  if (!folder) return null;

  const ready = !loading && stats !== null;
  const savings =
    stats && stats.originalBytes > 0
      ? Math.max(0, (1 - stats.encryptedBytes / stats.originalBytes) * 100).toFixed(0)
      : "0";

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="space-y-0 border-b border-[var(--color-border)] p-5 text-left">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <Folder className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base text-[var(--color-text)]" title={folder.name}>
                {folder.name}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <span>Folder</span>
                {ready && stats && (
                  <>
                    <span aria-hidden>&middot;</span>
                    <span className="tabular-nums">
                      {stats.fileCount} {stats.fileCount === 1 ? "file" : "files"}
                    </span>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Contents — aggregated over the whole subtree */}
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
            {!ready || !stats ? (
              <div className="space-y-2.5">
                <SkeletonText w="w-2/3" />
                <SkeletonText w="w-1/2" />
                <SkeletonText w="w-3/5" />
              </div>
            ) : (
              <>
                <MetaRow label="Files" value={stats.fileCount} icon={File} />
                <MetaRow label="Subfolders" value={stats.subfolderCount} icon={FolderOpen} />
                <MetaRow label="Storage" value={formatBytes(stats.originalBytes)} icon={HardDrive} />
                <MetaRow label="Encrypted size" value={formatBytes(stats.encryptedBytes)} icon={Lock} />
                <MetaRow
                  label="Space saved"
                  value={
                    <span className={Number(savings) > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}>
                      {savings}%
                    </span>
                  }
                  icon={Database}
                />
                <MetaRow label="Created" value={formatDate(folder.created_at)} icon={Clock} />
                <p className="pt-1 text-[11px] text-[var(--color-text-muted)]">
                  Includes every file in this folder and all nested subfolders.
                </p>
              </>
            )}
          </div>

          {/* Protection */}
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <Key className="h-3.5 w-3.5" /> Protection
            </p>
            <MetaRow
              label="Password"
              value={
                folder.protected ? (
                  <span className="text-[var(--color-accent)]">Protected</span>
                ) : (
                  "Off"
                )
              }
            />
            <CopyField label="Folder ID" value={folder.id} />
          </div>

          {/* Share links — the same sharing history the file drawer shows */}
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <Share2 className="h-3.5 w-3.5" /> Share links
              {activeShares.length > 0 && (
                <span className="ml-0.5 rounded-full bg-[var(--color-accent)]/15 px-1.5 text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">
                  {activeShares.length}
                </span>
              )}
            </p>
            {sharesLoading ? (
              <div className="space-y-2">
                <SkeletonText />
                <SkeletonText w="w-3/4" />
              </div>
            ) : activeShares.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No active folder links. Use “Share” on this folder to create one.
              </p>
            ) : (
              <div className="space-y-1.5">
                {activeShares.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link2 className="h-3 w-3 flex-shrink-0 text-[var(--color-accent)]" />
                        <code className="truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
                          …{s.token.slice(-8)}
                        </code>
                        {s.has_password && (
                          <Lock className="h-3 w-3 flex-shrink-0 text-amber-500" aria-label="Password protected" />
                        )}
                      </div>
                      <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                        {s.file_count} file{s.file_count === 1 ? "" : "s"}
                        {" · "}
                        {s.download_count}
                        {s.max_downloads > 0 ? `/${s.max_downloads}` : ""} downloads
                        {s.expires_at && ` · expires ${formatDate(s.expires_at)}`}
                      </p>
                    </div>
                    <IconButton
                      icon={Trash2}
                      label="Revoke link"
                      variant="ghost"
                      onClick={() => setRevokeTarget(s)}
                      iconClassName="h-3.5 w-3.5 text-red-500"
                      className="h-7 w-7 flex-shrink-0 hover:bg-red-500/10"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Encryption assurance */}
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 p-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[var(--color-text)]">
                Folder name encrypted &middot; AES-256-GCM
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                The folder name is encrypted on your device. We only ever store ciphertext.
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <ConfirmDialog
      open={!!revokeTarget}
      onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}
      destructive
      title="Revoke folder link?"
      description="Anyone holding this link will immediately lose access to this folder's files. This cannot be undone."
      confirmLabel="Revoke"
      loading={revoking}
      onConfirm={handleRevoke}
    />
    </>
  );
}
