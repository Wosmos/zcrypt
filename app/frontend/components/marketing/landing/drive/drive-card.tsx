"use client";

import { useRef } from "react";
import { Folder as FolderIcon, Lock, ChevronRight } from "@/lib/icons";
import { cn, fileIconFor, formatBytes } from "@/lib/utils";
import {
  DownloadSimple,
  FileText as FileTextFill,
  ImageSquare,
  MusicNotes,
} from "@phosphor-icons/react";
import {
  isDropped,
  kindOf,
  typeOf,
  type DriveFile,
  type DriveFolder,
  type DroppedFile,
  type Piece,
} from "./drive-data";
import { BinTile, DocTile3D, Folder3D, ThumbTile } from "./folder-3d";
import { useCardFlip } from "./use-card-flip";

export type CardItem = DriveFolder | DriveFile | DroppedFile;
export type CardKind = "folder" | "file" | "piece";

type OpenFn = (item: CardItem, kind: CardKind, el: HTMLElement, e: React.MouseEvent) => void;

const PH = {
  image: ImageSquare,
  doc: FileTextFill,
  music: MusicNotes,
  download: DownloadSimple,
} as const;

function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  cancelAnimationFrame(Number(el.dataset.raf || 0));
  el.dataset.raf = String(
    requestAnimationFrame(() => {
      el.style.setProperty("--rx", (x * 12).toFixed(2));
      el.style.setProperty("--ry", (-y * 12).toFixed(2));
    }),
  );
}

function untilt(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  cancelAnimationFrame(Number(el.dataset.raf || 0));
  el.style.setProperty("--rx", "0");
  el.style.setProperty("--ry", "0");
}

function YouFace({ item, kind }: { item: CardItem; kind: CardKind }) {
  if (kind === "folder") {
    const fo = item as DriveFolder;
    return (
      <>
        <span className="zh-ec-prev zh-ec-prev-fold">
          <Folder3D glyph={fo.glyph} locked={fo.locked} />
        </span>
        <span className="zh-ec-name zh-ec-name-fold">{fo.name}</span>
      </>
    );
  }
  const fi = item as DriveFile | DroppedFile;
  const k = kindOf(fi.name);
  const url = isDropped(fi) ? fi.url : null;
  const thumb = url || ((k === "image" || k === "video") && fi.art);
  return (
    <>
      <span className="zh-ec-prev">
        {thumb ? (
          <ThumbTile art={fi.art} src={url} seed={fi.seed} video={k === "video"} />
        ) : (
          <DocTile3D name={fi.name} />
        )}
      </span>
      <span className="zh-ec-name">{fi.name}</span>
    </>
  );
}

function GhFace({ piece, mine }: { piece: Piece; mine?: boolean }) {
  return (
    <>
      <span className="zh-ec-prev">
        <BinTile name={piece.name} />
      </span>
      <span className="zh-ec-name zh-ec-mono">{piece.name}</span>
      <span className={cn("zh-ec-size", mine && piece.cap && "zh-ec-cap")}>
        {piece.cap ?? piece.size}
      </span>
    </>
  );
}

/** One grid cell with both faces stacked; flips on rotateX when the view changes. */
export function DriveCard({
  item,
  kind,
  index,
  piece,
  isGh,
  selected,
  selectMode,
  mine,
  fresh,
  onOpen,
}: {
  item: CardItem;
  kind: CardKind;
  index: number;
  piece: Piece;
  isGh: boolean;
  selected?: boolean;
  selectMode?: boolean;
  mine?: boolean;
  fresh?: boolean;
  onOpen: OpenFn;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCardFlip(ref, isGh, index);
  const fo = kind === "folder" ? (item as DriveFolder) : null;
  const size = kind === "file" ? formatBytes((item as DriveFile).size) : "";
  const label = isGh
    ? `${piece.name}, ${piece.size}`
    : fo
      ? `${fo.name}, folder${fo.locked ? ", password protected" : ""}`
      : `${item.name}, ${size}`;

  return (
    <div
      ref={ref}
      className="zh-ec"
      data-id={item.id}
      data-kind={kind}
      data-mine={mine || undefined}
      data-new={fresh || undefined}
      data-sel={selected || undefined}
    >
      <button
        type="button"
        className="zh-ec-btn"
        aria-label={label}
        aria-pressed={selectMode && kind === "file" ? !!selected : undefined}
        onClick={(e) => onOpen(item, kind, e.currentTarget, e)}
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <span className="zh-ec-in">
          {kind === "file" ? <span className="zh-ec-check" aria-hidden="true" /> : null}
          <span className="zh-face zh-face-you">
            <YouFace item={item} kind={kind} />
          </span>
          <span className="zh-face zh-face-gh">
            <GhFace piece={piece} mine={mine} />
          </span>
        </span>
      </button>
    </div>
  );
}

/** Extra pieces of a dropped file. They only exist in the locked view. */
export function GhOnlyCard({
  id,
  piece,
  index,
  isGh,
  more,
  onOpen,
}: {
  id: string;
  piece: Piece;
  index: number;
  isGh: boolean;
  more?: string;
  onOpen: (piece: Piece, el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCardFlip(ref, isGh, index, true);
  return (
    <div ref={ref} className="zh-ec zh-ec-extra" data-id={id} data-kind="piece" data-mine="">
      <button
        type="button"
        className="zh-ec-btn"
        aria-label={more ? `${more} pieces of the same file` : `${piece.name}, ${piece.size}`}
        tabIndex={isGh ? 0 : -1}
        onClick={(e) => (more ? undefined : onOpen(piece, e.currentTarget))}
      >
        <span className="zh-ec-in">
          <span className="zh-face zh-face-gh">
            <span className="zh-ec-prev">
              <BinTile name={piece.name} more={more} />
            </span>
            <span className="zh-ec-name zh-ec-mono">{more ? "same file" : piece.name}</span>
            <span className="zh-ec-size">{piece.size}</span>
          </span>
        </span>
      </button>
    </div>
  );
}

/** List-layout row, matching the explorer's Name / Type / Size / Saved / Modified columns. */
export function DriveRow({
  item,
  kind,
  selected,
  selectMode,
  onOpen,
}: {
  item: CardItem;
  kind: "folder" | "file";
  selected?: boolean;
  selectMode?: boolean;
  onOpen: OpenFn;
}) {
  if (kind === "folder") {
    const fo = item as DriveFolder;
    const G = fo.glyph ? PH[fo.glyph] : null;
    return (
      <button
        type="button"
        className="zh-row"
        data-id={fo.id}
        data-kind="folder"
        aria-label={`${fo.name}, folder${fo.locked ? ", password protected" : ""}`}
        onClick={(e) => onOpen(fo, "folder", e.currentTarget, e)}
      >
        <span className="zh-row-ic zh-row-fold" aria-hidden="true">
          {G ? (
            <G weight="fill" className="h-[18px] w-[18px]" />
          ) : (
            <FolderIcon className="h-[18px] w-[18px]" />
          )}
          {fo.locked ? (
            <span className="zh-row-badge">
              <Lock className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </span>
        <span className="zh-row-n">{fo.name}</span>
        <span className="zh-row-t">Folder</span>
        <span className="zh-row-s">-</span>
        <span className="zh-row-v">-</span>
        <span className="zh-row-m">Sep 02</span>
        <span className="zh-row-c" aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    );
  }
  const fi = item as DriveFile | DroppedFile;
  const t = typeOf(fi.name);
  const Icon = fileIconFor(fi.name);
  const url = isDropped(fi) ? fi.url : null;
  return (
    <button
      type="button"
      className="zh-row"
      data-id={fi.id}
      data-kind="file"
      data-sel={selected || undefined}
      data-new={isDropped(fi) && fi.fresh ? "" : undefined}
      aria-label={`${fi.name}, ${formatBytes(fi.size)}`}
      aria-pressed={selectMode ? !!selected : undefined}
      onClick={(e) => onOpen(fi, "file", e.currentTarget, e)}
    >
      <span className={cn("zh-row-ic", t.bg, t.color)} aria-hidden="true">
        {url ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img src={url} alt="" className="zh-row-img" />
        ) : (
          <Icon className="h-[18px] w-[18px]" />
        )}
      </span>
      <span className="zh-row-n">{fi.name}</span>
      <span className="zh-row-t">{t.label}</span>
      <span className="zh-row-s">{formatBytes(fi.size)}</span>
      <span className={cn("zh-row-v", fi.saved > 0 && "zh-row-pos")}>{fi.saved}%</span>
      <span className="zh-row-m">{fi.mod}</span>
      <span className="zh-row-c" />
    </button>
  );
}
