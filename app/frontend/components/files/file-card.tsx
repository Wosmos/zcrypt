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
  Loader2,
  CheckCircle2,
  Eye,
  ChevronDown,
  Copy,
  Check,
  Lock,
  Minimize2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type DownloadState = "idle" | "downloading" | "done";

interface FileCardProps {
  file: FileMetadata;
  variant?: "grid" | "list";
  downloadState?: DownloadState;
  onDownload: (filename: string) => void;
  onDelete: (id: string) => void;
  onPreview?: (filename: string) => void;
}

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

export function FileCard({ file, variant = "list", downloadState = "idle", onDownload, onDelete, onPreview }: FileCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const ratio =
    file.original_size > 0
      ? ((1 - file.encrypted_size / file.original_size) * 100).toFixed(0)
      : "0";

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const isDownloading = downloadState === "downloading";
  const isDone = downloadState === "done";

  const copyHash = () => {
    navigator.clipboard.writeText(file.sha256);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Grid variant ---
  if (variant === "grid") {
    return (
      <div
        className={cn(
          "group relative overflow-hidden flex flex-col",
          "rounded-2xl border transition-all duration-300",
          isDownloading
            ? "border-emerald-500/30 bg-emerald-500/5"
            : isDone
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg"
        )}
      >
        {/* Icon header area */}
        <div className="relative flex items-center justify-center py-6 bg-[var(--color-surface-1)]/50">
          {isDownloading && (
            <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{
              background: "linear-gradient(90deg, transparent 25%, rgba(16,185,129,0.4) 50%, transparent 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s ease-in-out infinite",
            }} />
          )}
          <div
            className={cn(
              "flex items-center justify-center h-12 w-12 rounded-xl transition-all duration-300",
              isDownloading ? "bg-emerald-500/15" : isDone ? "bg-emerald-500/15" : typeInfo.bg
            )}
          >
            {isDownloading ? (
              <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
            ) : isDone ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500 animate-fade-in" />
            ) : (
              <Icon className={`h-6 w-6 ${typeInfo.color}`} />
            )}
          </div>

          {/* Hover action overlay */}
          {!isDownloading && (
            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[var(--color-surface)]/80 backdrop-blur-sm">
              {onPreview && (
                <Button variant="ghost" size="icon" onClick={() => onPreview(file.original_name)} title="Preview" className="h-9 w-9">
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => onDownload(file.original_name)} title="Download" className="h-9 w-9">
                <Download className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(file.id)} title="Delete" className="h-9 w-9">
                <Trash2 className="h-4 w-4 text-red-400/60 hover:text-red-400" />
              </Button>
            </div>
          )}
        </div>

        {/* File info */}
        <div className="p-3.5 flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.original_name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
              {formatBytes(file.original_size)}
            </span>
            {isDownloading ? (
              <span className="text-[11px] text-emerald-400 font-medium animate-pulse-soft">Downloading...</span>
            ) : isDone ? (
              <span className="text-[11px] text-emerald-500 font-medium animate-fade-in">Done</span>
            ) : (
              <span className="text-[11px] text-emerald-500 font-medium">{ratio}% saved</span>
            )}
          </div>
          {!isDownloading && !isDone && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{formatDate(file.created_at)}</p>
          )}
          {isDownloading && (
            <div className="mt-2 h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{
                background: "linear-gradient(90deg, #10b981, #34d399, #10b981)",
                backgroundSize: "200% 100%",
                animation: "progress-shimmer 1.8s ease-in-out infinite",
                width: "100%",
              }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- List variant (horizontal rows) ---
  return (
    <div
      className={cn(
        "group relative overflow-hidden",
        "rounded-2xl border transition-all duration-300",
        isDownloading
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isDone
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg"
      )}
    >
      <div className="flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4">
        {/* Animated shimmer overlay during download */}
        {isDownloading && (
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                background: "linear-gradient(90deg, transparent 25%, rgba(16,185,129,0.4) 50%, transparent 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s ease-in-out infinite",
              }}
            />
          </div>
        )}

        {/* Success flash overlay */}
        {isDone && (
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: "radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 70%)",
              animation: "fade-in 0.3s ease-out",
            }}
          />
        )}

        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl transition-all duration-300",
            isDownloading
              ? "bg-emerald-500/15"
              : isDone
                ? "bg-emerald-500/15"
                : typeInfo.bg
          )}
        >
          {isDownloading ? (
            <Loader2 className="h-[18px] w-[18px] text-emerald-500 animate-spin" />
          ) : isDone ? (
            <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500 animate-fade-in" />
          ) : (
            <Icon className={`h-[18px] w-[18px] ${typeInfo.color}`} />
          )}
        </div>

        <div className="flex-1 min-w-0 relative z-10">
          <p className="text-sm font-medium truncate">
            {file.original_name}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
              {formatBytes(file.original_size)}
            </span>
            {isDownloading ? (
              <span className="text-[11px] text-emerald-400 font-medium animate-pulse-soft">
                Decrypting & downloading...
              </span>
            ) : isDone ? (
              <span className="text-[11px] text-emerald-500 font-medium animate-fade-in">
                Download complete
              </span>
            ) : (
              <>
                <span className="text-[11px] text-emerald-500 font-medium">
                  {ratio}% saved
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {file.chunk_count} chunk{file.chunk_count !== 1 ? "s" : ""}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
                  {formatDate(file.created_at)}
                </span>
              </>
            )}
          </div>

          {/* Progress bar during download */}
          {isDownloading && (
            <div className="mt-2 h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, #10b981, #34d399, #10b981)",
                  backgroundSize: "200% 100%",
                  animation: "progress-shimmer 1.8s ease-in-out infinite",
                  width: "100%",
                }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0 relative z-10">
          {!isDownloading && (
            <>
              {/* Expand toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setExpanded(!expanded)}
                title={expanded ? "Less info" : "More info"}
                className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
              </Button>
              {onPreview && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onPreview(file.original_name)}
                  title="Preview"
                  className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDownload(file.original_name)}
                title="Download"
                className={cn(
                  "sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150",
                  isDone && "sm:opacity-100"
                )}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(file.id)}
                title="Delete"
                className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
              >
                <Trash2 className="h-4 w-4 text-red-400/60 hover:text-red-400" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Expandable details panel */}
      {expanded && !isDownloading && (
        <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface-1)]/50 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                <Minimize2 className="h-3 w-3" /> Compressed
              </span>
              <span className="font-medium tabular-nums">{formatBytes(file.compressed_size)}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                <Lock className="h-3 w-3" /> Encrypted
              </span>
              <span className="font-medium tabular-nums">{formatBytes(file.encrypted_size)}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] flex items-center gap-1">
                <Layers className="h-3 w-3" /> Chunks
              </span>
              <span className="font-medium tabular-nums">{file.chunk_count}</span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]">Uploaded</span>
              <span className="font-medium">{formatDate(file.created_at)}</span>
            </div>
          </div>

          {/* SHA-256 */}
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">SHA-256</span>
            <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate flex-1">
              {file.sha256}
            </code>
            <button
              onClick={copyHash}
              className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1 rounded-md hover:bg-[var(--color-surface-2)]"
              title="Copy SHA-256"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
