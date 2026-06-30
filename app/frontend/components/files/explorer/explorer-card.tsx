"use client";

import { useId } from "react";
import type { ExplorerEntry, ExplorerActions } from "./types";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";
import type { RowDragProps } from "./explorer-row";
import { formatBytes, formatDate, getFileTypeInfo, isImageFile, cn, midTrunc } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnail";
import { IconButton } from "@/components/ui/icon-button";
import {
  File,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Cog,
  Table,
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

/** Shared solid focus ring (a11y-H3), matching explorer-row + the transfer dock. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]";

/** One accent selection treatment (M4) shared with the list rows. */
const CARD_SELECTED =
  "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]/40";

interface ExplorerCardProps {
  entry: ExplorerEntry;
  actions: ExplorerActions;
  selectMode: boolean;
  selected: boolean;
  focused: boolean;
  onSelect: (id: string) => void;
  onFileClick: (file: FileMetadata, e: React.MouseEvent) => void;
  onEntryKeyDown: (entry: ExplorerEntry, e: React.KeyboardEvent) => void;
  onOpenFolder: (folder: DecryptedFolder) => void;
  onRenameFolder: (folder: DecryptedFolder) => void;
  onDeleteFolder: (folder: DecryptedFolder) => void;
  onProtectFolder?: (folder: DecryptedFolder) => void;
  onRemoveFolderPassword?: (folder: DecryptedFolder) => void;
  onMoveFolderRequest?: (folder: DecryptedFolder) => void;
  onOpenFolderDetails?: (folder: DecryptedFolder) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  drag: RowDragProps;
}

function CardKebab({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface)]/90 text-[var(--color-text-muted)] opacity-100 backdrop-blur-sm transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
            FOCUS_RING
          )}
          aria-label={label}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}

/**
 * MacFolder — a big, filled, macOS/iOS-style folder glyph. Two-tone (a darker
 * back panel + raised tab behind a brighter front pocket), a glassy top sheen,
 * and a soft drop shadow for depth. Tinted with the accent via `currentColor`,
 * so it lives on the card surface like a desktop folder icon. ~116px wide.
 */
function MacFolder({ className }: { className?: string }) {
  const id = useId();
  const sheen = `${id}-sheen`;
  const shadow = `${id}-shadow`;
  // Shared rounded-pocket outline reused for the front face + the sheen overlay.
  const pocket =
    "M10 40 a12 12 0 0 1 12 -12 H98 a12 12 0 0 1 12 12 V78 a12 12 0 0 1 -12 12 H22 a12 12 0 0 1 -12 -12 Z";
  return (
    <svg
      viewBox="0 0 120 100"
      className={cn("text-[var(--color-accent)]", className)}
      fill="none"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={shadow} x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="4.5" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>
      <g filter={`url(#${shadow})`}>
        {/* Back panel + raised tab (darker, sits behind the front pocket) */}
        <path
          d="M10 42 V30 a12 12 0 0 1 12 -12 H44 a6 6 0 0 1 4.24 1.76 L54 23.5 a6 6 0 0 0 4.24 1.76 H98 a12 12 0 0 1 12 12 V44 Z"
          fill="currentColor"
          fillOpacity="0.55"
        />
        {/* Front pocket */}
        <path d={pocket} fill="currentColor" />
        {/* Glassy top sheen */}
        <path d={pocket} fill={`url(#${sheen})`} />
      </g>
    </svg>
  );
}

/** A clean, filled padlock — shackle + rounded body with a punched keyhole. */
function PadlockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M8 10V8a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="4.5" y="10" width="15" height="11" rx="3" fill="currentColor" />
      <circle cx="12" cy="14.8" r="1.5" fill="var(--color-surface)" />
      <rect x="11.25" y="14.8" width="1.5" height="3.4" rx="0.75" fill="var(--color-surface)" />
    </svg>
  );
}

function FolderCard({
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
  drag: RowDragProps;
}) {
  // Show the padlock when the folder has its own password OR the vault is locked
  // (name can't be decrypted → "[locked]", set in useFolders).
  const isLocked = folder.protected || folder.name === "[locked]";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          data-entry-id={folder.id}
          tabIndex={focused ? 0 : -1}
          aria-label={`Open folder ${folder.name}${folder.protected ? ", password protected" : ""}. Right-click or long-press for actions.`}
          draggable={drag.draggable}
          onClick={() => onOpenFolder(folder)}
          onKeyDown={(e) => onEntryKeyDown(entry, e)}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          {...(drag.dropHandlers ?? {})}
          className={cn(
            "group relative flex flex-col items-center gap-1.5 rounded-xl transition-all duration-200 focus-visible:ring-inset",
            FOCUS_RING,
            drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            drag.isBeingDragged && "opacity-50",
            drag.isDropOver && "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
          )}
        >
          {/* Free-standing macOS folder — moderate size, scales down in narrow cells. */}
          <div className="relative flex w-full items-center justify-center">
            <MacFolder className="w-full max-w-[128px] transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-[1.03]" />

            {/* Locked/protected → a bare padlock sitting on the folder face. */}
            {isLocked && (
              <PadlockGlyph
                className="absolute left-1/2 top-[58%] h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]"
              />
            )}
          </div>

          {/* Name only — the rest lives in Get info (right-click / long-press). */}
          <p
            className="w-full truncate text-center text-sm font-medium text-[var(--color-text)]"
            title={folder.name}
          >
            {midTrunc(folder.name, 16, 8)}
          </p>
        </div>
      </ContextMenuTrigger>

      {/* Options via right-click (desktop) / long-press (touch). */}
      <ContextMenuContent className="w-52">
        <ContextMenuItem className="gap-2" onSelect={() => onOpenFolder(folder)}>
          <FolderOpen className="h-4 w-4" /> Open
        </ContextMenuItem>
        <ContextMenuItem className="gap-2" onSelect={() => onRenameFolder(folder)}>
          <Edit className="h-4 w-4" /> Rename
        </ContextMenuItem>
        {onMoveFolderRequest && (
          <ContextMenuItem className="gap-2" onSelect={() => onMoveFolderRequest(folder)}>
            <Folder className="h-4 w-4" /> Move to folder
          </ContextMenuItem>
        )}
        {!folder.protected && onProtectFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onProtectFolder(folder)}>
            <Key className="h-4 w-4" /> Protect with password…
          </ContextMenuItem>
        )}
        {folder.protected && onRemoveFolderPassword && (
          <ContextMenuItem className="gap-2" onSelect={() => onRemoveFolderPassword(folder)}>
            <Unlock className="h-4 w-4" /> Remove password…
          </ContextMenuItem>
        )}
        {onOpenFolderDetails && (
          <ContextMenuItem className="gap-2" onSelect={() => onOpenFolderDetails(folder)}>
            <Info className="h-4 w-4" /> Get info
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
          onSelect={() => onDeleteFolder(folder)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileCardInner({
  entry,
  file,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
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
  onFileClick: (file: FileMetadata, e: React.MouseEvent) => void;
  onEntryKeyDown: (entry: ExplorerEntry, e: React.KeyboardEvent) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  drag: RowDragProps;
}) {
  const { thumbnailUrl, loading: thumbLoading } = useThumbnail(file.id, file.original_name);
  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const isImage = isImageFile(file.original_name);

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
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...(drag.dropHandlers ?? {})}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 focus-visible:ring-inset active:scale-[0.99] sm:active:scale-100",
        FOCUS_RING,
        drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        drag.isBeingDragged && "opacity-50",
        drag.isDropOver
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
          : selected
            ? CARD_SELECTED
            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg"
      )}
    >
      {/* Selection checkbox */}
      {selectMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(file.id);
          }}
          className={cn(
            "absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-sm transition-colors hover:border-[var(--color-accent)]",
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

      {/* Visual header */}
      <div
        className={cn(
          "relative flex h-[120px] items-center justify-center overflow-hidden",
          !thumbnailUrl && `bg-gradient-to-b ${typeInfo.gradient}`
        )}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
          src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)]/80 shadow-sm backdrop-blur-sm">
            <Icon className={cn("h-7 w-7", typeInfo.color)} />
          </div>
        )}

        {/* Type badge — moved to top-LEFT so the always-on kebab owns top-right.
            (Hidden in select mode, where the checkbox takes the corner.) */}
        {!selectMode && (
          <span
            className={cn(
              "absolute left-2.5 top-2.5 rounded-md border px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm",
              thumbnailUrl
                ? "border-white/4 bg-black/20 text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface)]/80 text-[var(--color-text-secondary)]"
            )}
          >
            {typeInfo.label}
          </span>
        )}

        {/* Encrypted hint — an image whose thumbnail isn't available (locked
            folder / not yet cached) still reads as a real, encrypted image. */}
        {isImage && !thumbnailUrl && !thumbLoading && (
          <span className="absolute bottom-2 left-2.5 flex items-center gap-1 rounded-md border border-[var(--color-border)]/50 bg-[var(--color-surface)]/80 px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] backdrop-blur-sm">
            <Lock className="h-2.5 w-2.5" /> Encrypted
          </span>
        )}

        {/* Kebab — pinned top-right. ALWAYS visible on touch, hover-reveal on
            desktop (CardKebab owns the responsive opacity). This is the fix for
            mobile: every action is reachable here, since the hover bar below
            never appears on a touch device. */}
        {!selectMode && (
          <div className="absolute right-2.5 top-2.5 z-10">
            <CardKebab label={`More actions for ${file.original_name}`}>
              <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                {actions.onPreview && (
                  <DropdownMenuItem onClick={() => actions.onPreview?.(file.original_name)}>
                    <Eye className="h-4 w-4" /> Preview
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => actions.onDownload(file.original_name)}>
                  <Download className="h-4 w-4" /> Download
                </DropdownMenuItem>
                {onOpenDetails && (
                  <DropdownMenuItem onClick={() => onOpenDetails(file)}>
                    <Info className="h-4 w-4" /> Get info
                  </DropdownMenuItem>
                )}
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
            </CardKebab>
          </div>
        )}

        {/* Desktop quick actions — a bottom bar revealed on hover that keeps the
            thumbnail visible (replaces the old full-cover blur). Hidden on touch
            (sm:flex), where the kebab covers everything. */}
        {!selectMode && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-center justify-end gap-1.5 bg-gradient-to-t from-black/55 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
            {actions.onPreview && (
              <IconButton
                icon={Eye}
                label="Preview"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onPreview?.(file.original_name);
                }}
                className="pointer-events-auto h-9 w-9 rounded-lg bg-[var(--color-surface)]/90 shadow-sm backdrop-blur-sm hover:bg-[var(--color-surface)]"
              />
            )}
            <IconButton
              icon={Download}
              label="Download"
              onClick={(e) => {
                e.stopPropagation();
                actions.onDownload(file.original_name);
              }}
              className="pointer-events-auto h-9 w-9 rounded-lg bg-[var(--color-surface)]/90 shadow-sm backdrop-blur-sm hover:bg-[var(--color-surface)]"
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-1 p-3">
        <p className="truncate whitespace-nowrap text-sm font-medium text-[var(--color-text)]" title={file.original_name}>
          {midTrunc(file.original_name, 10, 4)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
            {formatBytes(file.original_size)}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {formatDate(file.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ExplorerCard({
  entry,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
  onOpenFolderDetails,
  onOpenDetails,
  drag,
}: ExplorerCardProps) {
  if (entry.kind === "folder") {
    return (
      <FolderCard
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
        drag={drag}
      />
    );
  }
  return (
    <FileCardInner
      entry={entry}
      file={entry.file}
      actions={actions}
      selectMode={selectMode}
      selected={selected}
      focused={focused}
      onSelect={onSelect}
      onFileClick={onFileClick}
      onEntryKeyDown={onEntryKeyDown}
      onOpenDetails={onOpenDetails ?? actions.onOpenDetails}
      drag={drag}
    />
  );
}
