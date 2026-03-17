"use client";

import type { FileMetadata } from "@/types";
import type { DownloadState } from "./file-card";
import { formatBytes, formatDate, getFileTypeInfo } from "@/lib/utils";
import {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
  Download, Trash2, Eye, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Square, Share2,
} from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortField = "name" | "size" | "date" | "saved" | "type";
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
  onShare?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
}

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

export function FileTable({ files, downloadStates, sortField, sortDir, onSort, onDownload, onDelete, onPreview, onShare, selectable, selectedIds, onSelect, onSelectAll }: FileTableProps) {
  const allSelected = selectable && selectedIds && files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/50">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <button onClick={onSelectAll} className="flex items-center justify-center">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                    ) : (
                      <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                    )}
                  </button>
                </th>
              )}
              <th className="text-left px-4 py-3">
                <button onClick={() => onSort("name")} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors">
                  Name <SortIcon field="name" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-left px-4 py-3">
                <button onClick={() => onSort("type")} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors">
                  Type <SortIcon field="type" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("size")} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Size <SortIcon field="size" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("saved")} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Saved <SortIcon field="saved" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3">
                <button onClick={() => onSort("date")} className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider hover:text-[var(--color-text-secondary)] transition-colors ml-auto">
                  Date <SortIcon field="date" activeField={sortField} dir={sortDir} />
                </button>
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
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
              const isSelected = selectable && selectedIds?.has(file.id);

              return (
                <tr
                  key={file.id}
                  onClick={selectable ? () => onSelect?.(file.id) : undefined}
                  className={cn(
                    "border-b border-[var(--color-border)] last:border-0 transition-colors group",
                    selectable && "cursor-pointer",
                    isDownloading ? "bg-cyan-500/5" : isDone ? "bg-cyan-500/5" : isSelected ? "bg-[var(--color-accent)]/5" : "hover:bg-[var(--color-surface-1)]"
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0", typeInfo.bg)}>
                        {isDownloading ? (
                          <LogoSpinner size={16} speed="fast" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                        ) : (
                          <Icon className={`h-4 w-4 ${typeInfo.color}`} />
                        )}
                      </div>
                      <span className="font-medium truncate max-w-[240px]">{file.original_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">{typeInfo.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {formatBytes(file.original_size)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn("font-medium tabular-nums", Number(savings) > 0 ? "text-cyan-500" : "text-[var(--color-text-muted)]")}>
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
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onPreview(file.original_name); }} title="Preview" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDownload(file.original_name); }} title="Download" className={cn("h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity", isDone && "opacity-100")}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {onShare && (
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onShare(file.id); }} title="Share" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Share2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(file.id); }} title="Delete" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
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
              {selectable && (
                <button onClick={() => onSelect?.(file.id)} className="flex-shrink-0">
                  {selectedIds?.has(file.id) ? (
                    <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                  ) : (
                    <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                </button>
              )}
              <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0", typeInfo.bg)}>
                <Icon className={`h-4 w-4 ${typeInfo.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.original_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
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
