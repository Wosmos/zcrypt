"use client";

import { useState } from "react";
import { useFolders, type DecryptedFolder } from "@/hooks/useFolders";
import { moveFolder } from "@/lib/api";
import { useDragMove, canDrop, DRAG_MIME, type DragItem } from "@/hooks/useDragMove";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { usePassphraseStore } from "@/store/passphrase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Edit,
  Trash2,
  ChevronRight,
  Lock,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

const DIALOG_PANEL =
  "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-2xl shadow-2xl";

interface FolderBrowserProps {
  /**
   * Move a file into a folder (null = Root), invoked when a file row is dropped
   * onto a folder card or breadcrumb crumb. The dashboard owns the file list, so
   * it performs the optimistic update + reconcile; this component just forwards.
   */
  onMoveFile?: (fileId: string, folderId: string | null) => void;
}

export function FolderBrowser({ onMoveFile }: FolderBrowserProps) {
  const {
    folders,
    loading,
    locked,
    refresh,
    createFolder,
    renameFolder,
    deleteFolder,
    openFolder,
    navigateToCrumb,
    breadcrumb,
    currentFolderId,
  } = useFolders();

  // --- Drag & drop: folder cards + breadcrumb crumbs are drop targets ---
  const dragging = useDragMove((s) => s.dragging);
  const overTarget = useDragMove((s) => s.overTarget);
  const startDrag = useDragMove((s) => s.startDrag);
  const endDrag = useDragMove((s) => s.endDrag);
  const setOverTarget = useDragMove((s) => s.setOverTarget);

  // Resolve a drop onto destination `destId` (null = Root). Files are forwarded
  // to the dashboard (optimistic); folders are moved here then the tree refreshes.
  const handleDropOnto = (destId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    setOverTarget(undefined);
    const item = dragging;
    endDrag();
    const fileId = e.dataTransfer.getData(DRAG_MIME);
    if (item?.kind === "folder") {
      if (!canDrop(item, destId)) return;
      const prevName = item.name;
      // Optimistic-ish: backend rejects cycles; on failure we toast + refresh.
      moveFolder(item.id, destId)
        .then(() => refresh())
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : `Couldn't move "${prevName}"`);
          refresh();
        });
      return;
    }
    if (item?.kind === "file" || fileId) {
      onMoveFile?.(item?.id ?? fileId, destId);
    }
  };

  // A drop target accepts the drag when canDrop passes (folders) or it's a file
  // not already in this folder.
  const acceptsDrag = (destId: string | null): boolean => {
    if (!dragging) return false;
    if (dragging.kind === "folder") return canDrop(dragging, destId);
    return true; // file: dashboard no-ops same-folder moves
  };

  const dropHandlers = (destId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(destId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overTarget !== destId) setOverTarget(destId);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Only clear if we're actually leaving this element (not entering a child).
      if (!e.currentTarget.contains(e.relatedTarget as Node) && overTarget === destId) {
        setOverTarget(undefined);
      }
    },
    onDrop: (e: React.DragEvent) => handleDropOnto(destId, e),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const [renameTarget, setRenameTarget] = useState<DecryptedFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DecryptedFolder | null>(null);

  // Unlock flow: folder names are encrypted, so creating/renaming needs the
  // passphrase. If the vault is locked, prompt for it, then resume the action.
  const [showUnlock, setShowUnlock] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    { kind: "create" } | { kind: "rename"; folder: DecryptedFolder } | null
  >(null);

  const startCreate = () => {
    if (locked) {
      setPendingAction({ kind: "create" });
      setShowUnlock(true);
      return;
    }
    setNewName("");
    setShowCreate(true);
  };

  const startRename = (folder: DecryptedFolder) => {
    if (locked) {
      setPendingAction({ kind: "rename", folder });
      setShowUnlock(true);
      return;
    }
    setRenameTarget(folder);
    setRenameValue(folder.name);
  };

  const handleUnlock = async (passphrase: string) => {
    usePassphraseStore.getState().setPassphrase(passphrase);
    setShowUnlock(false);
    await refresh();
    const action = pendingAction;
    setPendingAction(null);
    if (action?.kind === "create") {
      setNewName("");
      setShowCreate(true);
    } else if (action?.kind === "rename") {
      setRenameTarget(action.folder);
      setRenameValue(action.folder.name);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createFolder(name);
      setShowCreate(false);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      await renameFolder(renameTarget.id, name);
      setRenameTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename folder");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteFolder(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Breadcrumb + actions */}
      <div className="flex items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {breadcrumb.map((crumb, i) => {
            const isLast = i === breadcrumb.length - 1;
            // A crumb is a drop target only when it's not the folder we're
            // already in (the last crumb == current folder).
            const isDropTarget = dragging != null && !isLast && acceptsDrag(crumb.id);
            const isOver = isDropTarget && overTarget === crumb.id && overTarget !== undefined;
            return (
              <div key={`${crumb.id ?? "root"}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />}
                <button
                  onClick={() => navigateToCrumb(i)}
                  disabled={isLast}
                  {...(isDropTarget ? dropHandlers(crumb.id) : {})}
                  className={cn(
                    "max-w-[160px] truncate rounded-lg px-2 py-1 text-sm font-medium transition-colors",
                    isLast
                      ? "text-[var(--color-text)] cursor-default"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
                    isOver && "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-2 ring-inset ring-[var(--color-accent)]"
                  )}
                >
                  {crumb.name}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="flex flex-shrink-0 items-center gap-2">
          <IconButton icon={RefreshCw} label="Refresh folders" onClick={() => refresh()} />
          <Button
            size="sm"
            onClick={startCreate}
            title={locked ? "Unlock your vault to create folders" : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">New folder</span>
          </Button>
        </div>
      </div>

      {locked && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Lock className="h-3 w-3" />
          Unlock your vault to view folder names
        </p>
      )}

      {/* Folder grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[58px] animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <EmptyState
          icon={<Folder className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="No folders here"
          description="Create a folder to organize your encrypted files. Folder names are end-to-end encrypted."
          action={
            <Button size="sm" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5" />
              New folder
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((folder) => {
            const isOver =
              overTarget === folder.id &&
              overTarget !== undefined &&
              acceptsDrag(folder.id);
            const isBeingDragged = dragging?.kind === "folder" && dragging.id === folder.id;
            const folderDragItem: DragItem = {
              kind: "folder",
              id: folder.id,
              name: folder.name,
              parentId: currentFolderId,
            };
            return (
            <div
              key={folder.id}
              role="button"
              tabIndex={0}
              draggable={!locked}
              onClick={() => openFolder(folder)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openFolder(folder);
                }
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_MIME, folder.id);
                e.dataTransfer.effectAllowed = "move";
                startDrag(folderDragItem);
              }}
              onDragEnd={() => endDrag()}
              {...dropHandlers(folder.id)}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl border bg-[var(--color-surface)] px-3 py-3 transition-colors",
                locked ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                isBeingDragged && "opacity-50",
                isOver
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
              )}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                <Folder className="h-[18px] w-[18px]" />
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">
                {folder.name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-[var(--color-surface-2)]"
                    aria-label={`Actions for ${folder.name}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => startRename(folder)}>
                    <Edit className="h-4 w-4" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteTarget(folder)}
                    className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            );
          })}
        </div>
      )}

      {/* Create folder dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className={DIALOG_PANEL}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              The folder name is encrypted end-to-end before it leaves your device.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            icon={<Folder className="h-4 w-4" />}
          />
          <DialogFooter className="gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={busy || !newName.trim()}>
              {busy ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className={DIALOG_PANEL}>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Folder name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            icon={<FolderOpen className="h-4 w-4" />}
          />
          <DialogFooter className="gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRenameTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRename} disabled={busy || !renameValue.trim()}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDelete}
        destructive
        title="Delete folder?"
        description="This folder and its contents will be moved to Trash. Files inside can be restored from Deleted Files."
        confirmLabel="Delete folder"
        loading={busy}
      />

      {/* Unlock vault to manage encrypted folder names */}
      <PassphraseModal
        open={showUnlock}
        onConfirm={handleUnlock}
        onClose={() => {
          setShowUnlock(false);
          setPendingAction(null);
        }}
        title="Unlock vault"
        subtitle="Enter your passphrase to create and read encrypted folder names"
        confirmLabel="Unlock"
      />
    </div>
  );
}
