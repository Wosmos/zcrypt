"use client";

import { useId } from "react";
import type { ExplorerEntry, ExplorerActions } from "./types";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";
import type { RowDragProps } from "./explorer-row";
import { formatBytes, getFileTypeInfo, isVideoFile, cn, midTrunc } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnail";
import { getFolderIcon, getFolderInitial } from "@/lib/folder-icons";
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
  CheckSquare,
  Square,
  Key,
  Unlock,
} from "@/lib/icons";
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
  onShareFolder?: (folder: DecryptedFolder) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  drag: RowDragProps;
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
          <feDropShadow dx="0" dy="2.5" stdDeviation="3.5" floodColor="#000000" floodOpacity="0.26" />
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
  // Show the padlock when the folder has its own password OR the vault is locked
  // (name can't be decrypted → "[locked]", set in useFolders).
  const isLocked = folder.protected || folder.name === "[locked]";
  // Otherwise mark the folder by name (Documents, Downloads, Music…), falling
  // back to its initial letter — like macOS special folders.
  const FolderGlyph = isLocked ? null : getFolderIcon(folder.name);
  const initial = isLocked ? "" : getFolderInitial(folder.name);

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
          {/* Free-standing macOS folder. The hover transform lives on this
              wrapper so the mark moves WITH the folder (it's no longer a
              detached overlay). */}
          <div className="relative flex w-full items-center justify-center transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.02]">
            <MacFolder className="w-full max-w-[150px]" />

            {/* Mark on the folder face: padlock when locked, else a sleek
                Phosphor glyph by name, else the folder's initial letter. */}
            {isLocked ? (
              <PadlockGlyph
                className="absolute left-1/2 top-[57%] h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
              />
            ) : FolderGlyph ? (
              // Debossed/engraved into the folder: a grayish dark fill plus a
              // light bottom highlight reads as "carved in", and works on any
              // accent color.
              <FolderGlyph
                aria-hidden="true"
                weight="fill"
                size={38}
                className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 text-black/25 drop-shadow-[0_1px_0.5px_rgba(255,255,255,0.55)]"
              />
            ) : (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 select-none font-heading text-[24px] font-bold leading-none tracking-tight text-black/25 drop-shadow-[0_1px_0.5px_rgba(255,255,255,0.55)]"
              >
                {initial}
              </span>
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
        {onShareFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onShareFolder(folder)}>
            <Share2 className="h-4 w-4" /> Share
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
  const { thumbnailUrl, pending } = useThumbnail(file.id, file.original_name, file.original_size);
  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const isVideo = isVideoFile(file.original_name);

  const ext = (file.original_name.split(".").pop() || "").toUpperCase().slice(0, 4);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          data-entry-id={file.id}
          tabIndex={focused ? 0 : -1}
          aria-selected={selected}
          aria-label={`${file.original_name}, ${typeInfo.label}, ${formatBytes(file.original_size)}. Right-click or long-press for actions.`}
          draggable={drag.draggable}
          onClick={(e) => onFileClick(file, e)}
          onKeyDown={(e) => onEntryKeyDown(entry, e)}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          {...(drag.dropHandlers ?? {})}
          className={cn(
            "group relative flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all duration-200 focus-visible:ring-inset",
            FOCUS_RING,
            drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            drag.isBeingDragged && "opacity-50",
            drag.isDropOver
              ? "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
              : selected
                ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/40"
                : ""
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

          {/* Preview — free-standing, sized to the file's own aspect ratio
              (landscape stays landscape, portrait stays portrait), macOS-icon
              style: a photo for image/video, a small document tile otherwise. */}
          <div className="flex h-[92px] w-full items-end justify-center">
            {thumbnailUrl ? (
              <div className="relative inline-flex">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-auto max-h-[92px] w-auto max-w-full rounded-[10px] object-contain shadow-[0_3px_9px_rgba(0,0,0,0.20)] ring-1 ring-black/10 dark:ring-white/10"
                />
                {isVideo && (
                  <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/25 backdrop-blur-sm">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 translate-x-[1px] fill-white" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
              </div>
            ) : pending ? (
              /* Brief loader — a clean shimmer (not a blurry placeholder) while
                 this file's thumbnail decrypts + generates lazily on render. */
              <div className="h-[76px] w-[76px] animate-shimmer rounded-[10px] ring-1 ring-black/5 dark:ring-white/10" />
            ) : (
              /* Document tile — a small white page with a folded corner, the
                 file-type glyph, and its extension. */
              <div className="relative flex h-[88px] w-[68px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-[var(--color-surface)] shadow-[0_3px_9px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:ring-white/10">
                <span
                  className="absolute right-0 top-0 h-4 w-4 rounded-tr-[10px] bg-[var(--color-surface-2)]"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
                />
                <Icon className={cn("h-8 w-8", typeInfo.color)} />
                {ext && (
                  <span className={cn("text-[8px] font-bold uppercase tracking-wider", typeInfo.color)}>
                    {ext}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Name — bottom, wraps to 2 lines like macOS Finder. */}
          <p
            className="line-clamp-2 w-full break-words text-center text-[12.5px] font-medium leading-tight text-[var(--color-text)]"
            title={file.original_name}
          >
            {file.original_name}
          </p>
        </div>
      </ContextMenuTrigger>

      {/* Right-click (desktop) / long-press (touch) actions. */}
      <ContextMenuContent className="w-52">
        {actions.onPreview && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onPreview?.(file.original_name)}>
            <Eye className="h-4 w-4" /> Preview
          </ContextMenuItem>
        )}
        <ContextMenuItem className="gap-2" onSelect={() => actions.onDownload(file.original_name)}>
          <Download className="h-4 w-4" /> Download
        </ContextMenuItem>
        {onOpenDetails && (
          <ContextMenuItem className="gap-2" onSelect={() => onOpenDetails(file)}>
            <Info className="h-4 w-4" /> Get info
          </ContextMenuItem>
        )}
        {actions.onShare && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onShare?.(file.id)}>
            <Share2 className="h-4 w-4" /> Share
          </ContextMenuItem>
        )}
        {actions.onMoveRequest && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onMoveRequest?.(file.id)}>
            <FolderOpen className="h-4 w-4" /> Move to folder
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
          onSelect={() => actions.onDelete(file.id)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
  onShareFolder,
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
        onShareFolder={onShareFolder}
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
