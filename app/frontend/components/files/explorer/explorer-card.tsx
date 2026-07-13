"use client";

import { memo, useId } from "react";
import type { ExplorerItemProps, FolderItemProps, FileItemProps } from "./types";
import { explorerItemPropsEqual, FOCUS_RING } from "./types";
import { ExplorerEntryDispatch, SelectCheckbox } from "./entry-dispatch";
import { formatBytes, getFileTypeInfo, isVideoFile, cn, midTrunc, fileIconFor, extOf } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnail";
import { prefetchOnHover } from "@/hooks/useFileDecryptor";
import { getIconByKey } from "@/lib/folder-icons";
import { folderVisuals } from "@/lib/folder-visuals";
import { getFolderShape, SHAPE_FOR_SURFACE, type FolderShape } from "@/lib/folder-shapes";
import { useTheme } from "@/components/providers/theme-provider";
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

/**
 * MacFolder — a big, filled, macOS/iOS-style folder glyph. Two-tone (a darker
 * back panel + raised tab behind a brighter front pocket), a glassy top sheen,
 * and a soft drop shadow for depth. Tinted with the accent via `currentColor`,
 * so it lives on the card surface like a desktop folder icon. ~116px wide.
 */
function MacFolder({
  className,
  color,
  background,
  shape,
}: {
  className?: string;
  color?: string;
  background?: string;
  shape: FolderShape;
}) {
  const id = useId();
  const sheen = `${id}-sheen`;
  const shadow = `${id}-shadow`;
  // Silhouette comes from the active folder shape (follows the surface style or
  // the user's explicit pick). `pocket` is the front face + sheen + bg clip.
  const { pocket, backPanel } = shape;
  return (
    <svg
      viewBox="0 0 120 100"
      className={cn("text-[var(--color-accent)]", className)}
      style={!background && color ? { color } : undefined}
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
        {/* Back panel + raised tab (darker, sits behind the front pocket). When a
            design background is set it becomes a plain dark sliver instead of
            trying to tint a gradient — reads as the same "layered folder" shadow. */}
        <path d={backPanel} fill={background ? "#000000" : "currentColor"} fillOpacity={background ? 0.25 : 0.55} />
        {/* Front pocket — a design background is painted as real content (via
            foreignObject + a CSS clip-path matching the pocket outline) so the
            gradient/pattern lives ON the folder shape, not on the SVG's own
            rectangular bounding box (which is what a plain CSS `background` on
            the <svg> would do). */}
        {background ? (
          <foreignObject x="0" y="0" width="120" height="100" style={{ clipPath: `path('${pocket}')` }}>
            <div style={{ width: "100%", height: "100%", background }} />
          </foreignObject>
        ) : (
          <path d={pocket} fill="currentColor" />
        )}
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
  onCustomizeFolder,
  drag,
}: FolderItemProps) {
  // Lock state, glyph, initial, and custom bg/color — resolved once, shared with
  // the list row (see lib/folder-visuals.ts). Padlock shows when the folder has
  // its own password OR the vault is locked (name → "[locked]", set in useFolders).
  const { isLocked, FolderGlyph, initial, customBackground, customColor: baseColor } = folderVisuals(folder);
  // On the card a design background replaces the flat accent tint.
  const customColor = customBackground ? undefined : baseColor;

  // Folder silhouette: the user's explicit pick, else the surface style's default
  // (brutalist -> square, claymorphism -> round, …) so it matches the app's look.
  const { surfaceStyle, folderShape } = useTheme();
  const folderShapeDef = getFolderShape(folderShape || SHAPE_FOR_SURFACE[surfaceStyle]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          data-entry-id={folder.id}
          data-folder-drop={folder.id}
          tabIndex={focused ? 0 : -1}
          aria-label={`Open folder ${folder.name}${folder.protected ? ", password protected" : ""}. Right-click or long-press for actions.`}
          draggable={drag.draggable}
          onClick={() => onOpenFolder(folder)}
          onKeyDown={(e) => onEntryKeyDown(entry, e)}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          onTouchStart={drag.onTouchStart}
          {...(drag.dropHandlers ?? {})}
          className={cn(
            "group relative flex select-none flex-col items-center gap-1.5 rounded-xl transition-all duration-200 [-webkit-touch-callout:none] focus-visible:ring-inset",
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
            <MacFolder className="w-full max-w-[150px]" color={customColor} background={customBackground} shape={folderShapeDef} />

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

          {/* Name only — the rest lives in Get info (right-click / long-press).
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
          <FolderOpen className="h-4 w-4" /> Open
        </ContextMenuItem>
        <ContextMenuItem className="gap-2" onSelect={() => onRenameFolder(folder)}>
          <Edit className="h-4 w-4" /> Rename
        </ContextMenuItem>
        {onCustomizeFolder && (
          <ContextMenuItem className="gap-2" onSelect={() => onCustomizeFolder(folder)}>
            <PaintBrush className="h-4 w-4" /> Customize…
          </ContextMenuItem>
        )}
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
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenDetails,
  onCustomizeFile,
  drag,
}: FileItemProps) {
  const { thumbnailUrl, pending } = useThumbnail(file.id, file.original_name, file.original_size);
  const typeInfo = getFileTypeInfo(file.original_name);
  const customIcon = file.style?.icon ? getIconByKey(file.style.icon) : null;
  const Icon = customIcon ?? fileIconFor(file.original_name);
  const iconColorClass = file.style?.color ? undefined : typeInfo.color;
  const iconColorStyle = file.style?.color ? { color: file.style.color } : undefined;
  const isVideo = isVideoFile(file.original_name);

  const ext = extOf(file.original_name).toUpperCase().slice(0, 4);

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
          // Desktop-only hover prefetch: warm the decrypt cache for previewable
          // files so opening feels instant (guards + dedup live in prefetchOnHover).
          onPointerEnter={() => prefetchOnHover(file)}
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          onTouchStart={drag.onTouchStart}
          {...(drag.dropHandlers ?? {})}
          className={cn(
            "group relative flex select-none flex-col items-center gap-1.5 rounded-xl p-1.5 transition-all duration-200 [-webkit-touch-callout:none] focus-visible:ring-inset",
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
        <SelectCheckbox
          file={file}
          selected={selected}
          onSelect={onSelect}
          className="absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]"
        />
      )}

          {/* Preview — free-standing, sized to the file's own aspect ratio
              (landscape stays landscape, portrait stays portrait), macOS-icon
              style: a photo for image/video, a small document tile otherwise. */}
          <div className="flex h-[104px] w-full items-end justify-center sm:h-[92px]">
            {thumbnailUrl ? (
              <div className="relative inline-flex">
                {/* Intentionally a raw <img>, NOT next/image. This preview is
                    sized by its OWN intrinsic aspect ratio (w-auto/h-auto +
                    max-h): a portrait thumb renders tall, a landscape one wide,
                    macOS-icon style. next/image needs known width+height or a
                    `fill` container — `fill` would stretch every preview to a
                    fixed box and destroy that intrinsic sizing, and the real
                    pixel dimensions of the decrypted thumbnail aren't known at
                    render time. The src is already an unoptimizable client-side
                    data: URI anyway (see next.config zero-knowledge note), so
                    next/image would add zero benefit here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="h-auto max-h-[104px] w-auto max-w-full rounded-[10px] object-contain shadow-[0_3px_9px_rgba(0,0,0,0.20)] ring-1 ring-black/10 dark:ring-white/10 sm:max-h-[92px]"
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
              <div className="h-[88px] w-[88px] animate-shimmer rounded-[10px] ring-1 ring-black/5 dark:ring-white/10 sm:h-[76px] sm:w-[76px]" />
            ) : (
              /* Document tile — a small white page with a folded corner, the
                 file-type glyph, and its extension. */
              <div className="relative flex h-[100px] w-[76px] flex-col items-center justify-center gap-1.5 rounded-[10px] bg-[var(--color-surface)] shadow-[0_3px_9px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:ring-white/10 sm:h-[88px] sm:w-[68px]">
                <span
                  className="absolute right-0 top-0 h-4 w-4 rounded-tr-[10px] bg-[var(--color-surface-2)]"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
                />
                <Icon className={cn("h-8 w-8", iconColorClass)} style={iconColorStyle} />
                {ext && (
                  <span
                    className={cn("text-[8px] font-bold uppercase tracking-wider", iconColorClass)}
                    style={iconColorStyle}
                  >
                    {ext}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Name — bottom, wraps to 2 lines like macOS Finder. Smaller on phones
              (11px) so long names don't dominate the tighter 2-column grid. */}
          <p
            className="line-clamp-2 w-full break-words text-center text-[11px] font-medium leading-tight text-[var(--color-text)] sm:text-[12.5px]"
            title={file.original_name}
          >
            {file.original_name}
          </p>
        </div>
      </ContextMenuTrigger>

      {/* Right-click (desktop) / long-press (touch) actions. */}
      <ContextMenuContent className="w-52">
        {onRequestSelect && (
          <>
            <ContextMenuItem className="gap-2" onSelect={() => onRequestSelect(file.id)}>
              <CheckSquare className="h-4 w-4" /> Select
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {actions.onPreview && (
          <ContextMenuItem className="gap-2" onSelect={() => actions.onPreview?.(file.original_name)}>
            <Eye className="h-4 w-4" /> Preview
          </ContextMenuItem>
        )}
        {onCustomizeFile && (
          <ContextMenuItem className="gap-2" onSelect={() => onCustomizeFile(file)}>
            <PaintBrush className="h-4 w-4" /> Customize…
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

function ExplorerCardImpl(props: ExplorerItemProps) {
  return <ExplorerEntryDispatch {...props} FolderView={FolderCard} FileView={FileCardInner} />;
}

/**
 * Memoized so a parent (vault-explorer) re-render doesn't re-render every card
 * in the `.map()` — only cards whose entry / selection / focus / drag-visual
 * state actually changed. See `explorerItemPropsEqual` for why callback identity
 * is intentionally excluded from the comparison.
 */
export const ExplorerCard = memo(ExplorerCardImpl, explorerItemPropsEqual);
