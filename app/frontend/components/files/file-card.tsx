"use client";

import { useState } from "react";
import { FileMetadata } from "@/types";
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
  Download,
  Trash2,
  CheckCircle2,
  Eye,
  Copy,
  Check,
  Layers,
  Lock,
  CheckSquare,
  Square,
  MoreHorizontal,
  Share2,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { formatBytes, formatDate, getFileTypeInfo, isImageFile } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnail";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export type DownloadState = "idle" | "downloading" | "done";

interface FileCardProps {
  file: FileMetadata;
  downloadState?: DownloadState;
  onDownload: (filename: string) => void;
  onDelete: (id: string) => void;
  onPreview?: (filename: string) => void;
  onShare?: (id: string) => void;
  onOpen?: (file: FileMetadata) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

export function FileCard({ file, downloadState = "idle", onDownload, onDelete, onPreview, onShare, onOpen, selectable, selected, onSelect }: FileCardProps) {
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Thumbnail from persistent cache (IndexedDB) — no passphrase needed here
  const { thumbnailUrl, loading: thumbLoading } = useThumbnail(file.id, file.original_name);

  const wasCompressed = file.compressed_size < file.original_size;
  const ratio =
    file.original_size > 0 && wasCompressed
      ? ((1 - file.compressed_size / file.original_size) * 100).toFixed(0)
      : "0";

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const isDownloading = downloadState === "downloading";
  const isDone = downloadState === "done";
  const isImage = isImageFile(file.original_name);

  const copyHash = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(file.sha256);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCardClick = () => {
    if (selectable && onSelect) {
      onSelect(file.id);
    } else if (!selectable && onOpen) {
      onOpen(file);
    }
  };

  // ==========================================
  // MOBILE: Compact native-style row card
  // ==========================================
  const mobileCard = (
    <div
      onClick={handleCardClick}
      className={cn(
        "flex md:hidden items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 active:scale-[0.98]",
        (selectable || onOpen) && "cursor-pointer",
        isDownloading
          ? "border-cyan-500/30 bg-cyan-500/5"
          : isDone
            ? "border-cyan-500/30 bg-cyan-500/5"
            : selected
              ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
      )}
    >
      {/* Selection checkbox */}
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.(file.id); }}
          className="flex-shrink-0 -ml-0.5"
        >
          {selected ? (
            <CheckSquare className="h-5 w-5 text-[var(--color-accent)]" />
          ) : (
            <Square className="h-5 w-5 text-[var(--color-text-muted)]" />
          )}
        </button>
      )}

      {/* Thumbnail / Icon */}
      <div className="flex-shrink-0">
        {thumbnailUrl ? (
          <div className="h-10 w-10 rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg relative",
            isDownloading ? "bg-cyan-500/15" : isDone ? "bg-cyan-500/15" : typeInfo.bg
          )}>
            {isDownloading ? (
              <LogoSpinner size={20} speed="fast" />
            ) : isDone ? (
              <CheckCircle2 className="h-5 w-5 text-cyan-500" />
            ) : (
              <Icon className={`h-5 w-5 ${typeInfo.color}`} />
            )}
            {/* Locked indicator for images without thumbnail */}
            {isImage && !thumbnailUrl && !isDownloading && !isDone && (
              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center">
                <Lock className="h-2 w-2 text-[var(--color-text-muted)]" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate leading-tight">{file.original_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{formatBytes(file.original_size)}</span>
          {isDownloading ? (
            <span className="text-xs text-cyan-400 font-medium">Downloading...</span>
          ) : isDone ? (
            <span className="text-xs text-cyan-500 font-medium">Done</span>
          ) : (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
              <span className="text-xs text-[var(--color-text-muted)]">{formatDate(file.created_at)}</span>
            </>
          )}
        </div>
        {isDownloading && (
          <div className="mt-1.5 h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div className="h-full rounded-full" style={{
              background: "linear-gradient(90deg, #00d5e4, #2de0ed, #00d5e4)",
              backgroundSize: "200% 100%",
              animation: "progress-shimmer 1.8s ease-in-out infinite",
              width: "100%",
            }} />
          </div>
        )}
      </div>

      {/* Actions */}
      {!isDownloading && !selectable && (
        <div className="flex items-center gap-0.5 flex-shrink-0 relative">
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(file.original_name); }}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--color-text-muted)] active:bg-[var(--color-surface-1)] transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(!mobileMenuOpen); }}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-[var(--color-text-muted)] active:bg-[var(--color-surface-1)] transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {mobileMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); }} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl py-1 animate-fade-in">
                {onPreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); onPreview(file.original_name); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] active:bg-[var(--color-surface-1)]"
                  >
                    <Eye className="h-4 w-4" /> Preview
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); onDownload(file.original_name); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] active:bg-[var(--color-surface-1)]"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
                {onShare && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); onShare(file.id); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text-secondary)] active:bg-[var(--color-surface-1)]"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); onDelete(file.id); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 active:bg-red-500/5"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  // ==========================================
  // DESKTOP: Rich grid card with thumbnails
  // ==========================================
  const desktopCard = (
    <div
      onClick={handleCardClick}
      className={cn(
        "group relative overflow-hidden flex-col hidden md:flex",
        "rounded-2xl border transition-all duration-200",
        (selectable || onOpen) && "cursor-pointer",
        isDownloading
          ? "border-cyan-500/30 bg-cyan-500/5"
          : isDone
            ? "border-cyan-500/30 bg-cyan-500/5"
            : selected
              ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]/20"
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg hover:-translate-y-0.5"
      )}
    >
      {/* Selection checkbox */}
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.(file.id); }}
          className="absolute top-2.5 left-2.5 z-10 flex items-center justify-center h-6 w-6 rounded-md bg-[var(--color-surface)]/90 border border-[var(--color-border)] backdrop-blur-sm transition-colors hover:border-[var(--color-accent)]/40"
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
          ) : (
            <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
          )}
        </button>
      )}

      {/* Visual header area */}
      <div className={cn(
        "relative flex items-center justify-center h-[130px] overflow-hidden",
        !thumbnailUrl && `bg-gradient-to-b ${typeInfo.gradient}`
      )}>
        {/* Image thumbnail */}
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : thumbLoading && isImage ? (
          <div className="absolute inset-0 bg-[var(--color-surface-1)] flex items-center justify-center">
            <LogoSpinner size={20} speed="fast" />
          </div>
        ) : null}

        {isDownloading && (
          <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{
            background: "linear-gradient(90deg, transparent 25%, rgba(0,213,228,0.4) 50%, transparent 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s ease-in-out infinite",
          }} />
        )}

        {/* Icon (only when no thumbnail) */}
        {!thumbnailUrl && !(thumbLoading && isImage) && (
          <div className={cn(
            "flex items-center justify-center h-14 w-14 rounded-2xl transition-all duration-300",
            isDownloading ? "bg-cyan-500/15" : isDone ? "bg-cyan-500/15" : "bg-[var(--color-surface)]/80 backdrop-blur-sm shadow-sm"
          )}>
            {isDownloading ? (
              <LogoSpinner size={28} speed="fast" />
            ) : isDone ? (
              <CheckCircle2 className="h-7 w-7 text-cyan-500 animate-fade-in" />
            ) : (
              <Icon className={`h-7 w-7 ${typeInfo.color}`} />
            )}
            {/* Locked badge for images without thumbnail */}
            {isImage && !isDownloading && !isDone && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--color-surface)]/80 backdrop-blur-sm border border-[var(--color-border)]/50">
                <Lock className="h-2.5 w-2.5 text-[var(--color-text-muted)]" />
                <span className="text-[10px] text-[var(--color-text-muted)]">Encrypted</span>
              </div>
            )}
          </div>
        )}

        {/* Type badge */}
        {!isDownloading && !isDone && (
          <span className={cn(
            "absolute top-2.5 right-2.5 text-[10px] font-medium px-2 py-0.5 rounded-md border border-[var(--color-border)]/50",
            thumbnailUrl
              ? "bg-black/50 text-white/90 border-white/10 backdrop-blur-sm"
              : "bg-[var(--color-surface)]/80 text-[var(--color-text-secondary)] backdrop-blur-sm"
          )}>
            {typeInfo.label}
          </span>
        )}

        {/* Hover action overlay - desktop */}
        {!isDownloading && !selectable && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            thumbnailUrl ? "bg-black/40 backdrop-blur-sm" : "bg-[var(--color-surface)]/80 backdrop-blur-sm"
          )}>
            {onPreview && (
              <IconButton icon={Eye} label="Preview" onClick={(e) => { e.stopPropagation(); onPreview(file.original_name); }} className="h-10 w-10 rounded-xl bg-[var(--color-surface)]/90 hover:bg-[var(--color-surface)] shadow-sm" />
            )}
            <IconButton icon={Download} label="Download" onClick={(e) => { e.stopPropagation(); onDownload(file.original_name); }} className="h-10 w-10 rounded-xl bg-[var(--color-surface)]/90 hover:bg-[var(--color-surface)] shadow-sm" />
            {onShare && (
              <IconButton icon={Share2} label="Share" onClick={(e) => { e.stopPropagation(); onShare(file.id); }} className="h-10 w-10 rounded-xl bg-[var(--color-surface)]/90 hover:bg-[var(--color-surface)] shadow-sm" />
            )}
            <IconButton icon={Trash2} label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} className="h-10 w-10 rounded-xl bg-[var(--color-surface)]/90 hover:bg-[var(--color-surface)] shadow-sm [&_svg]:text-red-400/60 hover:[&_svg]:text-red-400" />
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-3.5 flex-1 min-w-0 space-y-2">
        <div>
          <p className="text-sm font-medium truncate" title={file.original_name}>{file.original_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[var(--color-text-secondary)] tabular-nums">
              {formatBytes(file.original_size)}
            </span>
            {isDownloading ? (
              <span className="text-xs text-cyan-400 font-medium animate-pulse-soft">Downloading...</span>
            ) : isDone ? (
              <span className="text-xs text-cyan-500 font-medium animate-fade-in">Done</span>
            ) : (
              <>
                <span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
                <span className={`text-xs font-medium ${wasCompressed ? "text-cyan-500" : "text-[var(--color-text-muted)]"}`}>
                  {wasCompressed ? `${ratio}% saved` : "No compression"}
                </span>
              </>
            )}
          </div>
        </div>

        {!isDownloading && !isDone && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-0.5">
                <Layers className="h-3 w-3" />
                {file.chunk_count}
              </span>
              <span className="flex items-center gap-0.5">
                <Lock className="h-3 w-3" />
                {formatBytes(file.encrypted_size)}
              </span>
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {formatDate(file.created_at)}
            </span>
          </div>
        )}

        {!isDownloading && !isDone && file.sha256 && (
          <div className="flex items-center gap-1.5">
            <code className="text-[10px] font-mono text-[var(--color-text-muted)] truncate flex-1">
              SHA: {file.sha256.slice(0, 12)}...
            </code>
            <button
              onClick={copyHash}
              className="flex-shrink-0 rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
              title={copied ? "Copied" : "Copy SHA-256"}
              aria-label={copied ? "SHA-256 copied" : "Copy SHA-256"}
            >
              {copied ? <Check className="h-3 w-3 text-cyan-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}

        {isDownloading && (
          <div className="h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div className="h-full rounded-full" style={{
              background: "linear-gradient(90deg, #00d5e4, #2de0ed, #00d5e4)",
              backgroundSize: "200% 100%",
              animation: "progress-shimmer 1.8s ease-in-out infinite",
              width: "100%",
            }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {mobileCard}
      {desktopCard}
    </>
  );
}
