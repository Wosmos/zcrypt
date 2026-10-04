"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * <VaultExplorer />: the unified file + folder explorer (REBUILD_SPEC §2).
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
 *     // Data: the full file list, already loaded by the page (useFileList).
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
 * <VaultLock /> in the page header): but folder create/rename unlock uses the
 * same PassphraseModal pattern as folder-browser.tsx.
 *
 * DEVIATIONS FROM SPEC: documented at the bottom of this file.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { FileMetadata } from "@/types";
import { useFolders, type DecryptedFolder } from "@/hooks/useFolders";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTouchDragMove } from "@/hooks/useTouchDragMove";
import { useTouchRangeSelect } from "@/hooks/useTouchRangeSelect";
import { useDragMove, canDrop, DRAG_MIME, setDragGhost, type DragItem } from "@/hooks/useDragMove";
import { useVaultSearch } from "@/components/ui/command-palette";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";
import { moveFolder, createFolder as apiCreateFolder } from "@/lib/api";
import { encryptName, type CustomStyle } from "@/lib/name-crypto";
import { nameKeyFor } from "@/lib/sealed";
import { updateFileStyle as apiUpdateFileStyle, renameFile as apiRenameFile } from "@/store/files";
import { toast } from "@/store/toast";
import { getFileCategory, cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { CreateFolderFromFilesDialog } from "@/components/files/create-folder-from-files-dialog";
import { StylePickerDialog } from "@/components/files/style-picker-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { verifyVaultPassphrase } from "@/lib/vault-verify";
import { FileTypeFilter } from "@/components/files/file-type-filter";
import {
  EMPTY_ENTRY_FILTERS,
  hasActiveFilters,
  matchesSizeFacet,
  matchesDateFacet,
  type EntryFilters,
} from "./explorer/filter-popover";
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
  Edit,
  Share2,
} from "@/lib/icons";

import { ExplorerToolbar } from "./explorer/explorer-toolbar";
import { ExplorerBreadcrumb } from "./explorer/breadcrumb";
import { ExplorerRow } from "./explorer/explorer-row";
import { ExplorerCard } from "./explorer/explorer-card";
import type { RowDragProps } from "./explorer/types";
import { FolderDetailsDrawer } from "./folder-details-drawer";
import { FolderShareModal } from "./folder-share-modal";
import { DIALOG_PANEL } from "./explorer/types";
import type {
  SortField,
  SortDir,
  ViewMode,
  GridCols,
  ExplorerEntry,
  ExplorerActions,
} from "./explorer/types";

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
  onBulkMove?: (ids: string[]) => void;
  onBulkShare?: (ids: string[]) => void;

  onUploadClick?: () => void;

  /** Controlled search, lifted to the page header (the page renders the search
   *  input now). When provided, the explorer filters by these instead of its own
   *  internal search state, and the inline toolbar search is gone. */
  search?: string;
  onSearchChange?: (value: string) => void;

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
  const t = useTranslations("explorer");
  const isActive = field === sortField;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={
        isActive
          ? t("sortByCurrent", {
              label,
              direction: sortDir === "asc" ? t("ascending") : t("descending"),
            })
          : t("sortBy", { label })
      }
      className={cn(
        "flex items-center gap-1.5 rounded text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
        className,
      )}
    >
      {label} <SortIcon field={field} active={sortField} dir={sortDir} />
    </button>
  );
}

// Persisted view preferences are only written by this tab, so the store never
// notifies; the server snapshot is null so SSR renders the defaults.
const noStoreUpdates = () => () => {};
const noStoredValue = () => null;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // localStorage unavailable, defaults are fine
  }
}

function readStoredView(): ViewMode | null {
  const v = readStored("zcrypt-explorer-view");
  return v === "grid" || v === "list" ? v : null;
}

function readStoredGridCols(): GridCols | null {
  const g = readStored("zcrypt-explorer-gridcols");
  if (g === "auto") return "auto";
  return g && /^[1-6]$/.test(g) ? (Number(g) as GridCols) : null;
}

export interface VaultExplorerHandle {
  startNewFolder: () => void;
}

export const VaultExplorer = forwardRef<VaultExplorerHandle, VaultExplorerProps>(
  function VaultExplorer(
    {
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
      onBulkMove,
      onBulkShare,
      onUploadClick,
      search: searchProp,
      onSearchChange,
      onOpenFolderRequest,
      onProtectFolder,
      onRemoveFolderPassword,
      onMoveFolderRequest,
    }: VaultExplorerProps,
    ref,
  ) {
    const prefersReducedMotion = useReducedMotion();
    const isMobile = useIsMobile();
    // Per-item `layout` + entrance animations are measured on every render; on
    // phones that's needless jank, so treat mobile like reduced-motion for lists.
    const animateList = !prefersReducedMotion && !isMobile;

    // ── Folder tree / current folder / breadcrumb ──────────────────────────────
    const {
      folders,
      loading: foldersLoading,
      locked,
      refresh: refreshFolders,
      createFolder,
      renameFolder,
      updateFolderStyle,
      deleteFolder,
      openFolder,
      navigateToCrumb,
      breadcrumb,
      currentFolderId,
    } = useFolders();
    const t = useTranslations("explorer");
    const tc = useTranslations("common");
    const tp = useTranslations("passphrase");

    // Opening a folder is gated by the page when `onOpenFolderRequest` is supplied
    // (a protected folder verifies its password before navigating in). Otherwise
    // navigate in directly: unprotected behavior is byte-for-byte unchanged.
    const openFolderGated = (folder: DecryptedFolder) => {
      if (onOpenFolderRequest) onOpenFolderRequest(folder);
      else openFolder(folder);
    };

    // ── View / sort / search / selection state (owned here) ────────────────────
    // View + grid density persist across reloads. The stored choice is read as an
    // external store whose server snapshot is null, so the server-rendered markup
    // matches the first client render and the saved value swaps in right after.
    const storedView = useSyncExternalStore(noStoreUpdates, readStoredView, noStoredValue);
    const [chosenView, setView] = useState<ViewMode | null>(null);
    const view: ViewMode = chosenView ?? storedView ?? "grid";
    // User-chosen grid density: "auto" = responsive (2/3/4 by width), or a fixed
    // 1–4 columns the user locks in.
    const storedGridCols = useSyncExternalStore(noStoreUpdates, readStoredGridCols, noStoredValue);
    const [chosenGridCols, setGridCols] = useState<GridCols | null>(null);
    const gridCols: GridCols = chosenGridCols ?? storedGridCols ?? "auto";
    const [sortField, setSortField] = useState<SortField>("date");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    // Search is controlled by the page header when `search`/`onSearchChange` are
    // supplied; otherwise the explorer keeps its own internal state (standalone use).
    const [internalSearch, setInternalSearch] = useState("");
    const search = searchProp ?? internalSearch;
    const setSearch = onSearchChange ?? setInternalSearch;
    const [filters, setFilters] = useState<EntryFilters>(EMPTY_ENTRY_FILTERS);

    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const changeView = (v: ViewMode) => {
      setView(v);
      try {
        localStorage.setItem("zcrypt-explorer-view", v);
      } catch {
        /* ignore */
      }
    };
    const changeGridCols = (c: GridCols) => {
      setGridCols(c);
      try {
        localStorage.setItem("zcrypt-explorer-gridcols", String(c));
      } catch {
        /* ignore */
      }
    };

    // Seed search from the ⌘K command palette (same behavior as today's page).
    const vaultQuery = useVaultSearch((s) => s.query);
    useEffect(() => {
      if (vaultQuery) setSearch(vaultQuery);
    }, [vaultQuery, setSearch]);

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
      [files, currentFolderId],
    );

    const sortedFiles = useMemo(() => {
      const matched = (
        search
          ? folderFiles.filter((f) => f.original_name.toLowerCase().includes(search.toLowerCase()))
          : folderFiles
      )
        .filter(
          (f) => filters.types.size === 0 || filters.types.has(getFileCategory(f.original_name)),
        )
        .filter((f) => matchesSizeFacet(f.original_size, filters.size))
        .filter((f) => matchesDateFacet(f.created_at, filters.date));

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
              dir * getFileCategory(a.original_name).localeCompare(getFileCategory(b.original_name))
            );
          default:
            return 0;
        }
      });
    }, [folderFiles, search, filters, sortField, sortDir]);

    // Folders are filtered by the same search term (their names are decrypted),
    // and always sorted by name. Folders render FIRST, then files.
    const sortedFolders = useMemo(() => {
      const matched = search
        ? folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
        : folders;
      // Type/size/date filters apply to files only; when any is active, hide folders.
      if (hasActiveFilters(filters)) return [];
      return matched.slice().sort((a, b) => a.name.localeCompare(b.name));
    }, [folders, search, filters]);

    const entries: ExplorerEntry[] = useMemo(
      () => [
        ...sortedFolders.map((folder) => ({ kind: "folder" as const, folder })),
        ...sortedFiles.map((file) => ({ kind: "file" as const, file })),
      ],
      [sortedFolders, sortedFiles],
    );

    // Keep selection in sync with what's actually visible (drop stale ids) when
    // the listing changes. Adjusted during render so no stale frame is painted.
    const [prevSortedFiles, setPrevSortedFiles] = useState(sortedFiles);
    if (sortedFiles !== prevSortedFiles) {
      setPrevSortedFiles(sortedFiles);
      if (selectedIds.size > 0) {
        const visible = new Set(sortedFiles.map((f) => f.id));
        const next = new Set([...selectedIds].filter((id) => visible.has(id)));
        if (next.size !== selectedIds.size) setSelectedIds(next);
      }
    }

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

    // Flat ordered ids of every visible entry (folders first, then files), drives
    // roving ↑/↓ + grid arrow movement. File-only ids drive Shift-range math.
    const entryIds = useMemo(
      () => entries.map((e) => (e.kind === "folder" ? e.folder.id : e.file.id)),
      [entries],
    );
    const fileIds = useMemo(() => sortedFiles.map((f) => f.id), [sortedFiles]);

    // Keep the roving focus pointed at something real as the listing changes.
    const [prevEntryIds, setPrevEntryIds] = useState(entryIds);
    if (entryIds !== prevEntryIds) {
      setPrevEntryIds(entryIds);
      if (focusedId && !entryIds.includes(focusedId)) setFocusedId(entryIds[0] ?? null);
    }

    // The single roving tab-stop: the focused entry, or the first one when nothing
    // is focused yet (so Tab lands on the list, then arrows move within it).
    const rovingId = focusedId && entryIds.includes(focusedId) ? focusedId : (entryIds[0] ?? null);

    // Select the inclusive range [anchor, id] in visible file order (Shift-click /
    // Shift-arrow). Anchor falls back to the clicked id when none is set.
    const selectRangeTo = (id: string, additive: boolean) => {
      const anchor = anchorRef.current ?? id;
      const a = fileIds.indexOf(anchor);
      const b = fileIds.indexOf(id);
      if (a === -1 || b === -1) {
        // Target isn't a file (folder): just move focus, no selection change.
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
        // Range select from the anchor: enter select mode so the bulk bar shows.
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

    const allSelected = sortedFiles.length > 0 && sortedFiles.every((f) => selectedIds.has(f.id));

    const selectAll = () => {
      if (allSelected) setSelectedIds(new Set());
      else setSelectedIds(new Set(sortedFiles.map((f) => f.id)));
    };

    const exitSelectMode = () => {
      setSelectMode(false);
      setSelectedIds(new Set());
      anchorRef.current = null;
    };

    // Enter select mode with one file already selected, the touch entry point
    // (long-press a file → "Select"). On desktop the toolbar Select toggle handles
    // this; on mobile that toggle is hidden, so this is the way in.
    const enterSelectWith = (fileId: string) => {
      if (!selectMode) setSelectMode(true);
      setSelectedIds(new Set([fileId]));
      anchorRef.current = fileId;
      setFocusedId(fileId);
      haptic(12); // confirm select-mode entry with a soft tick (Android)
    };

    // ── Keyboard navigation + selection (OWNER 2, a11y) ─────────────────────────
    // Grid column count (matches the grid template: 2 / sm:3 / lg:4) so ↑/↓ jump a
    // row in grid mode. List mode is a single column → step of 1.
    const gridColsRef = useRef(2);
    useEffect(() => {
      if (view !== "grid" || typeof window === "undefined") return;
      const compute = () => {
        if (gridCols !== "auto") {
          gridColsRef.current = gridCols;
          return;
        }
        const w = window.innerWidth;
        gridColsRef.current = w >= 1024 ? 4 : w >= 640 ? 3 : 2;
      };
      compute();
      window.addEventListener("resize", compute);
      return () => window.removeEventListener("resize", compute);
    }, [view, gridCols]);

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
        Math.max(0, (curIdx === -1 ? 0 : curIdx) + delta),
      );
      const nextId = entryIds[nextIdx];
      focusEntry(nextId);
      if (extendRange && fileIds.includes(nextId)) {
        if (!selectMode) setSelectMode(true);
        selectRangeTo(nextId, true);
      }
    };

    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Per-entry keydown (rows/cards forward their event here). Handles roving
    // arrows, Space toggle, Shift+arrow range extend, Enter open, Delete/F2,
    // Esc clear.
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
        case "Delete":
        case "Backspace":
          if (e.key === "Backspace" && !e.metaKey) return;
          e.preventDefault();
          if (!isFile) setDeleteTarget(entry.folder);
          else if (onBulkDelete && selectedIds.size > 1 && selectedIds.has(id))
            onBulkDelete(Array.from(selectedIds));
          else onDelete(id);
          return;
        case "F2":
          e.preventDefault();
          if (isFile) startRenameFile(entry.file);
          else startRename(entry.folder);
          return;
        default:
          return;
      }
    };

    // ⌘/Ctrl+A selects every visible file; Esc clears (when something is selected).
    // Scoped to the listing container so it never hijacks page-wide shortcuts.
    const handleContainerKeyDown = (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
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
    // Render-side mirror of the bulk set, so a row can tell it is part of the drag.
    const [bulkDragIds, setBulkDragIdsState] = useState<string[]>([]);
    const setBulkDragIds = (ids: string[]) => {
      bulkDragIdsRef.current = ids;
      setBulkDragIdsState(ids);
    };
    // A file id currently hovered as a "combine into folder" target (file-on-file).
    const [combineOver, setCombineOver] = useState<string | null>(null);
    // The pending file-on-file merge (drives the create-folder-from-files dialog).
    const [combinePair, setCombinePair] = useState<{
      source: FileMetadata;
      target: FileMetadata;
    } | null>(null);

    const liveDragging = () => useDragMove.getState().dragging;

    const acceptsDrag = (destId: string | null): boolean => {
      const item = liveDragging();
      if (!item) return false;
      if (item.kind === "folder") return canDrop(item, destId);
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

    // Move a dragged folder into `destId`: shared by the desktop HTML5 drop and
    // the touch drag-move path below, which drive the same store.
    const moveFolderTo = (item: DragItem, destId: string | null) => {
      if (!canDrop(item, destId)) return;
      const prevName = item.name;
      moveFolder(item.id, destId)
        .then(() => refreshFolders())
        .catch((err) => {
          toast.error(
            err instanceof Error ? err.message : t("toastMoveFailed", { name: prevName }),
          );
          void refreshFolders();
        });
    };

    const handleDropOnto = (destId: string | null, e: React.DragEvent) => {
      e.preventDefault();
      setOverTarget(undefined);
      const item = liveDragging();
      endDrag();
      const fileId = e.dataTransfer.getData(DRAG_MIME);
      if (item?.kind === "folder") {
        moveFolderTo(item, destId);
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
    const canCombineWith = (targetFile: FileMetadata): boolean => {
      const item = liveDragging();
      return (
        !locked &&
        item?.kind === "file" &&
        bulkDragIdsRef.current.length <= 1 &&
        item.id !== targetFile.id
      );
    };

    const fileDropHandlers = (targetFile: FileMetadata) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!canCombineWith(targetFile)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (combineOver !== targetFile.id) setCombineOver(targetFile.id);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && combineOver === targetFile.id) {
          setCombineOver(null);
        }
      },
      onDrop: (e: React.DragEvent) => {
        if (!canCombineWith(targetFile)) return;
        e.preventDefault();
        const sourceId = liveDragging()?.id ?? e.dataTransfer.getData(DRAG_MIME);
        setCombineOver(null);
        setOverTarget(undefined);
        endDrag();
        const source = sortedFiles.find((f) => f.id === sourceId);
        if (source && sourceId !== targetFile.id) {
          setCombinePair({ source, target: targetFile });
        }
      },
    });

    // Touch drag-and-drop (mobile only). Drives the SAME useDragMove store as the
    // desktop HTML5 path: folder drop-highlighting via `overTarget` is unchanged,
    // and on release moves the file/folder into the folder under the finger. The
    // press-hold-then-move gesture coexists with the long-press context menu.
    const touchDrag = useTouchDragMove({
      enabled: isMobile,
      canDropOn: (item, destId) => (item.kind === "folder" ? canDrop(item, destId) : true),
      onDrop: (item, destId) => {
        if (item.kind === "folder") {
          moveFolderTo(item, destId);
          return;
        }
        onMoveFile?.(item.id, destId);
      },
    });

    // ── Mobile drag-to-select (gallery-style range sweep, select mode only) ─────
    // The selection captured the instant a sweep begins, so a sweep ADDS its range
    // on top of what was already selected (and shrinking the sweep releases only
    // the newly-added range, never the pre-existing selection).
    const sweepBaseRef = useRef<Set<string>>(new Set());
    const sweepSizeRef = useRef(0);
    const rangeSelect = useTouchRangeSelect({
      enabled: isMobile && selectMode,
      fileIdAt: (x, y) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        const id =
          el?.closest<HTMLElement>("[data-entry-id]")?.getAttribute("data-entry-id") ?? null;
        // Only files are selectable: ignore folder cards under the finger.
        return id && fileIds.includes(id) ? id : null;
      },
      onSweepStart: () => {
        sweepBaseRef.current = new Set(selectedIds);
        sweepSizeRef.current = selectedIds.size;
      },
      onSweep: (anchorId, currentId) => {
        const a = fileIds.indexOf(anchorId);
        const b = fileIds.indexOf(currentId);
        if (a === -1 || b === -1) return;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const next = new Set([...sweepBaseRef.current, ...fileIds.slice(lo, hi + 1)]);
        // Soft tick each time the count changes (grows or shrinks), gallery feel.
        if (next.size !== sweepSizeRef.current) {
          sweepSizeRef.current = next.size;
          haptic(8);
        }
        setSelectedIds(next);
      },
    });

    // Build the per-entry drag props. Folders: drag disabled when locked / in
    // select mode (unchanged). Files: draggable to move (desktop), drop targets
    // (file-on-file merge), and bulk-drag aware. Native HTML5 `draggable` is OFF on
    // mobile: touchscreens don't fire it, and leaving it on made Android start its
    // own drag on long-press (the "cutout" ghost) AND broke Radix's long-press
    // cancellation so a second context menu opened. Mobile uses the touch gestures
    // below (move-drag out of select mode; range-select in it).
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
          draggable: !isMobile && !locked && !selectMode,
          onDragStart: (e) => {
            e.dataTransfer.setData(DRAG_MIME, folder.id);
            e.dataTransfer.effectAllowed = "move";
            setBulkDragIds([]);
            startDrag(folderDragItem);
            setDragGhost(e, { tilt: !prefersReducedMotion, label: folder.name, kind: "folder" });
          },
          onDragEnd: () => endDrag(),
          onTouchStart:
            !locked && !selectMode ? (e) => touchDrag.onPressStart(folderDragItem, e) : undefined,
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
        (dragging.id === file.id || (isInBulk && bulkDragIds.includes(file.id)));
      return {
        draggable: !isMobile,
        onDragStart: (e) => {
          // Decide the dragged set: the whole selection for a bulk drag, else one.
          const ids = isInBulk
            ? entries
                .filter((en) => en.kind === "file" && selectedIds.has(en.file.id))
                .map((en) => (en as { kind: "file"; file: FileMetadata }).file.id)
            : [file.id];
          setBulkDragIds(ids);
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
          setBulkDragIds([]);
          setCombineOver(null);
          endDrag();
        },
        // In select mode a touch sweep RANGE-SELECTS (gallery style); otherwise it
        // begins the move-drag. Both are mutually exclusive by mode, so neither
        // collides with the long-press context menu.
        onTouchStart: (e) =>
          selectMode
            ? rangeSelect.onPressStart(file.id, e)
            : touchDrag.onPressStart({ kind: "file", id: file.id, name: file.original_name }, e),
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
    const [renameFileTarget, setRenameFileTarget] = useState<FileMetadata | null>(null);
    const [renameFileValue, setRenameFileValue] = useState("");
    const [renameFileBusy, setRenameFileBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DecryptedFolder | null>(null);
    // "Get info" target: the folder whose details drawer is open.
    const [detailsFolder, setDetailsFolder] = useState<DecryptedFolder | null>(null);
    const [shareFolder, setShareFolder] = useState<DecryptedFolder | null>(null);
    const [customizeTarget, setCustomizeTarget] = useState<{
      type: "folder" | "file";
      id: string;
      name: string;
      currentStyle: CustomStyle | null;
    } | null>(null);

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

    useImperativeHandle(ref, () => ({ startNewFolder: startCreate }));

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
        toast.error(err instanceof Error ? err.message : t("toastCreateFolderFailed"));
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
        toast.error(err instanceof Error ? err.message : t("toastRenameFolderFailed"));
      } finally {
        setBusy(false);
      }
    };

    const startRenameFile = (file: FileMetadata) => {
      setRenameFileTarget(file);
      setRenameFileValue(file.original_name);
    };

    const handleRenameFile = async () => {
      if (!renameFileTarget) return;
      const name = renameFileValue.trim();
      if (!name) return;
      setRenameFileBusy(true);
      try {
        await apiRenameFile(renameFileTarget.id, name);
        setRenameFileTarget(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toastRenameFileFailed"));
      } finally {
        setRenameFileBusy(false);
      }
    };

    const startCustomize = (target: {
      type: "folder" | "file";
      id: string;
      name: string;
      currentStyle: CustomStyle | null;
    }) => {
      setCustomizeTarget(target);
    };

    const handleCustomizeSave = async (style: CustomStyle | null) => {
      if (!customizeTarget) return;
      try {
        if (customizeTarget.type === "folder") {
          await updateFolderStyle(customizeTarget.id, style);
        } else {
          await apiUpdateFileStyle(customizeTarget.id, style);
        }
        setCustomizeTarget(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toastCustomizeFailed"));
        throw err;
      }
    };

    const handleDeleteFolder = async () => {
      if (!deleteTarget) return;
      setBusy(true);
      try {
        await deleteFolder(deleteTarget.id);
        setDeleteTarget(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toastDeleteFolderFailed"));
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
        toast.error(t("toastUnlockToCreate"));
        throw new Error("locked");
      }
      try {
        const trimmed = folderName.trim();
        // Same dup-name guard as useFolders.createFolder: this path calls the API
        // directly (it needs the new folder's id to move files in), so it must
        // check siblings itself. Names are E2E-encrypted; the server can't.
        if (folders.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase())) {
          throw new Error(`A folder named "${trimmed}" already exists here.`);
        }
        const key = await nameKeyFor(passphrase, user.id);
        const encrypted_name = await encryptName(trimmed, key);
        const folder = await apiCreateFolder({ encrypted_name, parent_id: currentFolderId });
        await refreshFolders();
        // Move both files into the new (unprotected) folder. The page's onMoveFile
        // re-keys across a protection boundary if the source folder is protected.
        onMoveFile?.(source.id, folder.id);
        onMoveFile?.(target.id, folder.id);
        setCombinePair(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("toastCreateFolderFailedShort"));
        throw err;
      }
    };

    // ── Action bundle forwarded to rows/cards ───────────────────────────────────
    // Memoized: the row/card memo comparator checks `actions` by identity, so a
    // fresh object each render would re-render every item on any state change.
    const actions = useMemo<ExplorerActions>(
      () => ({
        onPreview,
        onDownload,
        onShare,
        onOpenDetails,
        onDelete,
        onMoveFile,
        onMoveRequest,
      }),
      [onPreview, onDownload, onShare, onOpenDetails, onDelete, onMoveFile, onMoveRequest],
    );

    // ── Motion (reduced-motion safe stagger) ────────────────────────────────────
    const itemMotion = animateList
      ? {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -4 },
          transition: { duration: 0.18 },
        }
      : {};

    const isLoading = loading || foldersLoading;
    const folderCount = sortedFolders.length;
    const fileCount = sortedFiles.length;

    // Empty / no-results both derive from the SAME final `entries` array the
    // listing renders (H2), so we can never land on an empty scroll area with no
    // message. When `entries` is empty we show exactly one of:
    //   (a) "truly empty folder", nothing exists at this level AND no filter/
    //       search is narrowing it, or
    //   (b) "no results": a search term or type-filter matched nothing.
    const hasFilter = search !== "" || hasActiveFilters(filters);
    const isListingEmpty = !isLoading && entries.length === 0;
    const isNoResults = isListingEmpty && hasFilter;
    const isEmptyFolder = isListingEmpty && !hasFilter;

    // Uniform count footer (H3-footer): show both groups when both are present;
    // collapse to "N items" when one group is empty (never drop a present group).
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const countLabel =
      folderCount > 0 && fileCount > 0
        ? `${plural(folderCount, "folder", "folders")} · ${plural(fileCount, "file", "files")}`
        : plural(folderCount + fileCount, "item", "items");

    // ExplorerRow and ExplorerCard share the exact same prop contract (list vs
    // grid is purely a layout choice): one map, dispatching on which renders.
    const ExplorerItem = view === "list" ? ExplorerRow : ExplorerCard;
    const explorerItems = (
      <AnimatePresence initial={false}>
        {entries.map((entry) => {
          const id = entry.kind === "folder" ? entry.folder.id : entry.file.id;
          return (
            <motion.div role="listitem" key={`${entry.kind}-${id}`} {...itemMotion}>
              <ExplorerItem
                entry={entry}
                actions={actions}
                selectMode={selectMode}
                selected={entry.kind === "file" && selectedIds.has(entry.file.id)}
                focused={rovingId === id}
                onSelect={toggleSelect}
                onRequestSelect={isMobile ? enterSelectWith : undefined}
                onFileClick={handleFileClick}
                onEntryKeyDown={handleEntryKeyDown}
                onOpenFolder={openFolderGated}
                onRenameFolder={startRename}
                onDeleteFolder={setDeleteTarget}
                onProtectFolder={onProtectFolder}
                onRemoveFolderPassword={onRemoveFolderPassword}
                onMoveFolderRequest={onMoveFolderRequest}
                onOpenFolderDetails={setDetailsFolder}
                onShareFolder={setShareFolder}
                onCustomizeFolder={(folder) =>
                  startCustomize({
                    type: "folder",
                    id: folder.id,
                    name: folder.name,
                    currentStyle: folder.style,
                  })
                }
                onCustomizeFile={(file) =>
                  startCustomize({
                    type: "file",
                    id: file.id,
                    name: file.original_name,
                    currentStyle: file.style ?? null,
                  })
                }
                onRenameFile={startRenameFile}
                drag={dragPropsFor(entry)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    );

    return (
      <div className="space-y-3">
        {/* Toolbar: breadcrumb + view + select (search now lives in the page header) */}
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
          view={view}
          onViewChange={changeView}
          gridCols={gridCols}
          onGridColsChange={changeGridCols}
          selectMode={selectMode}
          onToggleSelect={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          files={folderFiles}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Mobile-only type-filter chips: the toolbar's Filter popover (type +
          size + date) is desktop-only (matches view/density/Select, already
          hidden on mobile), so mobile keeps its own compact single-select type
          row, bridged onto the SAME `filters.types` set (at most one entry on
          mobile) rather than a second, separate piece of state. Sticks just
          under the sticky search bar; hidden in select mode for focus. */}
        {!selectMode && isMobile && (
          <div className="sticky top-[55px] z-10 -mx-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <FileTypeFilter
              compact
              files={folderFiles}
              activeFilter={filters.types.size === 1 ? Array.from(filters.types)[0] : null}
              onFilter={(cat: string | null) =>
                setFilters((f) => ({ ...f, types: cat ? new Set([cat]) : new Set() }))
              }
            />
          </div>
        )}

        {/* Locked hint, non-blocking; listing still works. This is the single
          contextual lock affordance in the listing (M6/L11 removed the noisy
          per-row glyphs; the header VaultLock pill owns the lock metaphor). */}
        {locked && (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <Lock className="h-3 w-3" />
            Unlock your vault to read encrypted folder names, preview, and download.
          </p>
        )}

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : ""}
        </p>

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
              {onBulkMove && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => onBulkMove(Array.from(selectedIds))}
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Move
                </Button>
              )}
              {onBulkShare && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => onBulkShare(Array.from(selectedIds))}
                >
                  <Share2 className="h-3.5 w-3.5" /> Share
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
            className={cn(view === "grid" ? "grid gap-1.5 sm:gap-2.5" : "space-y-px")}
            style={
              view === "grid"
                ? {
                    gridTemplateColumns:
                      gridCols === "auto"
                        ? isMobile
                          ? "repeat(2, minmax(0, 1fr))"
                          : "repeat(auto-fill, minmax(118px, 1fr))"
                        : `repeat(${gridCols}, minmax(0, 1fr))`,
                  }
                : undefined
            }
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  // `animate-pulse-soft` IS suppressed under prefers-reduced-motion
                  // (globals.css), unlike stock `animate-pulse` (M5).
                  !prefersReducedMotion && "animate-pulse-soft",
                  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]",
                  view === "grid" ? "h-[180px]" : "h-[58px]",
                )}
              />
            ))}
          </div>
        ) : isEmptyFolder ? (
          <EmptyState
            icon={<FolderIcon className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <div className="flex items-center justify-center gap-2">
                {onUploadClick && (
                  <Button size="sm" onClick={onUploadClick}>
                    {t("uploadFiles")}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={startCreate}>
                  {t("newFolder")}
                </Button>
              </div>
            }
          />
        ) : isNoResults ? (
          <EmptyState
            icon={<Search className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("noMatches")}
            description={
              hasActiveFilters(filters)
                ? search
                  ? t("noMatchesFilteredFor", { search })
                  : t("noMatchesFiltered")
                : t("noMatchesSearch", { search })
            }
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilters(EMPTY_ENTRY_FILTERS);
                }}
              >
                {t("clearFilters")}
              </Button>
            }
          />
        ) : view === "list" ? (
          <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
            {/* Sortable column headers (hidden on mobile) */}
            <div className="hidden items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5 sm:flex">
              <span className="w-9 flex-shrink-0" />
              <ColHeader
                label={t("colName")}
                field="name"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="flex-1"
              />
              <ColHeader
                label={t("colType")}
                field="type"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="w-[110px] flex-shrink-0"
              />
              <ColHeader
                label={t("colSize")}
                field="size"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="w-[80px] flex-shrink-0 justify-end"
              />
              <ColHeader
                label={t("colSaved")}
                field="saved"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="hidden w-[64px] flex-shrink-0 justify-end md:flex"
              />
              <ColHeader
                label={t("colModified")}
                field="date"
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                className="w-[110px] flex-shrink-0 justify-end"
              />
              <span className="w-4 flex-shrink-0" />
            </div>
            <div
              ref={listContainerRef}
              role="list"
              onKeyDown={handleContainerKeyDown}
              onClick={handleListingBackgroundClick}
              className="sm:max-h-[62vh] sm:overflow-y-auto"
            >
              {explorerItems}
            </div>
          </div>
        ) : (
          <div className="sm:max-h-[62vh] sm:overflow-y-auto">
            <div
              ref={listContainerRef}
              role="list"
              onKeyDown={handleContainerKeyDown}
              onClick={handleListingBackgroundClick}
              className="grid gap-1.5 sm:gap-2.5"
              style={{
                gridTemplateColumns:
                  gridCols === "auto"
                    ? isMobile
                      ? "repeat(2, minmax(0, 1fr))"
                      : "repeat(auto-fill, minmax(118px, 1fr))"
                    : `repeat(${gridCols}, minmax(0, 1fr))`,
              }}
            >
              {explorerItems}
            </div>
          </div>
        )}

        {/* Count footer: uniform "N folders · M files", or "N items" when one
          group is empty (H3-footer). */}
        {!isLoading && !error && entries.length > 0 && (
          <p className="px-1 text-xs tabular-nums text-[var(--color-text-secondary)]">
            {countLabel}
          </p>
        )}

        {/* Folder "Get info" drawer (right-click / long-press → Get info). */}
        <FolderDetailsDrawer
          folder={detailsFolder}
          open={!!detailsFolder}
          onOpenChange={(o) => {
            if (!o) setDetailsFolder(null);
          }}
          files={files}
        />

        {/* Public folder link (right-click / long-press → Share). */}
        <FolderShareModal
          folder={shareFolder}
          open={!!shareFolder}
          onOpenChange={(o) => {
            if (!o) setShareFolder(null);
          }}
          files={files}
        />

        {/* Create folder dialog */}
        <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
          <DialogContent className={DIALOG_PANEL}>
            <DialogHeader>
              <DialogTitle>{t("newFolder")}</DialogTitle>
              <DialogDescription className="text-[var(--color-text-secondary)]">
                {t("newFolderDescription")}
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={t("folderName")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              icon={<FolderIcon className="h-4 w-4" />}
            />
            <DialogFooter className="gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowCreate(false)}
                disabled={busy}
              >
                {tc("cancel")}
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={busy || !newName.trim()}>
                {busy ? tc("creating") : tc("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename folder dialog */}
        <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
          <DialogContent className={DIALOG_PANEL}>
            <DialogHeader>
              <DialogTitle>{t("renameFolder")}</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={t("folderName")}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              icon={<FolderOpen className="h-4 w-4" />}
            />
            <DialogFooter className="gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRenameTarget(null)}
                disabled={busy}
              >
                {tc("cancel")}
              </Button>
              <Button size="sm" onClick={handleRename} disabled={busy || !renameValue.trim()}>
                {busy ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename file dialog */}
        <Dialog open={!!renameFileTarget} onOpenChange={(o) => !o && setRenameFileTarget(null)}>
          <DialogContent className={DIALOG_PANEL}>
            <DialogHeader>
              <DialogTitle>{t("renameFile")}</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              placeholder={t("fileName")}
              value={renameFileValue}
              onChange={(e) => setRenameFileValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameFile()}
              icon={<Edit className="h-4 w-4" />}
            />
            <DialogFooter className="gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRenameFileTarget(null)}
                disabled={renameFileBusy}
              >
                {tc("cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleRenameFile}
                disabled={renameFileBusy || !renameFileValue.trim()}
              >
                {renameFileBusy ? tc("saving") : tc("save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Customize icon/color: shared by folders and files */}
        <StylePickerDialog
          open={!!customizeTarget}
          onOpenChange={(o) => !o && setCustomizeTarget(null)}
          initialStyle={customizeTarget?.currentStyle ?? null}
          onSave={handleCustomizeSave}
          entityLabel={customizeTarget?.name}
          allowBackgroundDesign={customizeTarget?.type === "folder"}
        />

        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogContent className={DIALOG_PANEL}>
            <DialogHeader>
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription>Focus a file or folder in the list, then:</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {KEYBOARD_SHORTCUTS.map(([keys, action]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-xs">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-[var(--color-text-secondary)]">{action}</dd>
                </div>
              ))}
            </dl>
          </DialogContent>
        </Dialog>

        {/* Delete folder confirm */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          onConfirm={handleDeleteFolder}
          destructive
          title={t("deleteFolderTitle")}
          description={t("deleteFolderDescription")}
          confirmLabel={t("deleteFolderConfirm")}
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
          verify={verifyVaultPassphrase}
          onConfirm={handleUnlock}
          onClose={() => {
            setShowUnlock(false);
            pendingAction.current = null;
          }}
          title={tp("unlockTitle")}
          subtitle={tp("unlockSubtitle")}
          confirmLabel={tc("unlock")}
        />
      </div>
    );
  },
);

const KEYBOARD_SHORTCUTS: [string, string][] = [
  ["Arrow keys", "Move between items"],
  ["Shift + Arrow", "Extend the selection"],
  ["Space", "Select a file, or open a folder"],
  ["Enter", "Open"],
  ["Ctrl/Cmd + A", "Select all files"],
  ["Delete", "Move to Trash"],
  ["F2", "Rename"],
  ["Esc", "Clear the selection"],
  ["?", "Show these shortcuts"],
];

/**
 * ── DEVIATIONS FROM SPEC ─────────────────────────────────────────────────────
 * 1. Added two extra optional props beyond the spec's suggested list:
 *      - onMoveRequest(fileId): opens the page's existing MoveToFolderDialog from
 *        the kebab "Move to folder" item. The spec lists drag-based onMoveFile but
 *        the preservation checklist (§5) requires the MoveToFolderDialog path too,
 *        so this exposes it without the explorer importing the dialog.
 *      - onUploadClick(): wired to the empty-folder EmptyState CTA (spec §2 lists
 *        onUploadClick in the prop shape; used here for the empty state).
 *    All extras are OPTIONAL: the integrator may omit them.
 * 2. Folder rows/cards show modified-date and a "Folder" type label; "N items"
 *    counts are not available from useFolders() (it only lists the current
 *    level), so the folder size/saved columns render "-" per the spec's
 *    "(or '-')" allowance rather than a child count.
 * 3. Pagination is intentionally dropped (spec §2) in favor of one scroll area
 *    (max-h + overflow-y-auto) rendering all items in the current folder.
 * 4. The single column-header row applies its sort to the FILES group only;
 *    folders always sort by name and render first (spec §2). When a type-filter
 *    chip is active, folders are hidden (a type filter is meaningless for them).
 * 5. The vault-unlock pill (<VaultLock />) is NOT rendered here, it belongs in
 *    the PageHeader (spec §3 / §6). Folder create/rename still uses the local
 *    PassphraseModal unlock, exactly like folder-browser.tsx does today.
 */
