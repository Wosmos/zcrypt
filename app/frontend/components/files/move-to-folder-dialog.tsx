"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listFolders, moveFile, moveFolder } from "@/lib/api";
import { deriveNameKey, decryptNameSafe } from "@/lib/name-crypto";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { useFolderRegistry } from "@/store/folder-registry";
import { FolderUnlockCancelled } from "@/hooks/useFolderProtection";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Folder, FolderOpen, Home, Lock, ChevronRight } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn } from "@/lib/utils";
import { DIALOG_PANEL } from "./explorer/types";

interface MoveToFolderDialogProps {
  open: boolean;
  /** Move a FILE. Mutually exclusive with `folderId`. */
  fileId: string | null;
  /** Move a FOLDER (spec C1). Mutually exclusive with `fileId`. */
  folderId?: string | null;
  onClose: () => void;
  onMoved?: () => void;
  /**
   * Optional file-move override. When provided AND moving a file, this is called
   * INSTEAD of the internal `moveFile` so the page can re-key the file across a
   * protection boundary first (decrypt under source pass, rewrap under dest pass,
   * rekeyFile) and then moveFile. Resolves on success; rejects on failure.
   */
  onMoveFile?: (fileId: string, destFolderId: string | null) => Promise<void>;
}

interface TreeNode {
  id: string;
  name: string;
}

// Full nested tree picker. Each level is fetched lazily via listFolders(parentId)
// and names are decrypted with the user's name key. Pick any folder (or Root).
// Moves a file (fileId) or a folder (folderId); for a folder it rejects dropping
// into itself or a known descendant (cycle), mirroring useDragMove.canDrop.
export function MoveToFolderDialog({
  open,
  fileId,
  folderId,
  onClose,
  onMoved,
  onMoveFile,
}: MoveToFolderDialogProps) {
  const user = useAuthStore((s) => s.user);
  const getPassphrase = usePassphraseStore((s) => s.getPassphrase);

  // children["root"] holds top-level folders; children[folderId] holds subfolders.
  const [children, setChildren] = useState<Record<string, TreeNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingNodes, setLoadingNodes] = useState<Set<string>>(new Set());
  const [rootLoading, setRootLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  // null means "Root" (no folder); undefined means nothing selected yet.
  const [selected, setSelected] = useState<string | null | undefined>(undefined);
  const [moving, setMoving] = useState(false);

  // Cache the derived name key for the lifetime of the open dialog.
  const keyRef = useRef<CryptoKey | null>(null);
  // Parent edges discovered while lazily expanding the tree, so a folder move can
  // reject dropping into a KNOWN descendant (a cycle) as a fast client-side
  // pre-check. This only catches descendants the user has expanded into view;
  // the AUTHORITATIVE cycle guard is server-side (MoveFolder's recursive-CTE
  // ancestry check), so an unexpanded-deep descendant is rejected by the backend
  // and surfaced here as a toast + reconcile (FIX-3b).
  const parentRef = useRef<Map<string, string | null>>(new Map());

  const fetchChildren = useCallback(
    async (parentId: string | null): Promise<TreeNode[]> => {
      const raw = await listFolders(parentId);
      // Record protection metadata (the registry has no get-by-id endpoint) and
      // parent edges for descendant detection.
      useFolderRegistry.getState().record(raw);
      for (const f of raw) parentRef.current.set(f.id, parentId);
      const key = keyRef.current;
      return Promise.all(
        raw.map(async (f) => ({
          id: f.id,
          name: key ? await decryptNameSafe(f.encrypted_name, key) : "[locked]",
        }))
      );
    },
    []
  );

  // True iff `dest` is the moved folder itself or a KNOWN descendant of it.
  const isSelfOrDescendant = useCallback(
    (dest: string | null): boolean => {
      if (!folderId || dest === null) return false;
      if (dest === folderId) return true;
      // Walk dest's ancestry through the discovered parent edges.
      let cur: string | null | undefined = dest;
      const seen = new Set<string>();
      while (cur != null && !seen.has(cur)) {
        seen.add(cur);
        if (cur === folderId) return true;
        cur = parentRef.current.get(cur);
      }
      return false;
    },
    [folderId]
  );

  // Load top-level folders when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setSelected(undefined);
    setChildren({});
    setExpanded(new Set());
    setLoadingNodes(new Set());
    parentRef.current = new Map();
    setRootLoading(true);
    (async () => {
      try {
        const passphrase = getPassphrase();
        keyRef.current = passphrase && user ? await deriveNameKey(passphrase, user.id) : null;
        setLocked(!keyRef.current);
        const top = await fetchChildren(null);
        setChildren({ root: top });
      } catch {
        setChildren({ root: [] });
      } finally {
        setRootLoading(false);
      }
    })();
  }, [open, user, getPassphrase, fetchChildren]);

  const toggleExpand = useCallback(
    async (folderId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(folderId)) next.delete(folderId);
        else next.add(folderId);
        return next;
      });
      // Lazy-load this folder's children the first time it expands.
      if (!children[folderId] && !loadingNodes.has(folderId)) {
        setLoadingNodes((prev) => new Set(prev).add(folderId));
        try {
          const kids = await fetchChildren(folderId);
          setChildren((prev) => ({ ...prev, [folderId]: kids }));
        } catch {
          setChildren((prev) => ({ ...prev, [folderId]: [] }));
        } finally {
          setLoadingNodes((prev) => {
            const next = new Set(prev);
            next.delete(folderId);
            return next;
          });
        }
      }
    },
    [children, loadingNodes, fetchChildren]
  );

  const movingFolder = folderId != null;
  const invalidFolderTarget = movingFolder && selected !== undefined && isSelfOrDescendant(selected);

  const handleMove = async () => {
    if (selected === undefined) return;

    if (movingFolder) {
      // Fast client-side pre-check against KNOWN descendants (expanded tree).
      if (isSelfOrDescendant(selected)) {
        toast.error("Can't move a folder into itself or one of its subfolders.");
        return;
      }
      setMoving(true);
      try {
        await moveFolder(folderId!, selected);
        toast.success(selected === null ? "Folder moved to Root" : "Folder moved");
        onMoved?.();
        onClose();
      } catch (err) {
        // FIX-3b: the backend is the authoritative cycle guard — a deep
        // descendant the user never expanded into view is rejected here with
        // "cannot move a folder into its own subfolder". Surface it clearly and
        // reconcile (onMoved → refresh) so any stale tree state is reverted; the
        // dialog stays open so the user can pick a valid destination.
        toast.error(err instanceof Error ? err.message : "Failed to move folder");
        onMoved?.();
      } finally {
        setMoving(false);
      }
      return;
    }

    if (!fileId) return;
    setMoving(true);
    try {
      // The page-supplied override re-keys across a protection boundary (decrypt
      // under source pass → rewrap under dest pass → rekeyFile) THEN moves; the
      // fallback is a plain move (unprotected → unprotected, byte-for-byte same).
      if (onMoveFile) await onMoveFile(fileId, selected);
      else await moveFile(fileId, selected);
      toast.success(selected === null ? "Moved to Root" : "File moved");
      onMoved?.();
      onClose();
    } catch (err) {
      // FIX-2: the user cancelled the folder-unlock prompt that the re-key needed
      // (onMoveFile rejects with FolderUnlockCancelled). Stop the spinner and
      // close cleanly — no scary error toast, nothing moved server-side.
      if (err instanceof FolderUnlockCancelled) {
        setMoving(false);
        onClose();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Failed to move file");
    } finally {
      setMoving(false);
    }
  };

  const renderNodes = (parentKey: string, depth: number) => {
    const nodes = children[parentKey];
    if (!nodes) return null;
    return nodes.map((node) => {
      const isExpanded = expanded.has(node.id);
      const isLoading = loadingNodes.has(node.id);
      const kids = children[node.id];
      // When moving a folder, its own node + known descendants are invalid drops.
      const disabled = movingFolder && isSelfOrDescendant(node.id);
      return (
        <div key={node.id}>
          <TreeRow
            depth={depth}
            label={node.name}
            active={selected === node.id}
            expanded={isExpanded}
            loading={isLoading}
            disabled={disabled}
            onToggle={() => toggleExpand(node.id)}
            onSelect={() => {
              if (!disabled) setSelected(node.id);
            }}
          />
          {isExpanded && kids && kids.length > 0 && renderNodes(node.id, depth + 1)}
          {isExpanded && kids && kids.length === 0 && !isLoading && (
            <p
              className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]"
              style={{ paddingLeft: `${(depth + 1) * 20 + 12}px` }}
            >
              No subfolders
            </p>
          )}
        </div>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={DIALOG_PANEL}>
        <DialogHeader>
          <DialogTitle>{movingFolder ? "Move folder" : "Move to folder"}</DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            {movingFolder
              ? "Choose a destination. A folder can't move into itself or one of its subfolders."
              : "Choose a destination folder. Expand a folder to pick a nested one."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] space-y-0.5 overflow-y-auto">
          {/* Root option */}
          <TreeRow
            depth={0}
            icon={<Home className="h-[18px] w-[18px]" />}
            label="Root (My Vault)"
            active={selected === null}
            onSelect={() => setSelected(null)}
          />

          {rootLoading ? (
            <div className="space-y-1 pt-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[42px] animate-pulse rounded-xl bg-[var(--color-surface-1)]" />
              ))}
            </div>
          ) : locked ? (
            <p className="flex items-center gap-1.5 px-2 py-3 text-xs text-[var(--color-text-muted)]">
              <Lock className="h-3 w-3" />
              Unlock your vault to see folder names
            </p>
          ) : (children.root?.length ?? 0) === 0 ? (
            <p className="px-3 py-3 text-xs text-[var(--color-text-muted)]">
              No folders yet — files can still move to Root.
            </p>
          ) : (
            renderNodes("root", 0)
          )}
        </div>

        {invalidFolderTarget && (
          <p className="px-1 text-xs text-red-500">
            Can&apos;t move a folder into itself or one of its subfolders.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleMove}
            disabled={moving || selected === undefined || invalidFolderTarget}
          >
            {moving ? "Moving..." : "Move here"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TreeRow({
  depth,
  icon,
  label,
  active,
  expanded,
  loading,
  disabled,
  onToggle,
  onSelect,
}: {
  depth: number;
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  expanded?: boolean;
  loading?: boolean;
  /** Invalid destination (moved folder's own node / a descendant). */
  disabled?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
}) {
  const canExpand = !!onToggle;
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl pr-2 transition-colors",
        active ? "bg-[var(--shell-active)] text-[var(--shell-active-text)]" : !disabled && "hover:bg-[var(--color-surface-1)]"
      )}
      style={{ paddingLeft: `${depth * 20}px` }}
    >
      {/* Expand/collapse toggle (folders only) */}
      {canExpand ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          {loading ? (
            <LogoSpinner size={14} speed="fast" />
          ) : (
            <ChevronRight
              className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", expanded && "rotate-90")}
            />
          )}
        </button>
      ) : (
        <span className="h-7 w-7 flex-shrink-0" />
      )}

      {/* Selectable label */}
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-disabled={disabled}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
            active ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]" : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)]"
          )}
        >
          {icon ?? (expanded ? <FolderOpen className="h-[18px] w-[18px]" /> : <Folder className="h-[18px] w-[18px]" />)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      </button>
    </div>
  );
}
