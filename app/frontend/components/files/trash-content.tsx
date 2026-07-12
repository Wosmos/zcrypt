"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { restoreFile, purgeFile, bulkPurgeFiles, bulkRestoreFiles } from "@/lib/api";
import { useTrashQuery, setTrashData, invalidateTrash } from "@/store/trash";
import { invalidateFilesViews } from "@/lib/invalidate";
import { invalidateQuota } from "@/store/quota";
import { clearDecryptCacheForFile } from "@/lib/decrypt-cache";
import { toast } from "@/store/toast";
import { formatBytes, formatDate, getFileTypeInfo, cn, fileIconFor } from "@/lib/utils";
import type { FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FileViewer } from "@/components/viewers/file-viewer";
import { FolderUnlockModal } from "@/components/files/folder-password-dialogs";
import { useFileDecryptor } from "@/hooks/useFileDecryptor";
import { useFolderProtection } from "@/hooks/useFolderProtection";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import {
  Trash2, RotateCcw, RefreshCw, Eye, MoreHorizontal, CheckSquare, Square, X,
} from "@/lib/icons";

/**
 * Solid focus ring shared with the explorer rows (a11y) — a high-contrast accent
 * ring offset against the surface, so keyboard focus is always visible.
 */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

/** Accent selection treatment, mirroring the explorer's selected-row look. */
const ROW_SELECTED =
  "bg-[var(--color-accent)]/10 ring-1 ring-inset ring-[var(--color-accent)]/40";

export function TrashContent() {
  const trashQuery = useTrashQuery();
  // Stable ref per data change — many effects/callbacks below depend on `files`.
  const files = useMemo(() => trashQuery.data ?? [], [trashQuery.data]);
  const loading = trashQuery.isPending;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<FileMetadata | null>(null);
  const [purging, setPurging] = useState(false);

  // ── Selection (files only; same mouse + keyboard model as the explorer) ──────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const anchorIndex = useRef<number | null>(null); // shift-range anchor
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Bulk action state ────────────────────────────────────────────────────────
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const [bulkPurging, setBulkPurging] = useState(false);

  // ── Preview overlay (read-only <FileViewer>) ─────────────────────────────────
  const vault = useVaultLockContext();
  const folderProtection = useFolderProtection(vault);
  const { decryptToBlob, prefetch } = useFileDecryptor(folderProtection);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const refresh = useCallback(async () => {
    await invalidateTrash();
  }, []);

  // Prune selection + clamp focus whenever the visible list changes.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(files.map((f) => f.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
    setFocusedIndex((i) => Math.min(i, Math.max(0, files.length - 1)));
  }, [files]);

  // Close the viewer if its target disappears (restored/purged/refreshed away).
  useEffect(() => {
    if (viewerOpen && !files[viewerIndex]) setViewerOpen(false);
  }, [viewerOpen, viewerIndex, files]);

  const selectedCount = selectedIds.size;
  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  // ── Selection helpers ────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    anchorIndex.current = null;
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === files.length ? new Set() : new Set(files.map((f) => f.id))
    );
  }, [files]);

  const selectRange = useCallback(
    (from: number, to: number) => {
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setSelectedIds(() => {
        const next = new Set<string>();
        for (let i = lo; i <= hi && i < files.length; i++) next.add(files[i].id);
        return next;
      });
    },
    [files]
  );

  /** Mouse selection on the checkbox / select-mode click: cmd toggles, shift ranges. */
  const handleRowSelect = useCallback(
    (index: number, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
      const file = files[index];
      if (!file) return;
      if (e.shiftKey && anchorIndex.current !== null) {
        selectRange(anchorIndex.current, index);
      } else if (e.metaKey || e.ctrlKey) {
        toggleSelect(file.id);
        anchorIndex.current = index;
      } else {
        toggleSelect(file.id);
        anchorIndex.current = index;
      }
      setFocusedIndex(index);
    },
    [files, selectRange, toggleSelect]
  );

  // ── Per-row + bulk actions ───────────────────────────────────────────────────
  const handleRestore = useCallback(
    async (file: FileMetadata) => {
      setBusyId(file.id);
      // Optimistic: drop the row, reconcile on failure.
      setTrashData((prev) => prev.filter((f) => f.id !== file.id));
      setSelectedIds((prev) => {
        if (!prev.has(file.id)) return prev;
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      try {
        await restoreFile(file.id);
        // The file's plaintext was cached under its trashed identity; drop it so
        // it re-decrypts cleanly back in the vault.
        clearDecryptCacheForFile(file.id);
        toast.success("File restored");
        // Cross-view: the file reappears in the vault and quota shifts back.
        void invalidateFilesViews();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Restore failed");
        refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const handlePurge = useCallback(async () => {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setPurging(true);
    try {
      await purgeFile(target.id);
      clearDecryptCacheForFile(target.id);
      setTrashData((prev) => prev.filter((f) => f.id !== target.id));
      setSelectedIds((prev) => {
        if (!prev.has(target.id)) return prev;
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      toast.success("File permanently deleted");
      setPurgeTarget(null);
      // Chunks were removed from storage — quota frees up.
      void invalidateQuota();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Permanent delete failed");
    } finally {
      setPurging(false);
    }
  }, [purgeTarget]);

  const selectedFiles = useMemo(
    () => files.filter((f) => selectedIds.has(f.id)),
    [files, selectedIds]
  );

  const handleBulkRestore = useCallback(async () => {
    const targets = selectedFiles;
    if (targets.length === 0) return;
    const idList = targets.map((f) => f.id);
    const ids = new Set(idList);
    setBulkRestoring(true);
    // Optimistic (intentional): drop the rows now, reconcile via refresh on failure.
    setTrashData((prev) => prev.filter((f) => !ids.has(f.id)));
    targets.forEach((f) => clearDecryptCacheForFile(f.id));
    clearSelection();
    try {
      // One request per 500-id chunk (the server's per-batch cap) — no fan-out.
      let failed = 0;
      for (let i = 0; i < idList.length; i += 500) {
        const res = await bulkRestoreFiles(idList.slice(i, i + 500));
        failed += res.failed;
      }
      if (failed > 0) {
        toast.error(`${failed} file${failed > 1 ? "s" : ""} could not be restored`);
        refresh(); // reconcile: bring back the rows that didn't restore
      } else {
        toast.success(`Restored ${targets.length} file${targets.length > 1 ? "s" : ""}`);
      }
      // Restored files reappear in the vault; quota shifts back.
      void invalidateFilesViews();
    } catch {
      toast.error("Could not restore the selected files");
      refresh();
    } finally {
      setBulkRestoring(false);
    }
  }, [selectedFiles, clearSelection, refresh]);

  const handleBulkPurge = useCallback(async () => {
    const targets = selectedFiles;
    if (targets.length === 0) return;
    const idList = targets.map((f) => f.id);
    const ids = new Set(idList);
    setBulkPurging(true);
    // Optimistic (intentional): drop the rows now, reconcile from the server on failure.
    setTrashData((prev) => prev.filter((f) => !ids.has(f.id)));
    targets.forEach((f) => clearDecryptCacheForFile(f.id));
    clearSelection();
    setBulkPurgeOpen(false);
    try {
      // One request per 500-id chunk (the server's per-batch cap) — no per-file
      // fan-out, which used to flood the rate limiter with 429s and 401s. A
      // 1,000-file purge is 2 requests, not 1,000.
      let failed = 0;
      for (let i = 0; i < idList.length; i += 500) {
        const res = await bulkPurgeFiles(idList.slice(i, i + 500));
        failed += res.failed;
      }
      if (failed > 0) {
        toast.error(`${failed} file${failed > 1 ? "s" : ""} could not be deleted`);
        refresh(); // reconcile: restore the rows that didn't actually purge
      } else {
        toast.success(`Permanently deleted ${targets.length} file${targets.length > 1 ? "s" : ""}`);
      }
      // Chunks removed from storage — quota frees up.
      void invalidateQuota();
    } catch {
      // The whole batch failed (network/auth) — put the rows back.
      toast.error("Could not delete the selected files");
      refresh();
    } finally {
      setBulkPurging(false);
    }
  }, [selectedFiles, clearSelection, refresh]);

  // ── Preview (read-only) ──────────────────────────────────────────────────────
  const openPreview = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  // ── Keyboard roving focus + selection (matches the explorer model) ───────────
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (files.length === 0) return;
      const last = files.length - 1;

      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAll();
        return;
      }
      if (e.key === "Escape") {
        if (selectedCount > 0) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedIndex + 1, last);
        if (e.shiftKey) {
          if (anchorIndex.current === null) anchorIndex.current = focusedIndex;
          selectRange(anchorIndex.current, next);
        }
        setFocusedIndex(next);
        rowRefs.current[next]?.focus();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(focusedIndex - 1, 0);
        if (e.shiftKey) {
          if (anchorIndex.current === null) anchorIndex.current = focusedIndex;
          selectRange(anchorIndex.current, next);
        }
        setFocusedIndex(next);
        rowRefs.current[next]?.focus();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        const file = files[focusedIndex];
        if (file) {
          toggleSelect(file.id);
          anchorIndex.current = focusedIndex;
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        openPreview(focusedIndex);
      }
    },
    [files, focusedIndex, selectedCount, selectAll, clearSelection, selectRange, toggleSelect, openPreview]
  );

  rowRefs.current = [];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        eyebrow="Trash"
        title="Deleted Files"
        description="Restore files or delete them permanently to remove their chunks from storage."
        actions={
          <>
            {files.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={selectAll}
                aria-pressed={allSelected}
              >
                {allSelected ? (
                  <CheckSquare className="h-3.5 w-3.5" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {allSelected ? "Deselect all" : "Select all"}
                </span>
              </Button>
            )}
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => refresh()} />
          </>
        }
      />

      {/* Bulk action bar — appears once anything is selected. */}
      {selectedCount > 0 && (
        <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <IconButton
              icon={X}
              label="Clear selection"
              onClick={clearSelection}
              iconClassName="h-3.5 w-3.5"
            />
            <span className="text-sm font-medium tabular-nums text-[var(--color-text)]">
              {selectedCount} selected
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkRestore}
              disabled={bulkRestoring || bulkPurging}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Restore</span>
              <span className="hidden sm:inline">selected</span>
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setBulkPurgeOpen(true)}
              disabled={bulkRestoring || bulkPurging}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete forever</span>
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            >
              <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Trash2 className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="Trash is empty"
          description="Deleted files land here. You can restore them, or delete them permanently to remove their chunks from storage."
        />
      ) : (
        <div
          role="listbox"
          aria-label="Deleted files"
          aria-multiselectable="true"
          tabIndex={files.length > 0 ? 0 : -1}
          onKeyDown={handleListKeyDown}
          className={cn(
            "panel divide-y divide-[var(--color-border)] overflow-hidden p-0 outline-none",
            FOCUS_RING
          )}
        >
          {files.map((file, index) => {
            const typeInfo = getFileTypeInfo(file.original_name);
            const Icon = fileIconFor(file.original_name);
            const busy = busyId === file.id;
            const selected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                role="option"
                aria-selected={selected}
                tabIndex={index === focusedIndex ? 0 : -1}
                aria-label={`${file.original_name}, ${typeInfo.label}, ${formatBytes(file.original_size)}`}
                onFocus={() => setFocusedIndex(index)}
                onClick={(e) => {
                  // Click the row body toggles selection when modifier-clicked or
                  // when a selection already exists; a plain click opens preview.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || selectedCount > 0) {
                    handleRowSelect(index, e);
                  } else {
                    openPreview(index);
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3.5 transition-colors",
                  FOCUS_RING,
                  "focus-visible:ring-inset",
                  selected ? ROW_SELECTED : "hover:bg-[var(--color-surface-1)]",
                  busy && "opacity-50"
                )}
              >
                {/* Selection checkbox (always present so multi-select is reachable). */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRowSelect(index, e);
                  }}
                  className={cn(
                    "flex flex-shrink-0 items-center justify-center rounded",
                    FOCUS_RING
                  )}
                  aria-label={selected ? `Deselect ${file.original_name}` : `Select ${file.original_name}`}
                  aria-pressed={selected}
                >
                  {selected ? (
                    <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                  ) : (
                    <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                </button>

                <div
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
                    typeInfo.bg
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px]", typeInfo.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {file.original_name}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {formatBytes(file.original_size)}
                    {file.deleted_at && (
                      <>
                        {" "}&middot;{" "}
                        <span title={new Date(file.deleted_at).toLocaleString()}>
                          deleted {formatDate(file.deleted_at)}
                        </span>
                        {" "}&middot; kept until you delete it
                      </>
                    )}
                  </p>
                </div>

                {/* Inline actions (hidden on small screens; available via kebab). */}
                <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPreview(index);
                    }}
                    disabled={busy}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(file);
                    }}
                    disabled={busy}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPurgeTarget(file);
                    }}
                    disabled={busy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>

                {/* Compact kebab for narrow screens. */}
                <div className="flex flex-shrink-0 sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        disabled={busy}
                        className={cn(
                          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] data-[state=open]:bg-[var(--color-surface-2)] disabled:opacity-40",
                          FOCUS_RING
                        )}
                        aria-label={`Actions for ${file.original_name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-44"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem onClick={() => openPreview(index)}>
                        <Eye className="h-4 w-4" /> Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRestore(file)}>
                        <RotateCcw className="h-4 w-4" /> Restore
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setPurgeTarget(file)}
                        className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" /> Delete forever
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Read-only preview overlay — no move/delete from inside it. */}
      <FileViewer
        open={viewerOpen}
        files={files}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerOpen(false)}
        decrypt={decryptToBlob}
        prefetch={prefetch}
        onWrongPassword={(folderId) =>
          folderId == null
            ? vault.lock()
            : folderProtection.clearFolderPassword(folderId)
        }
        readOnly
      />

      {/* The folder-unlock modal so previewing a protected-folder file can prompt. */}
      <FolderUnlockModal state={folderProtection.modalState} />

      {/* Single-file permanent delete confirm. */}
      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(o) => !o && setPurgeTarget(null)}
        onConfirm={handlePurge}
        destructive
        title="Delete permanently?"
        description={
          <>
            <span className="block">
              This file will be permanently deleted and its chunks removed from all storage platforms. This action cannot be undone.
            </span>
            {purgeTarget && (
              <span className="mt-3 block truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                {purgeTarget.original_name}
              </span>
            )}
          </>
        }
        confirmLabel="Delete permanently"
        loading={purging}
      />

      {/* Bulk permanent delete confirm. */}
      <ConfirmDialog
        open={bulkPurgeOpen}
        onOpenChange={(o) => !o && setBulkPurgeOpen(false)}
        onConfirm={handleBulkPurge}
        destructive
        title={`Delete ${selectedCount} file${selectedCount > 1 ? "s" : ""} permanently?`}
        description={
          <span className="block">
            These {selectedCount} file{selectedCount > 1 ? "s" : ""} will be permanently deleted and their chunks removed from all storage platforms. This action cannot be undone.
          </span>
        }
        confirmLabel="Delete permanently"
        loading={bulkPurging}
      />
    </div>
  );
}
