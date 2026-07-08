"use client";

import { File } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";

/**
 * The "chosen file" row (icon + name + size + Change) shared by send-tool and
 * transfer-tool's selecting states.
 */
export function SelectedFileCard({
  name,
  size,
  onRemove,
}: {
  name: string;
  size: number;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface-1)]">
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[var(--color-accent)]/10 flex-shrink-0">
        <File className="h-5 w-5 text-[var(--color-accent)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(size)}</p>
      </div>
      <button onClick={onRemove} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Change</button>
    </div>
  );
}
