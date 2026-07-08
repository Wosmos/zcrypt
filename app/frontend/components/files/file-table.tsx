"use client";

import type { FileMetadata } from "@/types";
import type { DownloadState } from "./file-card";
import { formatBytes, formatDate, getFileTypeInfo, fileIconFor, savingsPercent } from "@/lib/utils";
import {
  Download, Trash2, Eye, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Square, Share2, MoreHorizontal, Lock, FolderOpen,
} from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDragMove, DRAG_MIME } from "@/hooks/useDragMove";

// Canonical definitions live in ./explorer/types — imported for local use and
// re-exported so existing importers of these names from file-table keep working.
import type { SortField, SortDir } from "./explorer/types";
export type { SortField, SortDir };

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
  onMove?: (id: string) => void;
  onOpen?: (file: FileMetadata) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  /** Enable drag-to-move. Rows become drag sources carrying the file id. */
  draggable?: boolean;
}

function SortIcon({ field, activeField, dir }: { field: SortField; activeField: SortField; dir: SortDir }) {
  if (field !== activeField) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

function HeaderButton({ label, field, sortField, sortDir, onSort, align = "left" }: {
  label: string; field: SortField; sortField: SortField; sortDir: SortDir; onSort: (f: SortField) => void; align?: "left" | "right";
}) {
  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]",
        align === "right" && "ml-auto"
      )}
    >
      {label} <SortIcon field={field} activeField={sortField} dir={sortDir} />
    </button>
  );
}

function RowActions({ file, onPreview, onDownload, onShare, onMove, onDelete }: {
  file: FileMetadata; onPreview?: (n: string) => void; onDownload: (n: string) => void; onShare?: (id: string) => void; onMove?: (id: string) => void; onDelete: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:text-[var(--color-text)]"
          aria-label={`Actions for ${file.original_name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {onPreview && (
          <DropdownMenuItem onClick={() => onPreview(file.original_name)}>
            <Eye className="h-4 w-4" /> Preview
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDownload(file.original_name)}>
          <Download className="h-4 w-4" /> Download
        </DropdownMenuItem>
        {onShare && (
          <DropdownMenuItem onClick={() => onShare(file.id)}>
            <Share2 className="h-4 w-4" /> Share
          </DropdownMenuItem>
        )}
        {onMove && (
          <DropdownMenuItem onClick={() => onMove(file.id)}>
            <FolderOpen className="h-4 w-4" /> Move to folder
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(file.id)}
          className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileTable({ files, downloadStates, sortField, sortDir, onSort, onDownload, onDelete, onPreview, onShare, onMove, onOpen, selectable, selectedIds, onSelect, onSelectAll, draggable }: FileTableProps) {
  const allSelected = selectable && selectedIds && files.length > 0 && files.every((f) => selectedIds.has(f.id));
  const startDrag = useDragMove((s) => s.startDrag);
  const endDrag = useDragMove((s) => s.endDrag);
  const dragId = useDragMove((s) => s.dragging?.id ?? null);

  // Drag a file: stash the id in dataTransfer (for the drop handler) and in the
  // shared store (for synchronous drag-over checks). Disabled in selection mode.
  const canDragRow = draggable && !selectable;
  const dragHandlers = (file: FileMetadata) =>
    canDragRow
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData(DRAG_MIME, file.id);
            e.dataTransfer.effectAllowed = "move";
            startDrag({ kind: "file", id: file.id, name: file.original_name });
          },
          onDragEnd: () => endDrag(),
        }
      : {};

  return (
    <div className="panel overflow-hidden">
      {/* Desktop table */}
      <div className="hidden max-h-[65vh] overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
              {selectable && (
                <th className="w-10 px-3 py-3">
                  <button onClick={onSelectAll} className="flex items-center justify-center" aria-label="Select all">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                    ) : (
                      <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 text-left"><HeaderButton label="Name" field="name" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
              <th className="px-4 py-3 text-left"><HeaderButton label="Type" field="type" sortField={sortField} sortDir={sortDir} onSort={onSort} /></th>
              <th className="px-4 py-3 text-right"><HeaderButton label="Size" field="size" sortField={sortField} sortDir={sortDir} onSort={onSort} align="right" /></th>
              <th className="px-4 py-3 text-right"><HeaderButton label="Saved" field="saved" sortField={sortField} sortDir={sortDir} onSort={onSort} align="right" /></th>
              <th className="px-4 py-3 text-right"><HeaderButton label="Modified" field="date" sortField={sortField} sortDir={sortDir} onSort={onSort} align="right" /></th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--color-text-muted)]">Chunks</th>
              <th className="w-[56px] px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const typeInfo = getFileTypeInfo(file.original_name);
              const Icon = fileIconFor(file.original_name);
              const savings = savingsPercent(file.original_size, file.encrypted_size);
              const ds = downloadStates[file.id] || "idle";
              const isDownloading = ds === "downloading";
              const isDone = ds === "done";
              const isSelected = selectable && selectedIds?.has(file.id);

              return (
                <tr
                  key={file.id}
                  onClick={selectable ? () => onSelect?.(file.id) : onOpen ? () => onOpen(file) : undefined}
                  {...dragHandlers(file)}
                  className={cn(
                    "group border-b border-[var(--color-border)] transition-colors last:border-0",
                    (selectable || onOpen) && "cursor-pointer",
                    canDragRow && "cursor-grab active:cursor-grabbing",
                    dragId === file.id && "opacity-50",
                    isSelected ? "bg-[var(--shell-active)]" : "hover:bg-[var(--color-surface-1)]"
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-center">
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", typeInfo.bg)}>
                        {isDownloading ? (
                          <LogoSpinner size={16} speed="fast" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
                        ) : (
                          <Icon className={`h-[18px] w-[18px] ${typeInfo.color}`} />
                        )}
                      </div>
                      <span className="max-w-[260px] truncate font-medium text-[var(--color-text)]">{file.original_name}</span>
                      <Lock className="h-3 w-3 flex-shrink-0 text-[var(--color-text-muted)]/50" aria-label="Encrypted" />
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[var(--color-text-secondary)]">{typeInfo.label}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-secondary)]">
                    {formatBytes(file.original_size)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={cn("font-medium tabular-nums", Number(savings) > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")}>
                      {savings}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-[var(--color-text-secondary)]">
                    {formatDate(file.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-right tabular-nums text-[var(--color-text-muted)]">
                    {file.chunk_count}
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    {!isDownloading && (
                      <RowActions file={file} onPreview={onPreview} onDownload={onDownload} onShare={onShare} onMove={onMove} onDelete={onDelete} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: simple list */}
      <div className="max-h-[65vh] divide-y divide-[var(--color-border)] overflow-y-auto sm:hidden">
        {files.map((file) => {
          const typeInfo = getFileTypeInfo(file.original_name);
          const Icon = fileIconFor(file.original_name);
          const savings = savingsPercent(file.original_size, file.encrypted_size);

          return (
            <div
              key={file.id}
              onClick={selectable ? () => onSelect?.(file.id) : onOpen ? () => onOpen(file) : undefined}
              {...dragHandlers(file)}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                (selectable || onOpen) && "cursor-pointer active:bg-[var(--color-surface-1)]",
                dragId === file.id && "opacity-50"
              )}
            >
              {selectable && (
                <button onClick={(e) => { e.stopPropagation(); onSelect?.(file.id); }} className="flex-shrink-0" aria-label="Select file">
                  {selectedIds?.has(file.id) ? (
                    <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                  ) : (
                    <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                </button>
              )}
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", typeInfo.bg)}>
                <Icon className={`h-[18px] w-[18px] ${typeInfo.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">{file.original_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatBytes(file.original_size)} &middot; {savings}% saved &middot; {formatDate(file.created_at)}
                </p>
              </div>
              <RowActions file={file} onPreview={onPreview} onDownload={onDownload} onShare={onShare} onMove={onMove} onDelete={onDelete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
