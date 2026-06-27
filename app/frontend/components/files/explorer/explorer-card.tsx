"use client";

import type { ExplorerEntry, ExplorerActions } from "./types";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";
import type { RowDragProps } from "./explorer-row";
import { formatBytes, formatDate, getFileTypeInfo, isImageFile, cn } from "@/lib/utils";
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
        "group relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200 focus-visible:ring-inset",
        FOCUS_RING,
        drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        drag.isBeingDragged && "opacity-50",
        drag.isDropOver
          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg"
      )}
    >
      {/* Kebab — pinned top-right, mirrors the file card's overlay controls. */}
      <div className="absolute right-2.5 top-2.5 z-10">
        <CardKebab label={`Actions for folder ${folder.name}`}>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteFolder(folder)}
              className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </CardKebab>
      </div>

      {/* Visual header — large folder glyph occupying the same area as a file
          card's thumbnail/header, so folders and files form an even grid (M1). */}
      <div className="flex h-[120px] items-center justify-center bg-gradient-to-b from-[var(--color-accent)]/10 to-[var(--color-accent)]/5">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)]/80 text-[var(--color-accent)] shadow-sm backdrop-blur-sm">
          <Folder className="h-7 w-7" />
          {folder.protected && (
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm"
              aria-hidden="true"
            >
              <Lock className="h-3 w-3" strokeWidth={2.25} />
            </span>
          )}
        </div>
      </div>

      {/* Info — matches the file card's footer footprint. */}
      <div className="min-w-0 flex-1 space-y-1 p-3">
        <p className="truncate text-sm font-medium text-[var(--color-text)]" title={folder.name}>
          {folder.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">Folder</span>
          <span className="text-xs text-[var(--color-text-secondary)]">
            {formatDate(folder.created_at)}
          </span>
        </div>
      </div>
    </div>
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
        <p className="truncate text-sm font-medium text-[var(--color-text)]" title={file.original_name}>
          {file.original_name}
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
