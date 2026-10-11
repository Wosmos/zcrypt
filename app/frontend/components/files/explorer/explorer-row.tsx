"use client";

import { useTranslations } from "next-intl";
import { memo, type ComponentType, type CSSProperties } from "react";
import NextImage from "next/image";
import type { ExplorerItemProps, FolderItemProps, FileItemProps, RowDragProps } from "./types";
import { explorerItemPropsEqual, FOCUS_RING, ROW_SELECTED } from "./types";
import {
  ExplorerEntryDispatch,
  SelectCheckbox,
  fileEntryProps,
  useFileEntryView,
} from "./entry-dispatch";
import { FileHealthBadge } from "./health-badge";
import { StarButton } from "./star-button";
import { useStarredStore } from "@/store/starred";
import { formatBytes, formatDate, cn, midTrunc, savingsPercent } from "@/lib/utils";
import { folderLook } from "./folder-look";
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
  ChevronRight,
  Lock,
  Key,
  Unlock,
  PaintBrush,
  AlertTriangle,
  Star,
} from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function MenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-100 transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          FOCUS_RING,
        )}
        aria-label={label}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
  );
}

/** Shared interactive-row container styling for FolderRow and FileRow. */
function rowContainerClassName(drag: RowDragProps, idleClassName: string) {
  return cn(
    "group flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-3 transition-all last:border-0 focus-visible:ring-inset",
    FOCUS_RING,
    drag.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
    drag.isBeingDragged && "opacity-50",
    drag.isDropOver
      ? "bg-[var(--color-accent)]/10 ring-2 ring-inset ring-[var(--color-accent)]"
      : idleClassName,
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
  onCustomizeFolder,
  drag,
}: FolderItemProps) {
  const t = useTranslations("app.explorerItem");
  const {
    Glyph: FolderGlyph,
    background: customBackground,
    color: customColor,
  } = folderLook(folder);

  return (
    <div
      role="button"
      data-entry-id={folder.id}
      tabIndex={focused ? 0 : -1}
      aria-label={t(folder.protected ? "openFolderProtected" : "openFolder", { name: folder.name })}
      draggable={drag.draggable}
      onClick={() => onOpenFolder(folder)}
      onKeyDown={(e) => onEntryKeyDown(entry, e)}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      {...(drag.dropHandlers ?? {})}
      className={rowContainerClassName(drag, "hover:bg-[var(--color-surface-1)] hover:shadow-sm")}
    >
      {/* Folder glyph; a small lock badge on protected folders conveys real
          state (allowed by the spec, unlike the per-file glyph we removed). Same
          custom-icon → name-inferred → generic fallback chain as FolderCard, so
          grid and list views stay visually consistent. */}
      <div
        className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
        style={
          customBackground
            ? { background: customBackground }
            : customColor
              ? { backgroundColor: `${customColor}1a`, color: customColor }
              : undefined
        }
      >
        {FolderGlyph ? (
          <FolderGlyph weight="fill" size={18} />
        ) : (
          <Folder className="h-[18px] w-[18px]" />
        )}
        {folder.protected && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] shadow-sm"
            aria-hidden="true"
          >
            <Lock className="h-2.5 w-2.5" strokeWidth={2.25} />
          </span>
        )}
      </div>
      <span
        className="min-w-0 flex-1 whitespace-nowrap text-sm font-medium text-[var(--color-text)]"
        title={folder.name}
      >
        {midTrunc(folder.name, 16, 6)}
      </span>
      {/* Type column placeholder for visual alignment */}
      <span className="hidden w-[110px] flex-shrink-0 text-sm text-[var(--color-text-secondary)] sm:block">
        {t("folder")}
      </span>
      {/* Size / saved / modified columns are "-" for folders */}
      <span className="hidden w-[80px] flex-shrink-0 text-right text-sm tabular-nums text-[var(--color-text-secondary)] sm:block">
        -
      </span>
      <span className="hidden w-[64px] flex-shrink-0 text-right text-sm tabular-nums text-[var(--color-text-secondary)] md:block">
        -
      </span>
      <span className="hidden w-[110px] flex-shrink-0 text-right text-sm text-[var(--color-text-secondary)] sm:block">
        {formatDate(folder.created_at)}
      </span>
      <DropdownMenu>
        <MenuTrigger label={t("actionsForFolder", { name: folder.name })} />
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => onOpenFolder(folder)}>
            <FolderOpen className="h-4 w-4" /> {t("open")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRenameFolder(folder)}>
            <Edit className="h-4 w-4" /> {t("rename")}
          </DropdownMenuItem>
          {onCustomizeFolder && (
            <DropdownMenuItem onClick={() => onCustomizeFolder(folder)}>
              <PaintBrush className="h-4 w-4" /> {t("customize")}
            </DropdownMenuItem>
          )}
          {onMoveFolderRequest && (
            <DropdownMenuItem onClick={() => onMoveFolderRequest(folder)}>
              <Folder className="h-4 w-4" /> {t("moveToFolder")}
            </DropdownMenuItem>
          )}
          {!folder.protected && onProtectFolder && (
            <DropdownMenuItem onClick={() => onProtectFolder(folder)}>
              <Key className="h-4 w-4" /> {t("protect")}
            </DropdownMenuItem>
          )}
          {folder.protected && onRemoveFolderPassword && (
            <DropdownMenuItem onClick={() => onRemoveFolderPassword(folder)}>
              <Unlock className="h-4 w-4" /> {t("removePassword")}
            </DropdownMenuItem>
          )}
          {onShareFolder && (
            <DropdownMenuItem onClick={() => onShareFolder(folder)}>
              <Share2 className="h-4 w-4" /> {t("share")}
            </DropdownMenuItem>
          )}
          {onOpenFolderDetails && (
            <DropdownMenuItem onClick={() => onOpenFolderDetails(folder)}>
              <Info className="h-4 w-4" /> {t("getInfo")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDeleteFolder(folder)}
            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Navigation affordance: visible at ALL widths so a folder reads as
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
  onCustomizeFile,
  onRenameFile,
  drag,
}: FileItemProps) {
  const t = useTranslations("app.explorerItem");
  const {
    displayName,
    unavailable,
    thumbnailUrl,
    cardRef,
    typeInfo,
    Icon,
    iconColorStyle,
    starred,
  } = useFileEntryView(file);
  const savings = savingsPercent(file.original_size, file.encrypted_size);

  return (
    <div
      ref={cardRef}
      {...fileEntryProps(
        { entry, file, focused, selected, drag, onFileClick, onEntryKeyDown },
        t(unavailable ? "rowUnavailable" : "row", {
          name: displayName,
          type: typeInfo.label,
          size: formatBytes(file.original_size),
        }),
      )}
      className={rowContainerClassName(
        drag,
        selected ? ROW_SELECTED : "hover:bg-[var(--color-surface-1)] hover:shadow-sm",
      )}
    >
      {selectMode && (
        <SelectCheckbox
          file={file}
          displayName={displayName}
          selected={selected}
          onSelect={onSelect}
          className="flex flex-shrink-0 items-center justify-center rounded"
        />
      )}
      {/* Outer wrapper carries the badge (positioned OUTSIDE the box); the inner
          box keeps `overflow-hidden` for the thumbnail `fill` image, which would
          otherwise clip a badge anchored to the same clipped box. */}
      <div className="relative h-9 w-9 flex-shrink-0">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg",
            !thumbnailUrl && typeInfo.bg,
          )}
        >
          {thumbnailUrl ? (
            // Decrypted thumbnail (data: URI / blob object URL), unoptimized via
            // next.config (see zero-knowledge note there). `fill` matches the
            // fixed 36×36 box.
            <NextImage src={thumbnailUrl} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            <TypeGlyph
              Icon={Icon}
              className={cn("h-[18px] w-[18px]", !file.style?.color && typeInfo.color)}
              style={iconColorStyle}
            />
          )}
        </div>
        {/* Hard-failed thumbnail (chunk data permanently unrecoverable) gets a
            small warning badge: reads distinctly from an ordinary file that
            simply has no preview. */}
        {unavailable && !thumbnailUrl && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-surface)] text-amber-500 shadow-sm"
            title={t("previewUnavailable")}
            aria-hidden="true"
          >
            <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className="whitespace-nowrap text-sm font-medium text-[var(--color-text)]"
          title={displayName}
        >
          {midTrunc(displayName, 16, 6)}
        </span>
        <FileHealthBadge file={file} />
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
          Number(savings) > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
        )}
      >
        {savings}%
      </span>
      <span className="hidden w-[110px] flex-shrink-0 text-right text-sm text-[var(--color-text-secondary)] sm:block">
        {formatDate(file.created_at)}
      </span>
      <StarButton fileId={file.id} name={displayName} />
      <DropdownMenu>
        <MenuTrigger label={t("actionsFor", { name: displayName })} />
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          {onRequestSelect && (
            <>
              <DropdownMenuItem onClick={() => onRequestSelect(file.id)}>
                <CheckSquare className="h-4 w-4" /> {t("select")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => useStarredStore.getState().toggle(file.id)}>
            <Star className="h-4 w-4" /> {t(starred ? "unstar" : "star")}
          </DropdownMenuItem>
          {actions.onPreview && (
            <DropdownMenuItem onClick={() => actions.onPreview?.(displayName)}>
              <Eye className="h-4 w-4" /> {t("preview")}
            </DropdownMenuItem>
          )}
          {onRenameFile && (
            <DropdownMenuItem onClick={() => onRenameFile(file)}>
              <Edit className="h-4 w-4" /> {t("rename")}
            </DropdownMenuItem>
          )}
          {onCustomizeFile && (
            <DropdownMenuItem onClick={() => onCustomizeFile(file)}>
              <PaintBrush className="h-4 w-4" /> {t("customize")}
            </DropdownMenuItem>
          )}
          {onOpenDetails && (
            <DropdownMenuItem onClick={() => onOpenDetails(file)}>
              <Info className="h-4 w-4" /> {t("getInfo")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.onDownload(displayName)}>
            <Download className="h-4 w-4" /> {t("download")}
          </DropdownMenuItem>
          {actions.onShare && (
            <DropdownMenuItem onClick={() => actions.onShare?.(file.id)}>
              <Share2 className="h-4 w-4" /> {t("share")}
            </DropdownMenuItem>
          )}
          {actions.onMoveRequest && (
            <DropdownMenuItem onClick={() => actions.onMoveRequest?.(file.id)}>
              <FolderOpen className="h-4 w-4" /> {t("moveToFolder")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => actions.onDelete(file.id)}
            className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Chevron spacer to align with the folder rows' navigation chevron
          (now visible at all widths, so the spacer is too). */}
      <span className="h-4 w-4 flex-shrink-0" />
    </div>
  );
}

function ExplorerRowImpl(props: ExplorerItemProps) {
  return <ExplorerEntryDispatch {...props} FolderView={FolderRow} FileView={FileRow} />;
}

/**
 * Memoized so a parent (vault-explorer) re-render doesn't re-render every row in
 * the `.map()`: only rows whose entry / selection / focus / drag-visual state
 * actually changed. See `explorerItemPropsEqual` for why callback identity is
 * intentionally excluded from the comparison.
 */

type GlyphProps = { className?: string; style?: CSSProperties };

/** Renders a file-type or custom icon picked from the static icon maps. */
function TypeGlyph({ Icon, ...props }: GlyphProps & { Icon: ComponentType<GlyphProps> }) {
  return <Icon {...props} />;
}

export const ExplorerRow = memo(ExplorerRowImpl, explorerItemPropsEqual);
