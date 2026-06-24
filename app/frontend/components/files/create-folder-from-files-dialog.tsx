"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getFileTypeInfo, cn } from "@/lib/utils";
import {
  Folder as FolderIcon,
  File,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Cog,
  Table,
} from "@/lib/icons";
import type { FileMetadata } from "@/types";

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

const DIALOG_PANEL =
  "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-2xl shadow-2xl";

/**
 * ── <CreateFolderFromFilesDialog> (OWNER 2) ──────────────────────────────────
 *
 * macOS/iOS-style "drop a file onto another file → make a new folder containing
 * both". Opened by the explorer when a file is dropped onto ANOTHER file. The
 * dialog is purely presentational: it prompts for a folder name and previews the
 * two files; the PAGE owns the crypto/move orchestration via `onConfirm(name)`,
 * which:
 *   1. encrypts the name (existing name-crypto) + createFolder → new folder id,
 *   2. moves BOTH files into it through the existing move/re-key path (so
 *      protected-folder rules + cross-boundary re-keying still hold),
 *   3. refreshes.
 * The folder name is encrypted end-to-end before it leaves the device — the
 * dialog never sends or logs a plaintext name itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface CreateFolderFromFilesDialogProps {
  open: boolean;
  /** The dragged file + the file it was dropped on (both will be moved in). */
  source: FileMetadata | null;
  target: FileMetadata | null;
  /** Create the folder (encrypted name) + move both files in. Throws on failure. */
  onConfirm: (folderName: string) => Promise<void>;
  onClose: () => void;
}

/** Drop the extension so a default folder name reads cleanly ("Report" not "Report.pdf"). */
function baseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function FilePill({ file }: { file: FileMetadata }) {
  const info = getFileTypeInfo(file.original_name);
  const Icon = iconMap[info.icon] ?? File;
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2.5 py-1.5">
      <span className={cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md", info.bg)}>
        <Icon className={cn("h-4 w-4", info.color)} />
      </span>
      <span className="min-w-0 truncate text-xs font-medium text-[var(--color-text)]">
        {file.original_name}
      </span>
    </div>
  );
}

export function CreateFolderFromFilesDialog({
  open,
  source,
  target,
  onConfirm,
  onClose,
}: CreateFolderFromFilesDialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Seed a sensible default name from the dropped-on file each time we open.
  useEffect(() => {
    if (open) {
      setName(target ? `${baseName(target.original_name)} folder` : "New folder");
      setBusy(false);
    }
  }, [open, target]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      // The page closes us on success via `open`; nothing to do here.
    } catch {
      // The page surfaces the toast; re-enable so the user can retry/cancel.
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className={DIALOG_PANEL}>
        <DialogHeader>
          <DialogTitle>New folder from selection</DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            Both files move into a new folder. The folder name is encrypted
            end-to-end before it leaves your device.
          </DialogDescription>
        </DialogHeader>

        {(source || target) && (
          <div className="flex flex-col gap-1.5">
            {target && <FilePill file={target} />}
            {source && <FilePill file={source} />}
          </div>
        )}

        <Input
          autoFocus
          placeholder="Folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          icon={<FolderIcon className="h-4 w-4" />}
          aria-label="New folder name"
        />

        <DialogFooter className="gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
