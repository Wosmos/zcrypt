"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  Maximize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCw,
  Volume2,
  ZoomIn,
  ZoomOut,
} from "@/lib/icons";
import { FileTypeIcon } from "@/components/marketing/landing/file-type-icon";
import { cn, formatBytes } from "@/lib/utils";
import { seededHex, typeOf, type ArtKey } from "./drive-data";
import { useDriveText } from "./drive-i18n";
import { PreviewArt } from "./preview-art";

export type PreviewFile = {
  id: string;
  name: string;
  size: number;
  art?: ArtKey;
  seed?: number;
  pages?: number;
  duration?: string;
  url?: string | null;
  dropped?: boolean;
  sizeLabel?: string;
};

type Toast = (msg: string) => void;

function Tool({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="zh-pv-tool"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ImageBody({ file }: { file: PreviewFile }) {
  const { t } = useDriveText();
  const [zoom, setZoom] = useState(100);
  const [rot, setRot] = useState(0);
  return (
    <div className="zh-pv-img">
      <div className="zh-pv-img-stage">
        <div
          className="zh-pv-img-box"
          style={{ transform: `scale(${zoom / 100}) rotate(${rot}deg)` }}
          data-own={file.url ? "" : undefined}
        >
          {file.url ? (
            // oxlint-disable-next-line nextjs/no-img-element
            <img src={file.url} alt={file.name} className="zh-pv-img-el" />
          ) : file.art ? (
            <PreviewArt art={file.art} seed={file.seed} className="zh-pv-img-el" />
          ) : null}
        </div>
      </div>
      <div className="zh-pv-pill">
        <Tool
          label={t("drive.body.zoomOut")}
          onClick={() => setZoom((z) => Math.max(50, z - 25))}
          disabled={zoom <= 50}
        >
          <ZoomOut className="h-4 w-4" />
        </Tool>
        <span className="zh-pv-pct" aria-live="polite">
          {zoom}%
        </span>
        <Tool
          label={t("drive.body.zoomIn")}
          onClick={() => setZoom((z) => Math.min(300, z + 25))}
          disabled={zoom >= 300}
        >
          <ZoomIn className="h-4 w-4" />
        </Tool>
        <span className="zh-pv-div" aria-hidden="true" />
        <Tool label={t("drive.body.rotate")} onClick={() => setRot((r) => r + 90)}>
          <RotateCw className="h-4 w-4" />
        </Tool>
        <Tool
          label={t("drive.body.fit")}
          onClick={() => {
            setZoom(100);
            setRot(0);
          }}
        >
          <Maximize className="h-4 w-4" />
        </Tool>
      </div>
    </div>
  );
}

const LINE_W = [92, 86, 95, 70, 88, 94, 60, 90, 84, 96, 78, 89, 72, 55];

function PageSkeleton({ first, passport }: { first: boolean; passport?: boolean }) {
  if (passport && first) {
    return (
      <div className="zh-pv-page zh-pv-page-id">
        <span className="zh-pv-photo" />
        {[70, 56, 64, 48, 60, 40].map((w, i) => (
          <span key={i} className="zh-pv-field" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  return (
    <div className="zh-pv-page">
      <span className="zh-pv-h" />
      {LINE_W.map((w, i) => (
        <span key={i} className="zh-pv-ln" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function PdfBody({ file, toast }: { file: PreviewFile; toast: Toast }) {
  const { t } = useDriveText();
  const DL = t("drive.preview.dl");
  const n = file.pages ?? 2;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const col = useRef<HTMLDivElement>(null);
  const passport = file.name === "passport-scan.pdf";

  const onScroll = () => {
    const el = col.current;
    if (!el) return;
    const pages = el.querySelectorAll<HTMLElement>(".zh-pv-page");
    const mid = el.scrollTop + el.clientHeight / 3;
    let cur = 1;
    pages.forEach((p, i) => {
      if (p.offsetTop <= mid) cur = i + 1;
    });
    setPage(cur);
  };

  return (
    <div className="zh-pv-pdf">
      <div className="zh-pv-bar">
        <span className="zh-pv-count">
          {page} / {n}
        </span>
        <span className="zh-pv-bar-g">
          <Tool
            label={t("drive.body.zoomOut")}
            onClick={() => setZoom((z) => Math.max(50, z - 25))}
            disabled={zoom <= 50}
          >
            <Minus className="h-4 w-4" />
          </Tool>
          <span className="zh-pv-pct">{zoom}%</span>
          <Tool
            label={t("drive.body.zoomIn")}
            onClick={() => setZoom((z) => Math.min(200, z + 25))}
            disabled={zoom >= 200}
          >
            <Plus className="h-4 w-4" />
          </Tool>
        </span>
        <span className="zh-pv-bar-g">
          <Tool label={t("drive.body.openTab")} onClick={() => toast(DL)}>
            <ExternalLink className="h-4 w-4" />
          </Tool>
          <Tool label={t("drive.preview.download")} onClick={() => toast(DL)}>
            <Download className="h-4 w-4" />
          </Tool>
        </span>
      </div>
      <div ref={col} className="zh-pv-col" onScroll={onScroll}>
        <div className="zh-pv-pages" style={{ width: `${Math.min(100, 72 * (zoom / 100))}%` }}>
          {Array.from({ length: n }, (_, i) => (
            <PageSkeleton key={i} first={i === 0} passport={passport} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DocBody() {
  const { t } = useDriveText();
  return (
    <div className="zh-pv-col zh-pv-doc">
      <div className="zh-pv-pages">
        <div className="zh-pv-page">
          <span className="zh-pv-title">{t("drive.body.thesis")}</span>
          <span className="zh-pv-sub" />
          {LINE_W.slice(0, 6).map((w, i) => (
            <span key={i} className="zh-pv-ln" style={{ width: `${w}%` }} />
          ))}
          <span className="zh-pv-gap" />
          {LINE_W.slice(6).map((w, i) => (
            <span key={i} className="zh-pv-ln" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function secs(d?: string) {
  if (!d) return 0;
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
}
function clock(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useFakePlay() {
  const [playing, setPlaying] = useState(false);
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      pRef.current = Math.min(1, pRef.current + (t - last) / 12000);
      last = t;
      setP(pRef.current);
      if (pRef.current >= 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const toggle = () => {
    if (pRef.current >= 1) {
      pRef.current = 0;
      setP(0);
    }
    setPlaying((v) => !v);
  };
  return { playing, p, toggle };
}

export function VideoBody({ file }: { file: PreviewFile }) {
  const { t } = useDriveText();
  const { playing, p, toggle } = useFakePlay();
  const total = secs(file.duration);
  return (
    <div className="zh-pv-vid">
      <div className="zh-pv-vid-box">
        {file.art ? <PreviewArt art={file.art} wide className="zh-pv-vid-art" /> : null}
        {!playing ? (
          <button
            type="button"
            className="zh-pv-bigplay"
            aria-label={t("drive.body.play")}
            onClick={toggle}
          >
            <Play className="h-7 w-7" />
          </button>
        ) : null}
        <div className="zh-pv-ctrl">
          <button
            type="button"
            className="zh-pv-tool zh-pv-tool-l"
            aria-label={playing ? t("drive.body.pause") : t("drive.body.play")}
            onClick={toggle}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="zh-pv-time">
            {clock(p * total)} / {file.duration}
          </span>
          <span className="zh-pv-scrub" aria-hidden="true">
            <i style={{ transform: `scaleX(${p})` }} />
          </span>
          <span className="zh-pv-tool zh-pv-tool-l" aria-hidden="true">
            <Volume2 className="h-4 w-4" />
          </span>
          <span className="zh-pv-tool zh-pv-tool-l" aria-hidden="true">
            <Maximize className="h-4 w-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function AudioBody({ file }: { file: PreviewFile }) {
  const { t } = useDriveText();
  const { playing, p, toggle } = useFakePlay();
  const total = secs(file.duration);
  const bars = Array.from({ length: 40 }, (_, i) => {
    const v = Number.parseInt(seededHex(i * 131 + file.name.length, 2), 16) / 255;
    return 0.22 + 0.78 * Math.abs(Math.sin(i * 0.55)) * (0.55 + 0.45 * v);
  });
  const tp = typeOf(file.name);
  return (
    <div className="zh-pv-aud">
      <span className={cn("zh-pv-aud-ic", tp.bg, tp.color)}>
        <FileTypeIcon name={file.name} className="h-8 w-8" />
      </span>
      <p className="zh-pv-fname">{file.name}</p>
      <div className="zh-pv-wave" aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} data-on={i / 40 < p || undefined} style={{ transform: `scaleY(${h})` }} />
        ))}
      </div>
      <div className="zh-pv-aud-row">
        <button
          type="button"
          className="zh-pv-play"
          aria-label={playing ? t("drive.body.pause") : t("drive.body.play")}
          onClick={toggle}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <span className="zh-pv-time zh-pv-time-d">
          {clock(p * total)} / {file.duration}
        </span>
      </div>
    </div>
  );
}

const NOTES = ["0", "1", "2", "3"];

export function TextBody() {
  const { t } = useDriveText();
  return (
    <div className="zh-pv-text">
      <pre className="zh-pv-pre">
        {NOTES.map((l, i) => (
          <span key={i} className="zh-pv-tl">
            <span className="zh-pv-ln-n" aria-hidden="true">
              {i + 1}
            </span>
            {t(`drive.body.notes.${l}`)}
          </span>
        ))}
      </pre>
    </div>
  );
}

export function FallbackBody({
  file,
  toast,
  line,
}: {
  file: PreviewFile;
  toast: Toast;
  line?: string;
}) {
  const { t, type } = useDriveText();
  const DL = t("drive.preview.dl");
  const tp = typeOf(file.name);
  return (
    <div className="zh-pv-fb">
      <span className={cn("zh-pv-fb-ic corner-squircle", tp.bg, tp.color)}>
        <FileTypeIcon name={file.name} className="h-9 w-9" />
      </span>
      <div className="zh-pv-fb-t">
        <p className="zh-pv-fname">{file.name}</p>
        <p className="zh-pv-fmeta">
          {type(tp.label)} · {formatBytes(file.size)}
        </p>
        <p className="zh-pv-fline">{line ?? t("drive.body.noPreview")}</p>
      </div>
      <button type="button" className="zh-pv-dl" onClick={() => toast(DL)}>
        <Download className="h-4 w-4" />
        {t("drive.preview.download")}
      </button>
    </div>
  );
}

export function HexBody({ file }: { file: PreviewFile }) {
  const { t } = useDriveText();
  const seed = Number.parseInt(file.name.replace(/[^0-9a-f]/g, "").slice(0, 8) || "1", 16);
  const rows = Array.from({ length: 24 }, (_, r) => {
    const hex = seededHex(seed + r * 977, 32);
    const bytes = hex.match(/../g) ?? [];
    return { off: (r * 16).toString(16).padStart(8, "0"), bytes };
  });
  return (
    <div className="zh-pv-hex">
      <div className="zh-pv-hex-h">
        <span className="zh-pv-hex-n">{file.name}</span>
        <span>{file.sizeLabel ?? "10.0 MB"}</span>
        <span>{t("drive.body.hexBinary")}</span>
      </div>
      <pre className="zh-pv-hex-pre" aria-label={t("drive.body.hexAria")}>
        {rows.map((r) => (
          <span key={r.off} className="zh-pv-hex-r">
            <span className="zh-pv-hex-o">{r.off}</span>
            <span>{r.bytes.slice(0, 8).join(" ")}</span>
            <span>{r.bytes.slice(8).join(" ")}</span>
            <span className="zh-pv-hex-a">{".".repeat(16)}</span>
          </span>
        ))}
      </pre>
      <p className="zh-pv-hex-cap">{t("drive.body.hexCaption")}</p>
    </div>
  );
}
