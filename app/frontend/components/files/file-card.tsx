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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";

interface FileCardProps {
  file: FileMetadata;
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

export function FileCard({ file, onDownload, onDelete }: FileCardProps) {
  const ratio =
    file.original_size > 0
      ? ((1 - file.compressed_size / file.original_size) * 100).toFixed(0)
      : "0";

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;

  return (
    <div className="group flex items-center gap-3 sm:gap-4 card-hover p-3.5 sm:p-4">
      <div className={`flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl ${typeInfo.bg} transition-colors`}>
        <Icon className={`h-[18px] w-[18px] ${typeInfo.color}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {file.original_name}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums">
            {formatBytes(file.original_size)}
          </span>
          <span className="text-[11px] text-emerald-500 font-medium">
            {ratio}% saved
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {file.chunk_count} chunk{file.chunk_count !== 1 ? "s" : ""}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
            {formatDate(file.created_at)}
          </span>
        </div>
      </div>

      <div className="flex gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDownload(file.original_name)}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(file.id)}
          title="Delete"
        >
          <Trash2 className="h-4 w-4 text-red-400/60 hover:text-red-400" />
        </Button>
      </div>
    </div>
  );
}
