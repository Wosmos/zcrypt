import { useId } from "react";
import {
  DownloadSimple,
  FileText as FileTextFill,
  ImageSquare,
  MusicNotes,
} from "@phosphor-icons/react";
import { PadlockGlyph } from "@/components/files/explorer/explorer-card";
import { Play } from "@/lib/icons";
import { cn, fileIconFor } from "@/lib/utils";
import { typeOf, type ArtKey, type FolderGlyph } from "./drive-data";
import { PreviewArt } from "./preview-art";

const GLYPHS = {
  image: ImageSquare,
  doc: FileTextFill,
  music: MusicNotes,
  download: DownloadSimple,
} as const;

const BACK =
  "M10 42V30a12 12 0 0 1 12-12h22a6 6 0 0 1 4.24 1.76L54 23.5a6 6 0 0 0 4.24 1.76H98a12 12 0 0 1 12 12V44Z";
const POCKET =
  "M10 40a12 12 0 0 1 12-12h76a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H22a12 12 0 0 1-12-12Z";

/** A layered folder: back panel, a sheet of paper peeking out, and a lit front pocket. */
export function Folder3D({ glyph, locked }: { glyph?: FolderGlyph; locked?: boolean }) {
  const id = useId().replace(/:/g, "");
  const Glyph = glyph ? GLYPHS[glyph] : null;
  return (
    <span className="zh-f3d" aria-hidden="true">
      <svg viewBox="0 0 120 100" className="zh-f3d-svg" focusable="false">
        <defs>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="zh-f3d-b0" />
            <stop offset="1" className="zh-f3d-b1" />
          </linearGradient>
          <linearGradient id={`${id}-p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="zh-f3d-p0" />
            <stop offset="0.55" className="zh-f3d-p1" />
            <stop offset="1" className="zh-f3d-p2" />
          </linearGradient>
          <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-c`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.2" />
          </linearGradient>
          <clipPath id={`${id}-lip`}>
            <rect x="0" y="27" width="120" height="5" />
          </clipPath>
          <clipPath id={`${id}-foot`}>
            <rect x="0" y="85" width="120" height="6" />
          </clipPath>
        </defs>
        <path d={BACK} fill={`url(#${id}-b)`} />
        <path
          d="M14 24a10 10 0 0 1 8-4.6h22a5 5 0 0 1 3.5 1.4"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <g className="zh-f3d-paper">
          <g transform="rotate(3 64 45)">
            <rect x="22" y="25" width="80" height="36" rx="6" className="zh-f3d-sheet2" />
          </g>
          <g transform="rotate(-2 60 43)">
            <rect x="18" y="21" width="84" height="40" rx="6" className="zh-f3d-sheet" />
            <path d="M28 29h40M28 34h52" className="zh-f3d-lines" />
          </g>
        </g>
        <rect x="12" y="22" width="96" height="6" fill={`url(#${id}-c)`} />
        <g className="zh-f3d-pocket">
          <path d={POCKET} fill={`url(#${id}-p)`} />
          <path
            d={POCKET}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="1.25"
            clipPath={`url(#${id}-lip)`}
          />
          <path
            d={POCKET}
            fill="none"
            stroke="#000"
            strokeOpacity="0.14"
            strokeWidth="1"
            clipPath={`url(#${id}-foot)`}
          />
          <path d={POCKET} fill={`url(#${id}-s)`} className="zh-f3d-sheen" />
        </g>
      </svg>
      <span className="zh-f3d-mark">
        {locked ? (
          <PadlockGlyph className="zh-f3d-lock" />
        ) : Glyph ? (
          <>
            <Glyph weight="fill" className="zh-f3d-glyph zh-f3d-glyph-hi" />
            <Glyph weight="fill" className="zh-f3d-glyph" />
          </>
        ) : null}
      </span>
    </span>
  );
}

/** A paper document tile with a folded corner, tinted by file type. */
export function DocTile3D({ name }: { name: string }) {
  const t = typeOf(name);
  const Icon = fileIconFor(name);
  const stacked = t.ext === "pdf" || t.ext === "docx";
  return (
    <span className={cn("zh-doc", t.color)} data-stacked={stacked || undefined} aria-hidden="true">
      {stacked ? <span className="zh-doc-back" /> : null}
      <span className="zh-doc-page">
        <span className="zh-doc-fold" />
        <Icon className="zh-doc-ic" />
        {t.ext ? <span className="zh-doc-ext">{t.ext.slice(0, 4)}</span> : null}
      </span>
    </span>
  );
}

/** A photo or video thumbnail: sample art, or the visitor's own image by object URL. */
export function ThumbTile({
  art,
  src,
  video,
  seed,
}: {
  art?: ArtKey;
  src?: string | null;
  video?: boolean;
  seed?: number;
}) {
  return (
    <span className="zh-thumb" aria-hidden="true">
      <span className="zh-thumb-in">
        {src ? (
          // oxlint-disable-next-line nextjs/no-img-element
          <img src={src} alt="" decoding="async" className="zh-thumb-img" />
        ) : art ? (
          <PreviewArt art={art} seed={seed} className="zh-thumb-img" />
        ) : null}
        {video ? (
          <span className="zh-thumb-play">
            <Play className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The flat, hatched tile the platforms actually store. */
export function BinTile({ name, more }: { name: string; more?: string }) {
  return (
    <span className={cn("zh-bin", more && "zh-bin-more")} aria-hidden="true">
      {more ? (
        <span>{more}</span>
      ) : (
        <>
          <span className="zh-bin-dir">{name.slice(0, 2)}</span>
          <span className="zh-bin-x">.bin</span>
        </>
      )}
    </span>
  );
}
