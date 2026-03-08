"use client";

import type { FileMetadata } from "@/types";
import type { DownloadState } from "./file-card";
import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
  Download, Trash2, Eye, Loader2, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortField = "name" | "size" | "date" | "saved";
export type SortDir = "asc" | "desc";

interface FileTableProps {
  files: FileMetadata[];
  downloadStates: Record<string, DownloadState>;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  onDownload: (filename: string) => void;
  onDelete: (id: string) => void;
  onPreview?: (filename: string) => void;
}

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function FileTable({ files, downloadStates, sortField, sortDir, onSort, onDownload, onDelete, onPreview }: FileTableProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/50">
              <th className="text-left px-4 py-3">
                <button onClick={() => onSort("name")} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors">
                  Name <SortIcon field="name" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("size")} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Size <SortIcon field="size" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("saved")} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Saved <SortIcon field="saved" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("date")} className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Date <SortIcon field="date" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Chunks
              </th>
              <th className="text-right px-4 py-3 w-[120px]" />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const typeInfo = getFileTypeInfo(file.original_name);
              const Icon = iconMap[typeInfo.icon] || File;
              const savings = file.original_size > 0
                ? ((1 - file.encrypted_size / file.original_size) * 100).toFixed(0)
                : "0";
              const ds = downloadStates[file.id] || "idle";
              const isDownloading = ds === "downloading";
              const isDone = ds === "done";

              return (
                <tr
                  key={file.id}
                  className={cn(
                    "border-b border-[var(--color-border)] last:border-0 transition-colors group",
                    isDownloading ? "bg-emerald-500/5" : isDone ? "bg-emerald-500/5" : "hover:bg-[var(--color-surface-1)]"
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0", typeInfo.bg)}>
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Icon className={`h-4 w-4 ${typeInfo.color}`} />
                        )}
                      </div>
                      <span className="font-medium truncate max-w-[240px]">{file.original_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {formatBytes(file.original_size)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-medium tabular-nums", Number(savings) > 0 ? "text-emerald-500" : "text-[var(--color-text-muted)]")}>
                      {savings}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text-secondary)]">
                    {formatDate(file.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-muted)]">
                    {file.chunk_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {!isDownloading && (
                        <>
                          {onPreview && (
                            <Button variant="ghost" size="icon" onClick={() => onPreview(file.original_name)} title="Preview" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => onDownload(file.original_name)} title="Download" className={cn("h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity", isDone && "opacity-100")}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => onDelete(file.id)} title="Delete" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="h-3.5 w-3.5 text-red-400/60 hover:text-red-400" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: fall back to simple list */}
      <div className="sm:hidden divide-y divide-[var(--color-border)]">
        {files.map((file) => {
          const typeInfo = getFileTypeInfo(file.original_name);
          const Icon = iconMap[typeInfo.icon] || File;
          const savings = file.original_size > 0
            ? ((1 - file.encrypted_size / file.original_size) * 100).toFixed(0)
            : "0";

          return (
            <div key={file.id} className="flex items-center gap-3 px-4 py-3">
              <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0", typeInfo.bg)}>
                <Icon className={`h-4 w-4 ${typeInfo.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.original_name}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {formatBytes(file.original_size)} &middot; {savings}% saved &middot; {formatDate(file.created_at)}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon" onClick={() => onDownload(file.original_name)} className="h-7 w-7">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
