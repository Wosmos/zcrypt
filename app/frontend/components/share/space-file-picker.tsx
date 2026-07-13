"use client";

import { useMemo, useState } from "react";
import type { FileMetadata } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { midTrunc } from "@/lib/utils";
import { FolderOpen, File as FileIcon, Search } from "@/lib/icons";

interface SpaceFilePickerProps {
  /** Files the user can choose from (already name-decrypted upstream). */
  files: FileMetadata[];
  /** folderId → decrypted folder name, for grouping. */
  folderNames: Record<string, string>;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown when there are no files to pick at all. */
  emptyLabel?: string;
}

interface FolderGroup {
  id: string;
  name: string;
  files: FileMetadata[];
}

/** A searchable file chooser that groups files under their folder and lists each
 *  file exactly once. Folder headers select/deselect the whole group. Used by
 *  both "create space" and "add files" so the two stay identical. */
export function SpaceFilePicker({
  files,
  folderNames,
  selected,
  onChange,
  emptyLabel = "No files to add.",
}: SpaceFilePickerProps) {
  const [query, setQuery] = useState("");

  const { groups, ungrouped, matchCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? files.filter((f) => f.original_name.toLowerCase().includes(q))
      : files;

    const byFolder = new Map<string, FileMetadata[]>();
    const loose: FileMetadata[] = [];
    for (const f of matches) {
      const fid = f.folder_id;
      if (fid && folderNames[fid]) {
        const bucket = byFolder.get(fid);
        if (bucket) bucket.push(f);
        else byFolder.set(fid, [f]);
      } else {
        loose.push(f);
      }
    }

    const folderGroups: FolderGroup[] = [...byFolder.entries()]
      .map(([id, groupFiles]) => ({ id, name: folderNames[id] ?? "Folder", files: groupFiles }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { groups: folderGroups, ungrouped: loose, matchCount: matches.length };
  }, [files, folderNames, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleOne = (id: string) => {
    onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const toggleGroup = (groupFiles: FileMetadata[]) => {
    const ids = groupFiles.map((f) => f.id);
    const allIn = ids.every((id) => selectedSet.has(id));
    onChange(
      allIn
        ? selected.filter((id) => !ids.includes(id))
        : Array.from(new Set([...selected, ...ids]))
    );
  };

  if (files.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      <Input
        icon={<Search className="h-4 w-4" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files"
        aria-label="Search files"
      />

      <div className="max-h-56 space-y-0.5 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
        {matchCount === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--color-text-muted)]">
            No files match “{query.trim()}”.
          </p>
        ) : (
          <>
            {groups.map((group) => {
              const ids = group.files.map((f) => f.id);
              const allIn = ids.every((id) => selectedSet.has(id));
              return (
                <div key={group.id} className="min-w-0">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]">
                    <Checkbox checked={allIn} onCheckedChange={() => toggleGroup(group.files)} />
                    <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">
                      {midTrunc(group.name, 22, 8)}
                    </span>
                    <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                      {group.files.length} file{group.files.length === 1 ? "" : "s"}
                    </span>
                  </label>
                  {group.files.map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      checked={selectedSet.has(f.id)}
                      onToggle={toggleOne}
                      indent
                    />
                  ))}
                </div>
              );
            })}
            {ungrouped.map((f) => (
              <FileRow key={f.id} file={f} checked={selectedSet.has(f.id)} onToggle={toggleOne} />
            ))}
          </>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
          <span className="tabular-nums">{selected.length} selected</span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="font-medium text-[var(--color-accent)] outline-none hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  checked,
  onToggle,
  indent = false,
}: {
  file: FileMetadata;
  checked: boolean;
  onToggle: (id: string) => void;
  indent?: boolean;
}) {
  return (
    <label
      className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)] ${indent ? "pl-7" : ""}`}
    >
      <Checkbox checked={checked} onCheckedChange={() => onToggle(file.id)} />
      <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
        {midTrunc(file.original_name, 22, 8)}
      </span>
    </label>
  );
}
