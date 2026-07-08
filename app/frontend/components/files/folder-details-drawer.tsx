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
  Share2,
} from "@/lib/icons";
import { MetaRow, CopyField, EncryptionAssuranceCard, ShareLinkRow } from "@/components/files/details-shared";
import { listFolderShares, revokeFolderShare, type FolderShareLink } from "@/lib/api";
import { collectSubtreeFolderIds } from "@/lib/folder-tree";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/store/toast";
import { formatBytes, formatDate, savingsPercent } from "@/lib/utils";
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
    collectSubtreeFolderIds(folderId)
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
  const savings = stats ? savingsPercent(stats.originalBytes, stats.encryptedBytes) : "0";

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
            <CopyField label="Folder ID" value={folder.id} mono />
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
                  <ShareLinkRow
                    key={s.id}
                    token={s.token}
                    hasPassword={s.has_password}
                    downloadCount={s.download_count}
                    maxDownloads={s.max_downloads}
                    expiresAt={s.expires_at}
                    fileCount={s.file_count}
                    showLinkIcon
                    containerClassName="bg-[var(--color-surface)]"
                    onRevoke={() => setRevokeTarget(s)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Encryption assurance */}
          <EncryptionAssuranceCard
            title="Folder name encrypted · AES-256-GCM"
            description="The folder name is encrypted on your device. We only ever store ciphertext."
          />
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
