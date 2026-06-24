"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * <VaultExplorer /> — the unified file + folder explorer (REBUILD_SPEC §2).
 *
 * FOLDERS and FILES live in ONE listing under ONE breadcrumb. List + grid
 * modes, inline search, sortable columns, Select mode with checkboxes,
 * drag-and-drop move (files via `onMoveFile`, folders via `moveFolder`+refresh),
 * folder open-to-nest, new-folder / rename / delete (unlock-via-PassphraseModal),
 * grid thumbnails via `useThumbnail`, and clean empty / locked / no-results
 * states. Owns browsing / selection / sort / search / drag state internally;
 * the page supplies crypto/upload-dependent callbacks.
 *
 * ── FINAL PROP INTERFACE (the integrator wires this) ────────────────────────
 *
 *   interface VaultExplorerProps {
 *     // Data — the full file list, already loaded by the page (useFileList).
 *     files: FileMetadata[];
 *     loading: boolean;
 *     error: string | null;
 *
 *     // Per-file actions (need the page's crypto/upload/preview context):
 *     onPreview?: (filename: string) => void;        // optional → no Preview item if omitted
 *     onDownload: (filename: string) => void;
 *     onShare?: (id: string) => void;                // optional → no Share item if omitted
 *     onOpenDetails?: (file: FileMetadata) => void;  // row/card click when NOT in select mode
 *     onDelete: (id: string) => void;                // single delete (optimistic soft-delete in page)
 *     onMoveFile?: (fileId: string, folderId: string | null) => void; // drag-drop move; page reconciles
 *     onMoveRequest?: (fileId: string) => void;      // opens the page's MoveToFolderDialog
 *
 *     // Bulk (Select mode):
 *     onBulkDelete?: (ids: string[]) => void;
 *     onBulkDownload?: (ids: string[]) => void;
 *
 *     // Upload entry point (empty-state CTA + toolbar affordance the page owns):
 *     onUploadClick?: () => void;
 *   }
 *
 * Internally uses: useFolders() + useFolderStore (folder tree / current folder /
 * breadcrumb), useDragMove + canDrop + DRAG_MIME (DnD), useVaultSearch (⌘K seed),
 * useThumbnail (grid thumbs). It does NOT own the vault-unlock pill (that's
 * <VaultLock /> in the page header) — but folder create/rename unlock uses the
 * same PassphraseModal pattern as folder-browser.tsx.
 *
 * DEVIATIONS FROM SPEC: documented at the bottom of this file.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { FileMetadata } from "@/types";
import { useFolders, type DecryptedFolder } from "@/hooks/useFolders";
import { useDragMove, canDrop, DRAG_MIME, setDragGhost, type DragItem } from "@/hooks/useDragMove";
import { useVaultSearch } from "@/components/ui/command-palette";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";
import { moveFolder, createFolder as apiCreateFolder } from "@/lib/api";
import { deriveNameKey, encryptName } from "@/lib/name-crypto";
import { toast } from "@/store/toast";
import { getFileCategory, cn } from "@/lib/utils";
import { CreateFolderFromFilesDialog } from "@/components/files/create-folder-from-files-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { FileTypeFilter } from "@/components/files/file-type-filter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Folder as FolderIcon,
  FolderOpen,
  Lock,
  Search,
  Download,
  Trash2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
} from "@/lib/icons";

import { ExplorerToolbar } from "./explorer/explorer-toolbar";
import { ExplorerBreadcrumb } from "./explorer/breadcrumb";
import { ExplorerRow, type RowDragProps } from "./explorer/explorer-row";
import { ExplorerCard } from "./explorer/explorer-card";
import type {
  SortField,
  SortDir,
  ViewMode,
  ExplorerEntry,
  ExplorerActions,
} from "./explorer/types";

const DIALOG_PANEL =
  "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-2xl shadow-2xl";

export interface VaultExplorerProps {
  files: FileMetadata[];
  loading: boolean;
  error: string | null;

  onPreview?: (filename: string) => void;
  onDownload: (filename: string) => void;
  onShare?: (id: string) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  onDelete: (id: string) => void;
  onMoveFile?: (fileId: string, folderId: string | null) => void;
  onMoveRequest?: (fileId: string) => void;
  /**
   * Open a file in the full viewer (OWNER 2). A plain click / Enter on a file
   * (outside selection) opens it; the explorer hands the page BOTH the clicked
   * file and the current folder's visible files so the viewer's prev/next walks
   * the folder. When omitted, a plain click falls back to `onOpenDetails`.
   */
  onOpenFile?: (file: FileMetadata, files: FileMetadata[]) => void;

  onBulkDelete?: (ids: string[]) => void;
  onBulkDownload?: (ids: string[]) => void;

  onUploadClick?: () => void;

  // ── Per-folder password protection (spec §3) ────────────────────────────────
  /** Gate opening a folder (e.g. verify a protected folder's password first).
   *  When provided it REPLACES the default navigate-in behavior; the page calls
   *  the navigation primitive itself once any password prompt resolves. */
  onOpenFolderRequest?: (folder: DecryptedFolder) => void;
  /** Kebab "Protect with password…" on an unprotected folder. */
  onProtectFolder?: (folder: DecryptedFolder) => void;
  /** Kebab "Remove password…" on a protected folder. */
  onRemoveFolderPassword?: (folder: DecryptedFolder) => void;
  /** Kebab "Move to folder" on a folder (keyboard-reachable C1). */
  onMoveFolderRequest?: (folder: DecryptedFolder) => void;
}

// ── Sortable column header (list mode) ──────────────────────────────────────
function SortIcon({ field, active, dir }: { field: SortField; active: SortField; dir: SortDir }) {
  if (field !== active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function ColHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const isActive = field === sortField;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${label}${isActive ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
      className={cn(
        "flex items-center gap-1.5 rounded text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
        className
      )}
    >
      {label} <SortIcon field={field} active={sortField} dir={sortDir} />
    </button>
  );
}

export function VaultExplorer({
  files,
  loading,
  error,
  onPreview,
  onDownload,
  onShare,
  onOpenDetails,
  onDelete,
  onMoveFile,
  onMoveRequest,
  onOpenFile,
  onBulkDelete,
  onBulkDownload,
  onUploadClick,
  onOpenFolderRequest,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
}: VaultExplorerProps) {
  const prefersReducedMotion = useReducedMotion();

  // ── Folder tree / current folder / breadcrumb ──────────────────────────────
  const {
    folders,
    loading: foldersLoading,
    locked,
    refresh: refreshFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    openFolder,
    navigateToCrumb,
    breadcrumb,
    currentFolderId,
  } = useFolders();

  // Opening a folder is gated by the page when `onOpenFolderRequest` is supplied
  // (a protected folder verifies its password before navigating in). Otherwise
  // navigate in directly — unprotected behavior is byte-for-byte unchanged.
  const openFolderGated = (folder: DecryptedFolder) => {
    if (onOpenFolderRequest) onOpenFolderRequest(folder);
    else openFolder(folder);
  };

  // ── View / sort / search / selection state (owned here) ────────────────────
  const [view, setView] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Seed search from the ⌘K command palette (same behavior as today's page).
  const vaultQuery = useVaultSearch((s) => s.query);
  useEffect(() => {
    if (vaultQuery) setSearch(vaultQuery);
  }, [vaultQuery]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  };

  // ── Scope to current folder, then search + type-filter + sort the files ─────
  const folderFiles = useMemo(
    () => files.filter((f) => (f.folder_id ?? null) === currentFolderId),
    [files, currentFolderId]
  );

  const sortedFiles = useMemo(() => {
    const matched = (
      search
        ? folderFiles.filter((f) =>
            f.original_name.toLowerCase().includes(search.toLowerCase())
          )
        : folderFiles
    ).filter((f) => (typeFilter ? getFileCategory(f.original_name) === typeFilter : true));

    const dir = sortDir === "asc" ? 1 : -1;
    return matched.slice().sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * a.original_name.localeCompare(b.original_name);
        case "size":
          return dir * (a.original_size - b.original_size);
        case "saved": {
          const sa = a.original_size > 0 ? 1 - a.encrypted_size / a.original_size : 0;
          const sb = b.original_size > 0 ? 1 - b.encrypted_size / b.original_size : 0;
          return dir * (sa - sb);
        }
        case "date":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case "type":
          return (
            dir *
            getFileCategory(a.original_name).localeCompare(getFileCategory(b.original_name))
          );
        default:
          return 0;
      }
    });
  }, [folderFiles, search, typeFilter, sortField, sortDir]);

  // Folders are filtered by the same search term (their names are decrypted),
  // and always sorted by name. Folders render FIRST, then files.
  const sortedFolders = useMemo(() => {
    const matched = search
      ? folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
      : folders;
    // Type filter applies to files only; when active, hide folders.
    if (typeFilter) return [];
    return matched.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, search, typeFilter]);

  const entries: ExplorerEntry[] = useMemo(
    () => [
      ...sortedFolders.map((folder) => ({ kind: "folder" as const, folder })),
      ...sortedFiles.map((file) => ({ kind: "file" as const, file })),
    ],
    [sortedFolders, sortedFiles]
  );

  // Keep selection in sync with what's actually visible (drop stale ids).
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visible = new Set(sortedFiles.map((f) => f.id));
    let changed = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visible.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedIds(next);
  }, [sortedFiles, selectedIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Mouse + keyboard multi-select (OWNER 2) ─────────────────────────────────
  // Roving focus across ALL entries (folders + files) for keyboard nav; the
  // selection anchor (for Shift-range) is the last file the user clicked/focused.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const anchorRef = useRef<string | null>(null);

  // Flat ordered ids of every visible entry (folders first, then files) — drives
  // roving ↑/↓ + grid arrow movement. File-only ids drive Shift-range math.
  const entryIds = useMemo(
    () => entries.map((e) => (e.kind === "folder" ? e.folder.id : e.file.id)),
    [entries]
  );
  const fileIds = useMemo(() => sortedFiles.map((f) => f.id), [sortedFiles]);

  // Keep the roving focus pointed at something real as the listing changes.
  useEffect(() => {
    if (focusedId && !entryIds.includes(focusedId)) {
      setFocusedId(entryIds[0] ?? null);
    }
  }, [entryIds, focusedId]);

  // The single roving tab-stop: the focused entry, or the first one when nothing
  // is focused yet (so Tab lands on the list, then arrows move within it).
  const rovingId = focusedId && entryIds.includes(focusedId) ? focusedId : entryIds[0] ?? null;

  // Select the inclusive range [anchor, id] in visible file order (Shift-click /
  // Shift-arrow). Anchor falls back to the clicked id when none is set.
  const selectRangeTo = (id: string, additive: boolean) => {
    const anchor = anchorRef.current ?? id;
    const a = fileIds.indexOf(anchor);
    const b = fileIds.indexOf(id);
    if (a === -1 || b === -1) {
      // Target isn't a file (folder) — just move focus, no selection change.
      return;
    }
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const range = fileIds.slice(lo, hi + 1);
    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      for (const rid of range) next.add(rid);
      return next;
    });
  };

  // A file was activated by the mouse. Modifiers drive selection; a plain click
  // (no modifier, not in select mode, nothing selected) OPENS the file (viewer).
  const handleFileClick = (file: FileMetadata, e: React.MouseEvent) => {
    setFocusedId(file.id);
    const toggleMod = e.metaKey || e.ctrlKey;
    const rangeMod = e.shiftKey;

    if (rangeMod) {
      // Range select from the anchor — enter select mode so the bulk bar shows.
      if (!selectMode) setSelectMode(true);
      selectRangeTo(file.id, toggleMod);
      return;
    }
    if (toggleMod) {
      if (!selectMode) setSelectMode(true);
      anchorRef.current = file.id;
      toggleSelect(file.id);
      return;
    }
    // No modifier.
    if (selectMode) {
      anchorRef.current = file.id;
      toggleSelect(file.id);
      return;
    }
    // Plain click, not selecting → open the file in the viewer (folder list for
    // prev/next), falling back to the details drawer.
    anchorRef.current = file.id;
    if (onOpenFile) onOpenFile(file, sortedFiles);
    else onOpenDetails?.(file);
  };

  const allSelected =
    sortedFiles.length > 0 && sortedFiles.every((f) => selectedIds.has(f.id));

  const selectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedFiles.map((f) => f.id)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    anchorRef.current = null;
  };

  // ── Keyboard navigation + selection (OWNER 2, a11y) ─────────────────────────
  // Grid column count (matches the grid template: 2 / sm:3 / lg:4) so ↑/↓ jump a
  // row in grid mode. List mode is a single column → step of 1.
  const gridColsRef = useRef(2);
  useEffect(() => {
    if (view !== "grid" || typeof window === "undefined") return;
    const compute = () => {
      const w = window.innerWidth;
      gridColsRef.current = w >= 1024 ? 4 : w >= 640 ? 3 : 2;
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [view]);

  // Focus the DOM node for a given entry id (data-entry-id is set on each row/card).
  const listContainerRef = useRef<HTMLDivElement>(null);
  const focusEntry = (id: string) => {
    setFocusedId(id);
    requestAnimationFrame(() => {
      listContainerRef.current
        ?.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`)
        ?.focus();
    });
  };

  const moveFocus = (from: string | null, delta: number, extendRange: boolean) => {
    if (entryIds.length === 0) return;
    const curIdx = from ? entryIds.indexOf(from) : -1;
    const nextIdx = Math.min(
      entryIds.length - 1,
      Math.max(0, (curIdx === -1 ? 0 : curIdx) + delta)
    );
    const nextId = entryIds[nextIdx];
    focusEntry(nextId);
    if (extendRange && fileIds.includes(nextId)) {
      if (!selectMode) setSelectMode(true);
      selectRangeTo(nextId, true);
    }
  };

  // Per-entry keydown (rows/cards forward their event here). Handles roving
  // arrows, Space toggle, Shift+arrow range extend, Enter open, Esc clear.
  const handleEntryKeyDown = (entry: ExplorerEntry, e: React.KeyboardEvent) => {
    const isFile = entry.kind === "file";
    const id = isFile ? entry.file.id : entry.folder.id;
    const step = view === "grid" ? gridColsRef.current : 1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(id, step, e.shiftKey);
        return;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(id, -step, e.shiftKey);
        return;
      case "ArrowRight":
        if (view === "grid") {
          e.preventDefault();
          moveFocus(id, 1, e.shiftKey);
        }
        return;
      case "ArrowLeft":
        if (view === "grid") {
          e.preventDefault();
          moveFocus(id, -1, e.shiftKey);
        }
        return;
      case " ":
        e.preventDefault();
        if (isFile) {
          if (!selectMode) setSelectMode(true);
          anchorRef.current = id;
          toggleSelect(id);
        } else {
          openFolderGated(entry.folder);
        }
        return;
      case "Enter":
        e.preventDefault();
        if (isFile) {
          if (onOpenFile) onOpenFile(entry.file, sortedFiles);
          else onOpenDetails?.(entry.file);
        } else {
          openFolderGated(entry.folder);
        }
        return;
      case "Escape":
        if (selectedIds.size > 0 || selectMode) {
          e.preventDefault();
          exitSelectMode();
        }
        return;
      default:
        return;
    }
  };

  // ⌘/Ctrl+A selects every visible file; Esc clears (when something is selected).
  // Scoped to the listing container so it never hijacks page-wide shortcuts.
  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (typing) return;
      if (sortedFiles.length === 0) return;
      e.preventDefault();
      if (!selectMode) setSelectMode(true);
      setSelectedIds(new Set(fileIds));
    }
  };

  // Click on empty space inside the listing clears the selection (macOS-style).
  const handleListingBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && selectedIds.size > 0) {
      setSelectedIds(new Set());
      anchorRef.current = null;
    }
  };

  // ── Drag & drop (mirrors folder-browser.tsx) ───────────────────────────────
  const dragging = useDragMove((s) => s.dragging);
  const overTarget = useDragMove((s) => s.overTarget);
  const startDrag = useDragMove((s) => s.startDrag);
  const endDrag = useDragMove((s) => s.endDrag);
  const setOverTarget = useDragMove((s) => s.setOverTarget);

  // The set of file ids being dragged. For a bulk drag (≥2 selected and you grab
  // one of them) this holds the WHOLE selection; otherwise just the one file.
  // Kept in a ref because dragover/drop can't read dataTransfer payloads.
  const bulkDragIdsRef = useRef<string[]>([]);
  // A file id currently hovered as a "combine into folder" target (file-on-file).
  const [combineOver, setCombineOver] = useState<string | null>(null);
  // The pending file-on-file merge (drives the create-folder-from-files dialog).
  const [combinePair, setCombinePair] = useState<{
    source: FileMetadata;
    target: FileMetadata;
  } | null>(null);

  const acceptsDrag = (destId: string | null): boolean => {
    if (!dragging) return false;
    if (dragging.kind === "folder") return canDrop(dragging, destId);
    return true; // file: same-folder moves are no-ops in the page
  };

  // Move every dragged file into `destId` (folder id / null=Root). Bulk-aware.
  const moveDraggedFilesTo = (primaryId: string, destId: string | null) => {
    const ids = bulkDragIdsRef.current.length ? bulkDragIdsRef.current : [primaryId];
    for (const id of ids) onMoveFile?.(id, destId);
    // A bulk move clears the selection (the rows have left this folder).
    if (ids.length > 1) {
      setSelectedIds(new Set());
      anchorRef.current = null;
    }
  };

  const handleDropOnto = (destId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    setOverTarget(undefined);
    const item = dragging;
    endDrag();
    const fileId = e.dataTransfer.getData(DRAG_MIME);
    if (item?.kind === "folder") {
      if (!canDrop(item, destId)) return;
      const prevName = item.name;
      moveFolder(item.id, destId)
        .then(() => refreshFolders())
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : `Couldn't move "${prevName}"`);
          refreshFolders();
        });
      return;
    }
    if (item?.kind === "file" || fileId) {
      moveDraggedFilesTo(item?.id ?? fileId, destId);
    }
  };

  const dropHandlers = (destId: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(destId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (overTarget !== destId) setOverTarget(destId);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node) && overTarget === destId) {
        setOverTarget(undefined);
      }
    },
    onDrop: (e: React.DragEvent) => handleDropOnto(destId, e),
  });

  // Drop a SINGLE file onto ANOTHER file → make a folder containing both
  // (macOS/iOS merge). Only a single-file drag combines; a bulk drag onto a file
  // is ignored (use a folder/crumb to move many). A file onto itself no-ops.
  // Disabled while the vault is locked (folder names can't be encrypted).
  const canCombineWith = (targetFile: FileMetadata): boolean =>
    !locked &&
    dragging?.kind === "file" &&
    bulkDragIdsRef.current.length <= 1 &&
    dragging.id !== targetFile.id;

  const fileDropHandlers = (targetFile: FileMetadata) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canCombineWith(targetFile)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (combineOver !== targetFile.id) setCombineOver(targetFile.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (
        !e.currentTarget.contains(e.relatedTarget as Node) &&
        combineOver === targetFile.id
      ) {
        setCombineOver(null);
      }
    },
    onDrop: (e: React.DragEvent) => {
      if (!canCombineWith(targetFile)) return;
      e.preventDefault();
      const sourceId = dragging?.id ?? e.dataTransfer.getData(DRAG_MIME);
      setCombineOver(null);
      setOverTarget(undefined);
      endDrag();
      const source = sortedFiles.find((f) => f.id === sourceId);
      if (source && sourceId !== targetFile.id) {
        setCombinePair({ source, target: targetFile });
      }
    },
  });

  // Build the per-entry drag props. Folders: drag disabled when locked / in
  // select mode (unchanged). Files: always draggable (drag is the move gesture),
  // now also drop targets (file-on-file merge) and bulk-drag aware.
  const dragPropsFor = (entry: ExplorerEntry): RowDragProps => {
    if (entry.kind === "folder") {
      const folder = entry.folder;
      const isDropOver =
        overTarget === folder.id && overTarget !== undefined && acceptsDrag(folder.id);
      const isBeingDragged = dragging?.kind === "folder" && dragging.id === folder.id;
      const folderDragItem: DragItem = {
        kind: "folder",
        id: folder.id,
        name: folder.name,
        parentId: currentFolderId,
      };
      return {
        draggable: !locked && !selectMode,
        onDragStart: (e) => {
          e.dataTransfer.setData(DRAG_MIME, folder.id);
          e.dataTransfer.effectAllowed = "move";
          bulkDragIdsRef.current = [];
          startDrag(folderDragItem);
          setDragGhost(e, { tilt: !prefersReducedMotion, label: folder.name });
        },
        onDragEnd: () => endDrag(),
        dropHandlers: dropHandlers(folder.id),
        isBeingDragged,
        isDropOver,
      };
    }
    const file = entry.file;
    // Bulk drag iff this file is part of a ≥2 selection.
    const isInBulk = selectedIds.has(file.id) && selectedIds.size >= 2;
    const isBeingDragged =
      dragging?.kind === "file" &&
      (dragging.id === file.id ||
        (isInBulk && bulkDragIdsRef.current.includes(file.id)));
    return {
      draggable: true,
      onDragStart: (e) => {
        // Decide the dragged set: the whole selection for a bulk drag, else one.
        const ids =
          isInBulk
            ? entries
                .filter((en) => en.kind === "file" && selectedIds.has(en.file.id))
                .map((en) => (en as { kind: "file"; file: FileMetadata }).file.id)
            : [file.id];
        bulkDragIdsRef.current = ids;
        e.dataTransfer.setData(DRAG_MIME, file.id);
        e.dataTransfer.effectAllowed = "move";
        startDrag({ kind: "file", id: file.id, name: file.original_name });
        setDragGhost(e, {
          tilt: !prefersReducedMotion,
          count: ids.length,
          label: file.original_name,
        });
      },
      onDragEnd: () => {
        bulkDragIdsRef.current = [];
        setCombineOver(null);
        endDrag();
      },
      dropHandlers: fileDropHandlers(file),
      isBeingDragged,
      isDropOver: combineOver === file.id,
    };
  };

  // ── Folder create / rename / delete (unlock-via-PassphraseModal pattern) ────
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DecryptedFolder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DecryptedFolder | null>(null);

  const [showUnlock, setShowUnlock] = useState(false);
  const pendingAction = useRef<
    { kind: "create" } | { kind: "rename"; folder: DecryptedFolder } | null
  >(null);

  const startCreate = () => {
    if (locked) {
      pendingAction.current = { kind: "create" };
      setShowUnlock(true);
      return;
    }
    setNewName("");
    setShowCreate(true);
  };

  const startRename = (folder: DecryptedFolder) => {
    if (locked) {
      pendingAction.current = { kind: "rename", folder };
      setShowUnlock(true);
      return;
    }
    setRenameTarget(folder);
    setRenameValue(folder.name);
  };

  const handleUnlock = async (passphrase: string) => {
    usePassphraseStore.getState().setPassphrase(passphrase);
    setShowUnlock(false);
    await refreshFolders();
    const action = pendingAction.current;
    pendingAction.current = null;
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

  const handleDeleteFolder = async () => {
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

  // ── Drop file → file: create a folder (encrypted name) containing both ───────
  // Creates the folder in the CURRENT folder (alongside the two files), then
  // moves BOTH files in via the page's existing move/re-key path (so protected-
  // folder rules + cross-boundary re-keying still hold). Throws on failure so the
  // dialog can re-enable; resolves (and closes) on success.
  const confirmCombine = async (folderName: string) => {
    if (!combinePair) return;
    const { source, target } = combinePair;
    const passphrase = usePassphraseStore.getState().getPassphrase();
    const user = useAuthStore.getState().user;
    if (!passphrase || !user) {
      toast.error("Unlock your vault to create a folder.");
      throw new Error("locked");
    }
    try {
      const key = await deriveNameKey(passphrase, user.id);
      const encrypted_name = await encryptName(folderName.trim(), key);
      const folder = await apiCreateFolder({ encrypted_name, parent_id: currentFolderId });
      await refreshFolders();
      // Move both files into the new (unprotected) folder. The page's onMoveFile
      // re-keys across a protection boundary if the source folder is protected.
      onMoveFile?.(source.id, folder.id);
      onMoveFile?.(target.id, folder.id);
      setCombinePair(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the folder");
      throw err;
    }
  };

  // ── Action bundle forwarded to rows/cards ───────────────────────────────────
  const actions: ExplorerActions = {
    onPreview,
    onDownload,
    onShare,
    onOpenDetails,
    onDelete,
    onMoveFile,
    onMoveRequest,
  };

  // ── Motion (reduced-motion safe stagger) ────────────────────────────────────
  const itemMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18 },
      };

  const isLoading = loading || foldersLoading;
  const folderCount = sortedFolders.length;
  const fileCount = sortedFiles.length;

  // Empty / no-results both derive from the SAME final `entries` array the
  // listing renders (H2), so we can never land on an empty scroll area with no
  // message. When `entries` is empty we show exactly one of:
  //   (a) "truly empty folder" — nothing exists at this level AND no filter/
  //       search is narrowing it, or
  //   (b) "no results" — a search term or type-filter matched nothing.
  const hasFilter = search !== "" || typeFilter !== null;
  const isListingEmpty = !isLoading && entries.length === 0;
  const isNoResults = isListingEmpty && hasFilter;
  const isEmptyFolder = isListingEmpty && !hasFilter;

  // Uniform count footer (H3-footer): show both groups when both are present;
  // collapse to "N items" when one group is empty (never drop a present group).
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const countLabel =
    folderCount > 0 && fileCount > 0
      ? `${plural(folderCount, "folder", "folders")} · ${plural(fileCount, "file", "files")}`
      : plural(folderCount + fileCount, "item", "items");

  return (
    <div className="panel space-y-3 p-3 sm:p-4">
      {/* Toolbar: breadcrumb + search + view + select + new folder */}
      <ExplorerToolbar
        breadcrumb={
          <ExplorerBreadcrumb
            breadcrumb={breadcrumb}
            onNavigate={navigateToCrumb}
            dragging={dragging != null}
            overTarget={overTarget}
            acceptsDrag={acceptsDrag}
            dropHandlers={dropHandlers}
          />
        }
        search={search}
        onSearchChange={setSearch}
        view={view}
        onViewChange={setView}
        selectMode={selectMode}
        onToggleSelect={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
        onNewFolder={startCreate}
        newFolderLocked={locked}
      />

      {/* Type-filter chips (second line). Hidden in select mode for focus. */}
      {!selectMode && (
        <FileTypeFilter files={folderFiles} activeFilter={typeFilter} onFilter={setTypeFilter} />
      )}

      {/* Locked hint — non-blocking; listing still works. This is the single
          contextual lock affordance in the listing (M6/L11 removed the noisy
          per-row glyphs; the header VaultLock pill owns the lock metaphor). */}
      {locked && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          <Lock className="h-3 w-3" />
          Unlock your vault to read encrypted folder names, preview, and download.
        </p>
      )}

      {/* Select-mode action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2">
          <button
            type="button"
            onClick={selectAll}
            aria-pressed={allSelected}
            className="flex items-center gap-2 rounded text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
            ) : (
              <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
            )}
            {selectedIds.size > 0 ? (
              <span className="tabular-nums">{selectedIds.size} selected</span>
            ) : (
              "Select all"
            )}
          </button>
          <div className="flex items-center gap-2">
            {onBulkDownload && (
              <Button
                variant="secondary"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => onBulkDownload(Array.from(selectedIds))}
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            )}
            {onBulkDelete && (
              <Button
                variant="danger"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => onBulkDelete(Array.from(selectedIds))}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={exitSelectMode}>
              <X className="h-3.5 w-3.5" /> Done
            </Button>
          </div>
        </div>
      )}

      {/* Listing */}
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      ) : isLoading ? (
        <div
          className={cn(
            view === "grid"
              ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
              : "space-y-px"
          )}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                // `animate-pulse-soft` IS suppressed under prefers-reduced-motion
                // (globals.css), unlike stock `animate-pulse` (M5).
                !prefersReducedMotion && "animate-pulse-soft",
                "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]",
                view === "grid" ? "h-[180px]" : "h-[58px]"
              )}
            />
          ))}
        </div>
      ) : isEmptyFolder ? (
        <EmptyState
          icon={<FolderIcon className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="This folder is empty"
          description="Upload encrypted files or create a folder to organize them. Names are end-to-end encrypted."
          action={
            <div className="flex items-center justify-center gap-2">
              {onUploadClick && (
                <Button size="sm" onClick={onUploadClick}>
                  Upload files
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={startCreate}>
                New folder
              </Button>
            </div>
          }
        />
      ) : isNoResults ? (
        <EmptyState
          icon={<Search className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="No matches"
          description={
            typeFilter
              ? `No ${typeFilter.toLowerCase()} items${search ? ` matching "${search}"` : ""} in this folder.`
              : `Nothing matches "${search}" in this folder.`
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearch("");
                setTypeFilter(null);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
          {/* Sortable column headers (hidden on mobile) */}
          <div className="hidden items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5 sm:flex">
            <span className="w-9 flex-shrink-0" />
            <ColHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="flex-1" />
            <ColHeader label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-[110px] flex-shrink-0" />
            <ColHeader label="Size" field="size" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-[80px] flex-shrink-0 justify-end" />
            <ColHeader label="Saved" field="saved" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="hidden w-[64px] flex-shrink-0 justify-end md:flex" />
            <ColHeader label="Modified" field="date" sortField={sortField} sortDir={sortDir} onSort={handleSort} className="w-[110px] flex-shrink-0 justify-end" />
            <span className="w-4 flex-shrink-0" />
          </div>
          <div
            ref={listContainerRef}
            role="list"
            
            onKeyDown={handleContainerKeyDown}
            onClick={handleListingBackgroundClick}
            className="max-h-[62vh] overflow-y-auto"
          >
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const id = entry.kind === "folder" ? entry.folder.id : entry.file.id;
                return (
                  <motion.div role="listitem" key={`${entry.kind}-${id}`} layout={!prefersReducedMotion} {...itemMotion}>
                    <ExplorerRow
                      entry={entry}
                      actions={actions}
                      selectMode={selectMode}
                      selected={entry.kind === "file" && selectedIds.has(entry.file.id)}
                      focused={rovingId === id}
                      onSelect={toggleSelect}
                      onFileClick={handleFileClick}
                      onEntryKeyDown={handleEntryKeyDown}
                      onOpenFolder={openFolderGated}
                      onRenameFolder={startRename}
                      onDeleteFolder={setDeleteTarget}
                      onProtectFolder={onProtectFolder}
                      onRemoveFolderPassword={onRemoveFolderPassword}
                      onMoveFolderRequest={onMoveFolderRequest}
                      drag={dragPropsFor(entry)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <div className="max-h-[62vh] overflow-y-auto">
          <div
            ref={listContainerRef}
            role="list"
            
            onKeyDown={handleContainerKeyDown}
            onClick={handleListingBackgroundClick}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
          >
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const id = entry.kind === "folder" ? entry.folder.id : entry.file.id;
                return (
                  <motion.div role="listitem" key={`${entry.kind}-${id}`} layout={!prefersReducedMotion} {...itemMotion}>
                    <ExplorerCard
                      entry={entry}
                      actions={actions}
                      selectMode={selectMode}
                      selected={entry.kind === "file" && selectedIds.has(entry.file.id)}
                      focused={rovingId === id}
                      onSelect={toggleSelect}
                      onFileClick={handleFileClick}
                      onEntryKeyDown={handleEntryKeyDown}
                      onOpenFolder={openFolderGated}
                      onRenameFolder={startRename}
                      onDeleteFolder={setDeleteTarget}
                      onProtectFolder={onProtectFolder}
                      onRemoveFolderPassword={onRemoveFolderPassword}
                      onMoveFolderRequest={onMoveFolderRequest}
                      drag={dragPropsFor(entry)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Count footer — uniform "N folders · M files", or "N items" when one
          group is empty (H3-footer). */}
      {!isLoading && !error && entries.length > 0 && (
        <p className="px-1 text-xs tabular-nums text-[var(--color-text-secondary)]">
          {countLabel}
        </p>
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
            icon={<FolderIcon className="h-4 w-4" />}
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
        onConfirm={handleDeleteFolder}
        destructive
        title="Delete folder?"
        description="This folder and its contents will be moved to Trash. Files inside can be restored from Deleted Files."
        confirmLabel="Delete folder"
        loading={busy}
      />

      {/* Drop file → file: new folder containing both (encrypted name) */}
      <CreateFolderFromFilesDialog
        open={!!combinePair}
        source={combinePair?.source ?? null}
        target={combinePair?.target ?? null}
        onConfirm={confirmCombine}
        onClose={() => setCombinePair(null)}
      />

      {/* Unlock vault to manage encrypted folder names (same as folder-browser) */}
      <PassphraseModal
        open={showUnlock}
        onConfirm={handleUnlock}
        onClose={() => {
          setShowUnlock(false);
          pendingAction.current = null;
        }}
        title="Unlock your vault"
        subtitle="Enter your passphrase to decrypt, preview, and download your files"
        confirmLabel="Unlock"
      />
    </div>
  );
}

/**
 * ── DEVIATIONS FROM SPEC ─────────────────────────────────────────────────────
 * 1. Added two extra optional props beyond the spec's suggested list:
 *      - onMoveRequest(fileId): opens the page's existing MoveToFolderDialog from
 *        the kebab "Move to folder" item. The spec lists drag-based onMoveFile but
 *        the preservation checklist (§5) requires the MoveToFolderDialog path too,
 *        so this exposes it without the explorer importing the dialog.
 *      - onUploadClick(): wired to the empty-folder EmptyState CTA (spec §2 lists
 *        onUploadClick in the prop shape; used here for the empty state).
 *    All extras are OPTIONAL — the integrator may omit them.
 * 2. Folder rows/cards show modified-date and a "Folder" type label; "N items"
 *    counts are not available from useFolders() (it only lists the current
 *    level), so the folder size/saved columns render "—" per the spec's
 *    "(or '—')" allowance rather than a child count.
 * 3. Pagination is intentionally dropped (spec §2) in favor of one scroll area
 *    (max-h + overflow-y-auto) rendering all items in the current folder.
 * 4. The single column-header row applies its sort to the FILES group only;
 *    folders always sort by name and render first (spec §2). When a type-filter
 *    chip is active, folders are hidden (a type filter is meaningless for them).
 * 5. The vault-unlock pill (<VaultLock />) is NOT rendered here — it belongs in
 *    the PageHeader (spec §3 / §6). Folder create/rename still uses the local
 *    PassphraseModal unlock, exactly like folder-browser.tsx does today.
 */
