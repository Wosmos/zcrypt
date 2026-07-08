"use client";

import { memo } from "react";
import NextImage from "next/image";
import type { ExplorerEntry, ExplorerActions } from "./types";
import { explorerItemPropsEqual, FOCUS_RING, ROW_SELECTED } from "./types";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";
import { formatBytes, formatDate, getFileTypeInfo, cn, midTrunc, fileIconFor, savingsPercent } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnail";
import { prefetchOnHover } from "@/hooks/useFileDecryptor";
import {
  Folder,
  FolderOpen,
  Eye,
  Info,
  Download,
  Share2,
  Trash2,
  Edit,
  MoreHorizontal,
  CheckSquare,
  Square,
  ChevronRight,
  Lock,
  Key,
  Unlock,
} from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/** Drag/drop wiring passed down from the explorer (mirrors folder-browser). */
export interface RowDragProps {
  draggable: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Touch press-start — begins the mobile press-hold-drag gesture. */
  onTouchStart?: (e: React.TouchEvent) => void;
  /** Drop-target handlers (folder rows only). */
  dropHandlers?: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** Visual states. */
  isBeingDragged?: boolean;
  isDropOver?: boolean;
}

interface ExplorerRowProps {
  entry: ExplorerEntry;
  actions: ExplorerActions;
  /** Selection (files only). */
  selectMode: boolean;
  selected: boolean;
  /** Roving focus target (gets tabIndex 0; others -1). */
  focused: boolean;
  onSelect: (id: string) => void;
  /** Enter select mode with this file pre-selected (touch long-press → Select). */
  onRequestSelect?: (fileId: string) => void;
  /** Mouse activation on a FILE — explorer decides open vs toggle vs range. */
  onFileClick: (file: FileMetadata, e: React.MouseEvent) => void;
  /** Keyboard on any entry — explorer handles roving arrows / Space / Enter. */
  onEntryKeyDown: (entry: ExplorerEntry, e: React.KeyboardEvent) => void;
  /** Open: folder → nest in; file → details drawer. */
  onOpenFolder: (folder: DecryptedFolder) => void;
  /** Folder kebab actions. */
  onRenameFolder: (folder: DecryptedFolder) => void;
  onDeleteFolder: (folder: DecryptedFolder) => void;
  /** Protect an unprotected folder with a password. */
  onProtectFolder?: (folder: DecryptedFolder) => void;
  /** Remove protection from a protected folder. */
  onRemoveFolderPassword?: (folder: DecryptedFolder) => void;
  /** Open the "Move to folder" dialog for a folder (keyboard-reachable C1). */
  onMoveFolderRequest?: (folder: DecryptedFolder) => void;
  /** Get info / details for a folder (kebab). */
  onOpenFolderDetails?: (folder: DecryptedFolder) => void;
  /** Create a public link for a folder (kebab). */
  onShareFolder?: (folder: DecryptedFolder) => void;
  /** Get info / details (kebab). Keeps the drawer reachable after click opens viewer. */
  onOpenDetails?: (file: FileMetadata) => void;
  drag: RowDragProps;
}

function MenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-100 transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          FOCUS_RING
        )}
        aria-label={label}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
  );
}

function FolderRow({
  entry,
  folder,
  focused,
  onOpenFolder,
  onEntryKeyDown,
  onRenameFolder,
  onDeleteFolder,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
  onOpenFolderDetails,
  onShareFolder,
  drag,
}: {
  entry: ExplorerEntry;
  folder: DecryptedFolder;
  focused: boolean;
  onOpenFolder: (f: DecryptedFolder) => void;
  onEntryKeyDown: (entry: ExplorerEntry, e: React.KeyboardEvent) => void;
  onRenameFolder: (f: DecryptedFolder) => void;
  onDeleteFolder: (f: DecryptedFolder) => void;
  onProtectFolder?: (f: DecryptedFolder) => void;
  onRemoveFolderPassword?: (f: DecryptedFolder) => void;
  onMoveFolderRequest?: (f: DecryptedFolder) => void;
  onOpenFolderDetails?: (f: DecryptedFolder) => void;
  onShareFolder?: (f: DecryptedFolder) => void;
  drag: RowDragProps;
}) {
  return (
    <div
      role="button"
      data-entry-id={folder.id}
      tabIndex={focused ? 0 : -1}
      aria-label={`Open folder ${folder.name}${folder.protected ? ", password protected" : ""}`}
      draggable={drag.draggable}
      onClick={() => onOpenFolder(folder)}
      onKeyDown={(e) => onEntryKeyDown(entry, e)}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...(drag.dropHandlers ?? {})}
      className={cn(
        "group flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 transition-all last:border-0 focus-visible:ring-inset",
        FOCUS_RING,
        drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        drag.isBeingDragged && "opacity-50",
        drag.isDropOver
          ? "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
          : "hover:bg-[var(--color-surface-1)] hover:shadow-sm"
      )}
    >
      {/* Folder glyph; a small lock badge on protected folders conveys real
          state (allowed by the spec, unlike the per-file glyph we removed). */}
      <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
        <Folder className="h-[18px] w-[18px]" />
        {folder.protected && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm"
            aria-hidden="true"
          >
            <Lock className="h-2.5 w-2.5" strokeWidth={2.25} />
          </span>
        )}
      </div>
      <span className="min-w-0 flex-1 whitespace-nowrap text-sm font-medium text-[var(--color-text)]" title={folder.name}>
        {midTrunc(folder.name, 16, 6)}
      </span>
      {/* Type column placeholder for visual alignment */}
      <span className="hidden w-[110px] flex-shrink-0 text-sm text-[var(--color-text-secondary)] sm:block">
        Folder
      </span>
      {/* Size / saved / modified columns are "—" for folders */}
      <span className="hidden w-[80px] flex-shrink-0 text-right text-sm tabular-nums text-[var(--color-text-secondary)] sm:block">
        —
      </span>
      <span className="hidden w-[64px] flex-shrink-0 text-right text-sm tabular-nums text-[var(--color-text-secondary)] md:block">
        —
      </span>
      <span className="hidden w-[110px] flex-shrink-0 text-right text-sm text-[var(--color-text-secondary)] sm:block">
        {formatDate(folder.created_at)}
      </span>
      <DropdownMenu>
        <MenuTrigger label={`Actions for folder ${folder.name}`} />
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onOpenFolder(folder)}>
            <FolderOpen className="h-4 w-4" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
            <Edit className="h-4 w-4" /> Rename
          </DropdownMenuItem>
          {onMoveFolderRequest && (
            <DropdownMenuItem onClick={() => onMoveFolderRequest(folder)}>
              <Folder className="h-4 w-4" /> Move to folder
            </DropdownMenuItem>
          )}
          {!folder.protected && onProtectFolder && (
            <DropdownMenuItem onClick={() => onProtectFolder(folder)}>
              <Key className="h-4 w-4" /> Protect with password…
            </DropdownMenuItem>
          )}
          {folder.protected && onRemoveFolderPassword && (
            <DropdownMenuItem onClick={() => onRemoveFolderPassword(folder)}>
              <Unlock className="h-4 w-4" /> Remove password…
            </DropdownMenuItem>
          )}
          {onShareFolder && (
            <DropdownMenuItem onClick={() => onShareFolder(folder)}>
              <Share2 className="h-4 w-4" /> Share
            </DropdownMenuItem>
          )}
          {onOpenFolderDetails && (
            <DropdownMenuItem onClick={() => onOpenFolderDetails(folder)}>
              <Info className="h-4 w-4" /> Get info
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDeleteFolder(folder)}
            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Navigation affordance — visible at ALL widths so a folder reads as
          tappable/openable even on mobile (H1). */}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--color-text-secondary)]" />
    </div>
  );
}

function FileRow({
  entry,
  file,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenDetails,
  drag,
}: {
  entry: ExplorerEntry;
  file: FileMetadata;
  actions: ExplorerActions;
  selectMode: boolean;
  selected: boolean;
  focused: boolean;
  onSelect: (id: string) => void;
  onRequestSelect?: (fileId: string) => void;
  onFileClick: (file: FileMetadata, e: React.MouseEvent) => void;
  onEntryKeyDown: (entry: ExplorerEntry, e: React.KeyboardEvent) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  drag: RowDragProps;
}) {
  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = fileIconFor(file.original_name);
  const { thumbnailUrl } = useThumbnail(file.id, file.original_name, file.original_size);
  const savings = savingsPercent(file.original_size, file.encrypted_size);

  return (
    <div
      role="button"
      data-entry-id={file.id}
      tabIndex={focused ? 0 : -1}
      aria-selected={selected}
      aria-label={`${file.original_name}, ${typeInfo.label}, ${formatBytes(file.original_size)}`}
      draggable={drag.draggable}
      onClick={(e) => onFileClick(file, e)}
      onKeyDown={(e) => onEntryKeyDown(entry, e)}
      // Desktop-only hover prefetch: warm the decrypt cache for previewable
      // files so opening feels instant (guards + dedup live in prefetchOnHover).
      onPointerEnter={() => prefetchOnHover(file)}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...(drag.dropHandlers ?? {})}
      className={cn(
        "group flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 transition-all last:border-0 focus-visible:ring-inset",
        FOCUS_RING,
        drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        drag.isBeingDragged && "opacity-50",
        drag.isDropOver
          ? "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
          : selected
            ? ROW_SELECTED
            : "hover:bg-[var(--color-surface-1)] hover:shadow-sm"
      )}
    >
      {selectMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(file.id);
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
      )}
      <div
        className={cn(
          "relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg",
          !thumbnailUrl && typeInfo.bg
        )}
      >
        {thumbnailUrl ? (
          // Decrypted thumbnail (data: URI / blob object URL) — unoptimized via
          // next.config (see zero-knowledge note there). `fill` matches the
          // fixed 36×36 box.
          <NextImage src={thumbnailUrl} alt="" fill sizes="36px" className="object-cover" />
        ) : (
          <Icon className={cn("h-[18px] w-[18px]", typeInfo.color)} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="whitespace-nowrap text-sm font-medium text-[var(--color-text)]" title={file.original_name}>
          {midTrunc(file.original_name, 16, 6)}
        </span>
      </div>
      <span className="hidden w-[110px] flex-shrink-0 truncate text-sm text-[var(--color-text-secondary)] sm:block">
        {typeInfo.label}
      </span>
      <span className="hidden w-[80px] flex-shrink-0 text-right text-sm tabular-nums text-[var(--color-text-secondary)] sm:block">
        {formatBytes(file.original_size)}
      </span>
      <span
        className={cn(
          "hidden w-[64px] flex-shrink-0 text-right text-sm font-medium tabular-nums md:block",
          Number(savings) > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
        )}
      >
        {savings}%
      </span>
      <span className="hidden w-[110px] flex-shrink-0 text-right text-sm text-[var(--color-text-secondary)] sm:block">
        {formatDate(file.created_at)}
      </span>
      <DropdownMenu>
        <MenuTrigger label={`Actions for ${file.original_name}`} />
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          {onRequestSelect && (
            <>
              <DropdownMenuItem onClick={() => onRequestSelect(file.id)}>
                <CheckSquare className="h-4 w-4" /> Select
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {actions.onPreview && (
            <DropdownMenuItem onClick={() => actions.onPreview?.(file.original_name)}>
              <Eye className="h-4 w-4" /> Preview
            </DropdownMenuItem>
          )}
          {onOpenDetails && (
            <DropdownMenuItem onClick={() => onOpenDetails(file)}>
              <Info className="h-4 w-4" /> Get info
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.onDownload(file.original_name)}>
            <Download className="h-4 w-4" /> Download
          </DropdownMenuItem>
          {actions.onShare && (
            <DropdownMenuItem onClick={() => actions.onShare?.(file.id)}>
              <Share2 className="h-4 w-4" /> Share
            </DropdownMenuItem>
          )}
          {actions.onMoveRequest && (
            <DropdownMenuItem onClick={() => actions.onMoveRequest?.(file.id)}>
              <FolderOpen className="h-4 w-4" /> Move to folder
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => actions.onDelete(file.id)}
            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Chevron spacer to align with the folder rows' navigation chevron
          (now visible at all widths, so the spacer is too). */}
      <span className="h-4 w-4 flex-shrink-0" />
    </div>
  );
}

function ExplorerRowImpl({
  entry,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
  onOpenFolderDetails,
  onShareFolder,
  onOpenDetails,
  drag,
}: ExplorerRowProps) {
  if (entry.kind === "folder") {
    return (
      <FolderRow
        entry={entry}
        folder={entry.folder}
        focused={focused}
        onOpenFolder={onOpenFolder}
        onEntryKeyDown={onEntryKeyDown}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onProtectFolder={onProtectFolder}
        onRemoveFolderPassword={onRemoveFolderPassword}
        onMoveFolderRequest={onMoveFolderRequest}
        onOpenFolderDetails={onOpenFolderDetails}
        onShareFolder={onShareFolder}
        drag={drag}
      />
    );
  }
  return (
    <FileRow
      entry={entry}
      file={entry.file}
      actions={actions}
      selectMode={selectMode}
      selected={selected}
      focused={focused}
      onSelect={onSelect}
      onRequestSelect={onRequestSelect}
      onFileClick={onFileClick}
      onEntryKeyDown={onEntryKeyDown}
      onOpenDetails={onOpenDetails ?? actions.onOpenDetails}
      drag={drag}
    />
  );
}

/**
 * Memoized so a parent (vault-explorer) re-render doesn't re-render every row in
 * the `.map()` — only rows whose entry / selection / focus / drag-visual state
 * actually changed. See `explorerItemPropsEqual` for why callback identity is
 * intentionally excluded from the comparison.
 */
export const ExplorerRow = memo(ExplorerRowImpl, explorerItemPropsEqual);
