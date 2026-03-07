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
import { formatBytes, formatDate, getFileIcon } from "@/lib/utils";

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

  const iconName = getFileIcon(file.original_name);
  const Icon = iconMap[iconName] || File;

  return (
    <div className="group flex items-center gap-3 sm:gap-4 rounded-2xl border border-zinc-800/50 bg-gradient-to-r from-zinc-900/60 to-zinc-900/30 p-3.5 sm:p-4 hover:border-zinc-700/60 hover:from-zinc-900/80 hover:to-zinc-900/50 transition-all duration-200">
      <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-zinc-800/50 group-hover:bg-zinc-800/70 transition-colors">
        <Icon className="h-[18px] w-[18px] text-zinc-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">
          {file.original_name}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          <span className="text-[11px] text-zinc-500 tabular-nums">
            {formatBytes(file.original_size)}
          </span>
          <span className="text-[11px] text-emerald-500/80 font-medium">
            {ratio}% saved
          </span>
          <span className="text-[11px] text-zinc-600">
            {file.chunk_count} chunk{file.chunk_count !== 1 ? "s" : ""}
          </span>
          <span className="text-[11px] text-zinc-600 hidden sm:inline">
            {formatDate(file.created_at)}
          </span>
        </div>
      </div>

      <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
