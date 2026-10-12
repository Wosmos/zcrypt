"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import type { ExplorerItemProps, FolderItemProps, FileItemProps } from "./types";
import { explorerItemPropsEqual, FOCUS_RING } from "./types";
import { folderLook } from "./folder-look";
import {
  ExplorerEntryDispatch,
  SelectCheckbox,
  fileEntryProps,
  useFileEntryView,
} from "./entry-dispatch";
import { FileHealthBadge } from "./health-badge";
import { FileActionsMenu } from "./file-actions-menu";
import { formatBytes, isVideoFile, cn, midTrunc, extOf } from "@/lib/utils";
import { DocTile, FolderTile, ThumbTile } from "@/components/files/tiles/tiles";
import {
  Folder,
  FolderOpen,
  Eye,
  Info,
  Download,
  Share2,
  Trash2,
  Edit,
  CheckSquare,
  Key,
  Unlock,
  PaintBrush,
} from "@/lib/icons";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

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
  onCustomizeFolder,
  drag,
}: FolderItemProps) {
  const t = useTranslations("app.explorerItem");
  const look = folderLook(folder);
  const isLocked = look.isLocked;
  const FolderGlyph = look.Glyph;
  const initial = look.initial;
  const customBackground = look.background;
  const customColor = customBackground ? undefined : look.color;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          data-entry-id={folder.id}
          data-folder-drop={folder.id}
          tabIndex={focused ? 0 : -1}
          aria-label={t(folder.protected ? "openFolderProtectedHint" : "openFolderHint", {
            name: folder.name,
          })}
          draggable={drag.draggable}
          onClick={() => onOpenFolder(folder)}
          onKeyDown={(e) => onEntryKeyDown(entry, e)}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          onTouchStart={drag.onTouchStart}
          {...(drag.dropHandlers ?? {})}
          className={cn(
            "ft-host group relative flex select-none flex-col items-center gap-1.5 rounded-xl transition-all duration-200 [-webkit-touch-callout:none] focus-visible:ring-inset",
            FOCUS_RING,
            drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            drag.isBeingDragged && "opacity-50",
            drag.isDropOver &&
              "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]",
          )}
        >
          <div className="relative flex w-full items-center justify-center">
            <FolderTile
              className="max-w-[150px]"
              Glyph={FolderGlyph}
              initial={initial}
              locked={isLocked}
              color={customColor}
              background={customBackground}
            />
          </div>

          {/* Name only: the rest lives in Get info (right-click / long-press).
              Matches the file card's smaller mobile name size. */}
          <p
            className="w-full truncate text-center text-[11px] font-medium text-[var(--color-text)] sm:text-sm"
            title={folder.name}
          >
            {midTrunc(folder.name, 16, 8)}
          </p>
        </div>
      </ContextMenuTrigger>

      {/* Options via right-click (desktop) / long-press (touch). */}
      <ContextMenuContent className="w-52">
        <ContextMenuItem className="gap-2" onSelect={() => onOpenFolder(folder)}>
          <FolderOpen className="h-4 w-4" /> {t("open")}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2" onSelect={() => onRenameFolder(folder)}>
          <Edit className="h-4 w-4" /> {t("rename")}
        </ContextMenuItem>
        {onCustomizeFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onCustomizeFolder(folder)}>
            <PaintBrush className="h-4 w-4" /> {t("customize")}
          </ContextMenuItem>
        )}
        {onMoveFolderRequest && (
          <ContextMenuItem className="gap-2" onSelect={() => onMoveFolderRequest(folder)}>
            <Folder className="h-4 w-4" /> {t("moveToFolder")}
          </ContextMenuItem>
        )}
        {!folder.protected && onProtectFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onProtectFolder(folder)}>
            <Key className="h-4 w-4" /> {t("protect")}
          </ContextMenuItem>
        )}
        {folder.protected && onRemoveFolderPassword && (
          <ContextMenuItem className="gap-2" onSelect={() => onRemoveFolderPassword(folder)}>
            <Unlock className="h-4 w-4" /> {t("removePassword")}
          </ContextMenuItem>
        )}
        {onShareFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onShareFolder(folder)}>
            <Share2 className="h-4 w-4" /> {t("share")}
          </ContextMenuItem>
        )}
        {onOpenFolderDetails && (
          <ContextMenuItem className="gap-2" onSelect={() => onOpenFolderDetails(folder)}>
            <Info className="h-4 w-4" /> {t("getInfo")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
          onSelect={() => onDeleteFolder(folder)}
        >
          <Trash2 className="h-4 w-4" /> {t("delete")}
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
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenDetails,
  onCustomizeFile,
  onRenameFile,
  drag,
}: FileItemProps) {
  const t = useTranslations("app.explorerItem");
  const {
    displayName,
    thumbnailUrl,
    pending,
    unavailable,
    cardRef,
    typeInfo,
    Icon,
    iconColorStyle,
  } = useFileEntryView(file);
  const iconColorClass = file.style?.color ? undefined : typeInfo.color;
  const isVideo = isVideoFile(displayName);
  const ext = extOf(displayName).toUpperCase().slice(0, 4);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={cardRef}
          {...fileEntryProps(
            { entry, file, focused, selected, drag, onFileClick, onEntryKeyDown },
            t(unavailable ? "fileHintUnavailable" : "fileHint", {
              name: displayName,
              type: typeInfo.label,
              size: formatBytes(file.original_size),
            }),
          )}
          data-tour="file-card"
          onTouchStart={drag.onTouchStart}
          className={cn(
            "ft-host group relative flex select-none flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all duration-200 [-webkit-touch-callout:none] focus-visible:ring-inset",
            FOCUS_RING,
            drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            drag.isBeingDragged && "opacity-50",
            drag.isDropOver
              ? "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
              : selected
                ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/40"
                : "",
          )}
        >
          {/* Selection checkbox */}
          {selectMode && (
            <SelectCheckbox
              file={file}
              displayName={displayName}
              selected={selected}
              onSelect={onSelect}
              className="absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]"
            />
          )}

          {/* Preview: free-standing, sized to the file's own aspect ratio
              (landscape stays landscape, portrait stays portrait), macOS-icon
              style: a photo for image/video, a small document tile otherwise. */}
          <div className="flex h-[104px] w-full items-end justify-center sm:h-[92px]">
            {thumbnailUrl ? (
              <ThumbTile video={isVideo} className="h-[82px] w-[110px] sm:h-[74px] sm:w-[98px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbnailUrl} alt="" decoding="async" />
              </ThumbTile>
            ) : pending ? (
              <div className="h-[88px] w-[88px] animate-shimmer rounded-[10px] ring-1 ring-black/5 dark:ring-white/10 sm:h-[76px] sm:w-[76px]" />
            ) : (
              <DocTile
                Icon={Icon}
                ext={ext}
                stacked={ext === "PDF" || ext === "DOCX"}
                unavailable={unavailable}
                colorClass={iconColorClass}
                colorStyle={iconColorStyle}
                className="sm:h-[88px] sm:w-[68px]"
              />
            )}
          </div>

          {/* Name: bottom, wraps to 2 lines like macOS Finder. Smaller on phones
              (11px) so long names don't dominate the tighter 2-column grid. */}
          <p
            className="line-clamp-2 w-full break-words text-center text-[11px] font-medium leading-tight text-[var(--color-text)] sm:text-[12.5px]"
            title={displayName}
          >
            {displayName}
          </p>
          <FileHealthBadge file={file} />
          <FileActionsMenu
            file={file}
            displayName={displayName}
            actions={actions}
            onRequestSelect={onRequestSelect}
            onOpenDetails={onOpenDetails}
            onCustomizeFile={onCustomizeFile}
            onRenameFile={onRenameFile}
            triggerClassName="absolute right-1.5 top-1.5 z-10 bg-[var(--color-surface)]/80 backdrop-blur"
          />
        </div>
      </ContextMenuTrigger>

      {/* Right-click (desktop) / long-press (touch) actions. */}
      <ContextMenuContent className="w-52">
        {onRequestSelect && (
          <>
            <ContextMenuItem className="gap-2" onSelect={() => onRequestSelect(file.id)}>
              <CheckSquare className="h-4 w-4" /> {t("select")}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {actions.onPreview && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onPreview?.(file.id)}>
            <Eye className="h-4 w-4" /> {t("preview")}
          </ContextMenuItem>
        )}
        {onRenameFile && (
          <ContextMenuItem className="gap-2" onSelect={() => onRenameFile(file)}>
            <Edit className="h-4 w-4" /> {t("rename")}
          </ContextMenuItem>
        )}
        {onCustomizeFile && (
          <ContextMenuItem className="gap-2" onSelect={() => onCustomizeFile(file)}>
            <PaintBrush className="h-4 w-4" /> {t("customize")}
          </ContextMenuItem>
        )}
        <ContextMenuItem className="gap-2" onSelect={() => actions.onDownload(file.id)}>
          <Download className="h-4 w-4" /> {t("download")}
        </ContextMenuItem>
        {onOpenDetails && (
          <ContextMenuItem className="gap-2" onSelect={() => onOpenDetails(file)}>
            <Info className="h-4 w-4" /> {t("getInfo")}
          </ContextMenuItem>
        )}
        {actions.onShare && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onShare?.(file.id)}>
            <Share2 className="h-4 w-4" /> {t("share")}
          </ContextMenuItem>
        )}
        {actions.onMoveRequest && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onMoveRequest?.(file.id)}>
            <FolderOpen className="h-4 w-4" /> {t("moveToFolder")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 text-red-500 focus:bg-red-500/10 focus:text-red-500"
          onSelect={() => actions.onDelete(file.id)}
        >
          <Trash2 className="h-4 w-4" /> {t("delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ExplorerCardImpl(props: ExplorerItemProps) {
  return <ExplorerEntryDispatch {...props} FolderView={FolderCard} FileView={FileCardInner} />;
}

/**
 * Memoized so a parent (vault-explorer) re-render doesn't re-render every card
 * in the `.map()`: only cards whose entry / selection / focus / drag-visual
 * state actually changed. See `explorerItemPropsEqual` for why callback identity
 * is intentionally excluded from the comparison.
 */
export const ExplorerCard = memo(ExplorerCardImpl, explorerItemPropsEqual);
