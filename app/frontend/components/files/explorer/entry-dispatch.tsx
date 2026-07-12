"use client";

import type { ComponentType } from "react";
import type { ExplorerItemProps, FolderItemProps, FileItemProps } from "./types";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./types";
import { CheckSquare, Square } from "@/lib/icons";
import type { FileMetadata } from "@/types";

/**
 * File selection-mode toggle button — shared by ExplorerCard and ExplorerRow.
 * `className` carries the only real difference between the two: absolute
 * positioning over the card thumbnail vs. an inline flex slot in the row.
 */
export function SelectCheckbox({
  file,
  selected,
  onSelect,
  className,
}: {
  file: FileMetadata;
  selected: boolean;
  onSelect: (id: string) => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(file.id);
      }}
      className={cn(className, FOCUS_RING)}
      aria-label={selected ? `Deselect ${file.original_name}` : `Select ${file.original_name}`}
      aria-pressed={selected}
    >
      {selected ? (
        <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
      ) : (
        <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
      )}
    </button>
  );
}

interface ExplorerEntryDispatchProps extends ExplorerItemProps {
  FolderView: ComponentType<FolderItemProps>;
  FileView: ComponentType<FileItemProps>;
}

/**
 * Resolves an ExplorerEntry to its folder or file renderer, forwarding the
 * matching prop subset. Shared by ExplorerCardImpl and ExplorerRowImpl — the
 * list/grid dispatch differs only in which pair of leaf components it passes in.
 */
export function ExplorerEntryDispatch({
  FolderView,
  FileView,
  entry,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
  onOpenFolderDetails,
  onShareFolder,
  onCustomizeFolder,
  onOpenDetails,
  onCustomizeFile,
  drag,
}: ExplorerEntryDispatchProps) {
  if (entry.kind === "folder") {
    return (
      <FolderView
        entry={entry}
        folder={entry.folder}
        focused={focused}
        onOpenFolder={onOpenFolder}
        onEntryKeyDown={onEntryKeyDown}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onProtectFolder={onProtectFolder}
        onRemoveFolderPassword={onRemoveFolderPassword}
        onMoveFolderRequest={onMoveFolderRequest}
        onOpenFolderDetails={onOpenFolderDetails}
        onShareFolder={onShareFolder}
        onCustomizeFolder={onCustomizeFolder}
        drag={drag}
      />
    );
  }
  return (
    <FileView
      entry={entry}
      file={entry.file}
      actions={actions}
      selectMode={selectMode}
      selected={selected}
      focused={focused}
      onSelect={onSelect}
      onRequestSelect={onRequestSelect}
      onFileClick={onFileClick}
      onEntryKeyDown={onEntryKeyDown}
      onOpenDetails={onOpenDetails ?? actions.onOpenDetails}
      onCustomizeFile={onCustomizeFile}
      drag={drag}
    />
  );
}
