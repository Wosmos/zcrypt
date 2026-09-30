import { useId, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Play } from "@/lib/icons";
import { cn } from "@/lib/utils";
import "./tiles.css";

type GlyphProps = { weight?: "fill"; className?: string; "aria-hidden"?: boolean };

const BACK =
  "M10 42V30a12 12 0 0 1 12-12h22a6 6 0 0 1 4.24 1.76L54 23.5a6 6 0 0 0 4.24 1.76H98a12 12 0 0 1 12 12V44Z";
const POCKET =
  "M10 40a12 12 0 0 1 12-12h76a12 12 0 0 1 12 12v38a12 12 0 0 1-12 12H22a12 12 0 0 1-12-12Z";

/** A clean, filled padlock: shackle + rounded body with a punched keyhole. */
function PadlockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 10V8a4 4 0 0 1 8 0v2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="4.5" y="10" width="15" height="11" rx="3" fill="currentColor" />
      <circle cx="12" cy="14.8" r="1.5" fill="var(--color-surface)" />
      <rect x="11.25" y="14.8" width="1.5" height="3.4" rx="0.75" fill="var(--color-surface)" />
    </svg>
  );
}

/**
 * A layered folder: back panel, sheets of paper peeking out, and a lit front
 * pocket. Tinted by `color` (defaults to the accent); a design `background`
 * is painted onto the pocket shape itself.
 */
export function FolderTile({
  Glyph,
  initial,
  locked,
  color,
  background,
  className,
}: {
  Glyph?: ComponentType<GlyphProps> | null;
  initial?: string;
  locked?: boolean;
  color?: string;
  background?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const style = color ? ({ "--ft-tint": color } as CSSProperties) : undefined;
  return (
    <span
      className={cn("ft-fold", className)}
      style={style}
      data-bg={background ? "" : undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 100" className="ft-fold-svg" focusable="false">
        <defs>
          <linearGradient id={`${id}-b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ft-fold-b0" />
            <stop offset="1" className="ft-fold-b1" />
          </linearGradient>
          <linearGradient id={`${id}-p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="ft-fold-p0" />
            <stop offset="0.55" className="ft-fold-p1" />
            <stop offset="1" className="ft-fold-p2" />
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
        <path
          d={BACK}
          fill={background ? "#000" : `url(#${id}-b)`}
          fillOpacity={background ? 0.25 : 1}
        />
        <path
          d="M14 24a10 10 0 0 1 8-4.6h22a5 5 0 0 1 3.5 1.4"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <g className="ft-fold-paper">
          <g transform="rotate(3 64 45)">
            <rect x="22" y="25" width="80" height="36" rx="6" className="ft-fold-sheet2" />
          </g>
          <g transform="rotate(-2 60 43)">
            <rect x="18" y="21" width="84" height="40" rx="6" className="ft-fold-sheet" />
            <path d="M28 29h40M28 34h52" className="ft-fold-lines" />
          </g>
        </g>
        <rect x="12" y="22" width="96" height="6" fill={`url(#${id}-c)`} />
        <g className="ft-fold-pocket">
          {background ? (
            <foreignObject
              x="0"
              y="0"
              width="120"
              height="100"
              style={{ clipPath: `path('${POCKET}')` }}
            >
              <div style={{ width: "100%", height: "100%", background }} />
            </foreignObject>
          ) : (
            <path d={POCKET} fill={`url(#${id}-p)`} />
          )}
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
          <path d={POCKET} fill={`url(#${id}-s)`} className="ft-fold-sheen" />
        </g>
      </svg>
      <span className="ft-fold-mark">
        {locked ? (
          <PadlockGlyph className="ft-fold-lock" />
        ) : Glyph ? (
          <>
            <Glyph weight="fill" aria-hidden className="ft-fold-glyph ft-fold-glyph-hi" />
            <Glyph weight="fill" aria-hidden className="ft-fold-glyph" />
          </>
        ) : initial ? (
          <span className="ft-fold-initial">{initial}</span>
        ) : null}
      </span>
    </span>
  );
}

/** A paper document tile with a folded corner, tinted by file type. */
export function DocTile({
  Icon,
  ext,
  stacked,
  unavailable,
  colorClass,
  colorStyle,
  className,
}: {
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  ext?: string;
  stacked?: boolean;
  unavailable?: boolean;
  colorClass?: string;
  colorStyle?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={cn("ft-doc", colorClass, className)}
      style={colorStyle}
      data-stacked={stacked || undefined}
      aria-hidden="true"
    >
      {stacked ? <span className="ft-doc-back" /> : null}
      <span className="ft-doc-page">
        <span className="ft-doc-fold" />
        <Icon className="ft-doc-ic" />
        {ext ? <span className="ft-doc-ext">{ext.slice(0, 4)}</span> : null}
      </span>
      {unavailable ? (
        <span
          className="ft-doc-warn"
          title="Preview unavailable: the original file data could not be retrieved"
        >
          <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
        </span>
      ) : null}
    </span>
  );
}

/** A framed photo or video thumbnail. Children are the image. */
export function ThumbTile({
  video,
  className,
  children,
}: {
  video?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("ft-thumb", className)} aria-hidden="true">
      <span className="ft-thumb-in">
        {children}
        {video ? (
          <span className="ft-thumb-play">
            <Play className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </span>
    </span>
  );
}
