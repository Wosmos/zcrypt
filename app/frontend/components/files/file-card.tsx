"use client";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type DownloadState = "idle" | "downloading" | "done";

interface FileCardProps {
  file: FileMetadata;
  downloadState?: DownloadState;
  onDownload: (filename: string) => void;
  onDelete: (id: string) => void;
}

const iconMap: Record<string, typeof File> = {
  File,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Cog,
  Table,
};

export function FileCard({ file, downloadState = "idle", onDownload, onDelete }: FileCardProps) {
  const ratio =
    file.original_size > 0
      ? ((1 - file.compressed_size / file.original_size) * 100).toFixed(0)
      : "0";

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const isDownloading = downloadState === "downloading";
  const isDone = downloadState === "done";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 overflow-hidden",
        "rounded-2xl border transition-all duration-300",
        isDownloading
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isDone
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)] hover:shadow-lg"
      )}
    >
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
  );
}
