"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { listFolders } from "@/lib/api";
import { decryptNameSafe } from "@/lib/name-crypto";
import { nameKeyFor } from "@/lib/sealed";
import { qk } from "@/lib/query-keys";
import { cn, formatBytes, midTrunc } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
import { useKeyboardSelection } from "@/hooks/useKeyboardSelection";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FOCUS_RING,
  FileTypeIcon,
  LiveRegion,
  useSlashToFocus,
  SelectTick,
} from "@/components/spaces/shared";
import type { FileMetadata } from "@/types";
import { ChevronRight, Folder, Home, Search } from "@/lib/icons";

const FOLDER_PREFIX = "folder:";

interface FolderEntry {
  id: string;
  name: string;
}

function useFolderChildren(parentId: string | null): { folders: FolderEntry[]; loading: boolean } {
  const t = useTranslations("spaces");
  const user = useAuthStore((s) => s.user);
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);
  const query = useQuery({
    queryKey: qk.folders(parentId),
    queryFn: () => listFolders(parentId),
  });
  const raw = query.data;
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const pass = usePassphraseStore.getState().getPassphrase();
    if (!raw || !user || !pass) return;
    let cancelled = false;
    void (async () => {
      const key = await nameKeyFor(pass, user.id);
      const entries = await Promise.all(
        raw.map(async (f) => [f.id, await decryptNameSafe(f.encrypted_name, key)] as const),
      );
      if (!cancelled) setNames(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, user, cachedPassphrase]);

  const folders = useMemo(
    () =>
      (raw ?? [])
        .map((f) => ({ id: f.id, name: names[f.id] ?? t("shared.folder") }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [raw, names, t],
  );
  return { folders, loading: query.isPending };
}

interface FilePickerProps {
  files: FileMetadata[];
  selected: ReadonlySet<string>;
  onSelectedChange: (next: Set<string>) => void;
  loading?: boolean;
  emptyLabel?: string;
  className?: string;
  listClassName?: string;
  autoFocusSearch?: boolean;
}

export function FilePicker({
  files,
  selected,
  onSelectedChange,
  loading = false,
  emptyLabel,
  className,
  listClassName = "max-h-[28rem]",
  autoFocusSearch = false,
}: FilePickerProps) {
  const t = useTranslations("spaces");
  const [path, setPath] = useState<FolderEntry[]>([]);
  const [query, setQuery] = useState("");
  const [announce, setAnnounce] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);

  const currentId = path.length ? path[path.length - 1].id : null;
  const searching = query.trim().length > 0;
  const { folders, loading: foldersLoading } = useFolderChildren(searching ? null : currentId);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return files.filter((f) => f.original_name.toLowerCase().includes(q));
    return files.filter((f) => (f.folder_id ?? null) === currentId);
  }, [files, query, currentId]);

  const shownFolders = useMemo(() => (searching ? [] : folders), [searching, folders]);
  const fileIds = useMemo(() => visibleFiles.map((f) => f.id), [visibleFiles]);
  const ids = useMemo(
    () => [...shownFolders.map((f) => FOLDER_PREFIX + f.id), ...fileIds],
    [shownFolders, fileIds],
  );

  const setSelected = (next: Set<string>) => {
    const inView = new Set(fileIds);
    const merged = new Set<string>();
    for (const id of selected) if (!inView.has(id)) merged.add(id);
    for (const id of next) if (inView.has(id)) merged.add(id);
    onSelectedChange(merged);
    setAnnounce(
      merged.size === 0
        ? t("shared.selectionCleared")
        : t("shared.filesSelected", { count: merged.size }),
    );
  };

  const openFolder = (id: string) => {
    const f = shownFolders.find((x) => x.id === id);
    if (f) setPath((p) => [...p, f]);
  };

  const toggleFile = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
    setAnnounce(
      next.size === 0
        ? t("shared.selectionCleared")
        : t("shared.filesSelected", { count: next.size }),
    );
  };

  const nav = useKeyboardSelection<string>({
    ids,
    columns: 1,
    selected,
    selectableIds: fileIds,
    onSelectedChange: setSelected,
    onOpen: (id) => (id.startsWith(FOLDER_PREFIX) ? openFolder(id.slice(7)) : toggleFile(id)),
    onEscape: () => setAnnounce(t("shared.selectionCleared")),
  });

  const allInView = fileIds.length > 0 && fileIds.every((id) => selected.has(id));
  const busy = loading || (!searching && foldersLoading);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Input
            ref={searchRef}
            icon={<Search className="h-4 w-4" />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                if (query) setQuery("");
                else e.currentTarget.blur();
              }
              if (e.key === "ArrowDown" && ids[0]) {
                e.preventDefault();
                nav.moveFocus(null, 0, false);
              }
            }}
            placeholder={t("picker.searchPlaceholder")}
            aria-label={t("add.search")}
            autoFocus={autoFocusSearch}
          />
        </div>
        {fileIds.length > 0 && (
          <button
            type="button"
            onClick={() => (allInView ? nav.clear() : nav.selectAll())}
            className={cn(
              "h-10 flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
              FOCUS_RING,
            )}
          >
            {allInView
              ? t("picker.deselectHere")
              : t("picker.selectAllN", { count: fileIds.length })}
          </button>
        )}
      </div>

      {!searching && (
        <nav
          aria-label={t("picker.folderPath")}
          className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
        >
          <button
            type="button"
            onClick={() => setPath([])}
            disabled={path.length === 0}
            className={cn(
              "flex flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:font-medium disabled:text-[var(--color-text)]",
              FOCUS_RING,
            )}
          >
            <Home className="h-3.5 w-3.5" />
            {t("picker.myVault")}
          </button>
          {path.map((c, i) => (
            <span key={c.id} className="flex flex-shrink-0 items-center gap-0.5">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <button
                type="button"
                onClick={() => setPath(path.slice(0, i + 1))}
                disabled={i === path.length - 1}
                className={cn(
                  "rounded-md px-1.5 py-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:font-medium disabled:text-[var(--color-text)]",
                  FOCUS_RING,
                )}
              >
                {midTrunc(c.name, 24, 8)}
              </button>
            </span>
          ))}
        </nav>
      )}

      <LiveRegion message={announce} />

      <div
        role="listbox"
        aria-label={t("picker.yourFiles")}
        aria-multiselectable="true"
        aria-busy={busy}
        onKeyDown={nav.onContainerKeyDown}
        className={cn(
          "overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1",
          listClassName,
        )}
      >
        {busy ? (
          <div className="space-y-1 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : ids.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-[var(--color-text-muted)]">
            {searching
              ? t("picker.noMatch", { query: query.trim() })
              : files.length === 0
                ? (emptyLabel ?? t("picker.emptyDefault"))
                : t("picker.folderEmpty")}
          </p>
        ) : (
          <>
            {shownFolders.map((f) => {
              const id = FOLDER_PREFIX + f.id;
              const { onKeyDown, onFocus, tabIndex } = nav.getItemProps(id);
              return (
                <div
                  key={id}
                  role="option"
                  aria-selected={false}
                  data-item-id={id}
                  tabIndex={tabIndex}
                  onKeyDown={onKeyDown}
                  onFocus={onFocus}
                  onClick={() => openFolder(f.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--color-surface-1)] focus-visible:bg-[var(--color-surface-1)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]",
                    "outline-none",
                  )}
                >
                  <Folder className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">
                    {f.name}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                </div>
              );
            })}
            {visibleFiles.map((f) => {
              const props = nav.getItemProps(f.id);
              const isSel = selected.has(f.id);
              return (
                <div
                  key={f.id}
                  role="option"
                  data-item-id={f.id}
                  aria-selected={isSel}
                  tabIndex={props.tabIndex}
                  onKeyDown={props.onKeyDown}
                  onFocus={props.onFocus}
                  onClick={(e) => (e.shiftKey ? props.onClick(e) : toggleFile(f.id))}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 outline-none transition-colors hover:bg-[var(--color-surface-1)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]",
                    isSel && "bg-[var(--color-accent)]/8 hover:bg-[var(--color-accent)]/12",
                  )}
                >
                  <SelectTick checked={isSel} />
                  <FileTypeIcon
                    name={f.original_name}
                    className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    {midTrunc(f.original_name, 40, 10)}
                  </span>
                  <span className="hidden flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)] sm:inline">
                    {formatBytes(f.original_size)}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
