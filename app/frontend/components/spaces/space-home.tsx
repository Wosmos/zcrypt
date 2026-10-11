"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { unshareFileFromSpace, downloadSpaceFile } from "@/lib/spaces";
import { runPool } from "@/lib/pool";
import { ApiError } from "@/lib/http-error";
import { cn, formatBytes, midTrunc } from "@/lib/utils";
import { useFilesQuery } from "@/store/files";
import { useSpaceAdds } from "@/store/space-adds";
import { toast } from "@/store/toast";
import { useSpaceMeta } from "@/hooks/useSpaceMeta";
import { useKeyboardSelection } from "@/hooks/useKeyboardSelection";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRow } from "@/components/ui/skeletons";
import { AvatarStack, RoleBadge, StorageMeter } from "@/components/spaces/space-ui";
import {
  FOCUS_RING,
  FileTypeIcon,
  LiveRegion,
  Notice,
  PageShell,
  ShortcutsHelp,
  SpaceBreadcrumb,
  SpaceGlyph,
  plural,
  useGridColumns,
  useSlashToFocus,
} from "@/components/spaces/shared";
import {
  patchSpace,
  refreshSpace,
  refreshSpaces,
  useSpaceDetail,
  useSpaceFileRows,
  type SpaceFileRow,
} from "@/components/spaces/use-space";
import {
  AlertTriangle,
  Download,
  File as FileIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Settings,
  Table,
  Trash2,
  X,
} from "@/lib/icons";

const SHORTCUTS: [string, string][] = [
  ["Arrow keys", "Move between files"],
  ["Shift + Arrow", "Extend the selection"],
  ["Ctrl/Cmd + click", "Add or remove one file"],
  ["Shift + click", "Select a range"],
  ["Space", "Select or deselect"],
  ["Ctrl/Cmd + A", "Select all files"],
  ["Enter", "Download the focused file"],
  ["Delete", "Remove from this Space"],
  ["Esc", "Clear the selection"],
  ["/", "Filter files"],
  ["?", "Show these shortcuts"],
];

const REMOVE_CONCURRENCY = 4;
const LONG_PRESS_MS = 450;
type View = "list" | "grid";

function readView(): View {
  try {
    return window.localStorage.getItem("zcrypt-space-view") === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}

export function SpaceHome() {
  const { id } = useParams<{ id: string }>();
  const { query, detail, perms } = useSpaceDetail(id);
  const meta = useSpaceMeta(detail ?? undefined);
  const rows = useSpaceFileRows(detail);
  const { data: myFiles = [] } = useFilesQuery();
  const job = useSpaceAdds((s) => s.jobs[id]);

  const [view, setView] = useState<View>(readView);
  const [filter, setFilter] = useState("");
  const [selected, setSelectedRaw] = useState<ReadonlySet<string>>(new Set());
  const [announce, setAnnounce] = useState("");
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [downloading, setDownloading] = useState<ReadonlySet<string>>(new Set());
  const filterRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  useSlashToFocus(filterRef);

  useEffect(() => {
    if (meta.ready) document.title = `${meta.name} · Spaces`;
  }, [meta.ready, meta.name]);

  const setSelected = useCallback((next: Set<string>) => {
    setSelectedRaw(next);
    setAnnounce(next.size === 0 ? "Selection cleared" : `${plural(next.size, "file")} selected`);
  }, []);

  const canEdit = !!perms?.editFiles;
  const needsRotation = !!detail?.needs_rotation;

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return [...list].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }, [rows, filter]);
  const ids = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const pendingRows = useMemo(() => {
    if (!job || job.status === "done") return [];
    const have = new Set(rows.map((r) => r.id));
    const failed = new Set(job.failed.map((f) => f.fileId));
    const names = new Map(myFiles.map((f) => [f.id, f.original_name]));
    const q = filter.trim().toLowerCase();
    return job.fileIds
      .filter((fid) => !have.has(fid) && !failed.has(fid))
      .map((fid) => ({ id: fid, name: names.get(fid) ?? "Encrypted file" }))
      .filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [job, rows, myFiles, filter]);

  const columns = useGridColumns(gridRef, view === "grid" && ids.length > 0);

  const downloadFiles = useCallback(
    async (fileIds: string[]) => {
      if (!detail) return;
      for (const fid of fileIds) {
        const row = rowById.get(fid);
        if (!row) continue;
        setDownloading((prev) => new Set(prev).add(fid));
        try {
          await downloadSpaceFile(detail, fid, row.wrappedCek, row.name);
        } catch (err) {
          toast.error(
            `${midTrunc(row.name, 24, 8)}: ${err instanceof Error ? err.message : "Download failed"}`,
          );
        } finally {
          setDownloading((prev) => {
            const next = new Set(prev);
            next.delete(fid);
            return next;
          });
        }
      }
    },
    [detail, rowById],
  );

  const removeFiles = async () => {
    if (!confirmIds || !detail) return;
    const targets = confirmIds;
    setRemoving(true);
    const removed: string[] = [];
    await runPool(
      targets,
      async (fid) => {
        try {
          await unshareFileFromSpace(detail.id, fid);
          removed.push(fid);
        } catch {
          /* counted below */
        }
      },
      REMOVE_CONCURRENCY,
    );
    const gone = new Set(removed);
    patchSpace(detail.id, (d) => ({ ...d, files: d.files.filter((f) => !gone.has(f.file_id)) }));
    void refreshSpaces();
    if (removed.length < targets.length) void refreshSpace(detail.id);
    setSelectedRaw((prev) => new Set([...prev].filter((x) => !gone.has(x))));
    setAnnounce(`Removed ${plural(removed.length, "file")}`);
    if (removed.length < targets.length) {
      toast.error(`${plural(targets.length - removed.length, "file")} couldn't be removed`);
    }
    setRemoving(false);
    setConfirmIds(null);
  };

  const nav = useKeyboardSelection<string>({
    ids,
    columns,
    selected,
    onSelectedChange: setSelected,
    onOpen: (fid) => void downloadFiles([fid]),
    onDelete: canEdit ? (fids) => setConfirmIds(fids) : undefined,
  });

  const chooseView = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem("zcrypt-space-view", v);
    } catch {
      /* per-viewer convenience only */
    }
  };

  const toggleOne = (fid: string) => {
    const next = new Set(selected);
    if (next.has(fid)) next.delete(fid);
    else next.add(fid);
    setSelected(next);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  if (query.isPending && !detail) return <SpaceHomeSkeleton />;

  if (!detail || !perms) {
    const gone =
      query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
    return (
      <PageShell>
        <SpaceBreadcrumb crumbs={[{ label: "Spaces", href: "/spaces" }, { label: "Space" }]} />
        <Notice tone="error">
          {gone
            ? "This space doesn't exist, or you no longer have access to it."
            : "Couldn't load this space."}{" "}
          {!gone && (
            <button
              type="button"
              className="font-medium underline"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          )}
        </Notice>
      </PageShell>
    );
  }

  const usedBytes = rows.reduce((sum, r) => sum + (r.size ?? 0), 0);
  const limitBytes = detail.size_limit_bytes ?? 0;
  const overLimit = limitBytes > 0 && usedBytes >= limitBytes;
  const addBlocked = needsRotation || overLimit;
  const members = (detail.members ?? []).map((m) => ({
    user_id: m.user_id,
    username: m.username || m.email || "Member",
  }));
  const allSelected = ids.length > 0 && ids.every((x) => selected.has(x));
  const selectMode = selected.size > 0;
  const inFlight = job && job.status !== "done" ? job : null;

  return (
    <PageShell>
      <SpaceBreadcrumb
        crumbs={[{ label: "Spaces", href: "/spaces" }, { label: meta.name || "Space" }]}
      />

      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <SpaceGlyph className="h-12 w-12" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                {meta.ready ? meta.name : <Skeleton className="h-7 w-48" />}
              </h1>
              <RoleBadge role={perms.label} />
            </div>
            {meta.description && (
              <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {meta.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              <Link
                href={`/spaces/${id}/settings#members`}
                className={cn("rounded-full", FOCUS_RING)}
                aria-label={`${plural(members.length, "member")}. Manage members`}
              >
                <AvatarStack members={members.slice(0, 5)} total={members.length} />
              </Link>
              <div className="w-44">
                <StorageMeter used={usedBytes} limit={limitBytes} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <ShortcutsHelp items={SHORTCUTS} title="Space shortcuts" />
          {canEdit &&
            (addBlocked ? (
              <span
                aria-disabled="true"
                title={needsRotation ? "Rotate the space key first" : "Storage limit reached"}
                className={buttonClass("primary", "md", "pointer-events-none opacity-40")}
              >
                <Plus className="h-4 w-4" />
                Add files
              </span>
            ) : (
              <Link href={`/spaces/${id}/add`} className={buttonClass("primary", "md")}>
                <Plus className="h-4 w-4" />
                Add files
              </Link>
            ))}
          <Link href={`/spaces/${id}/settings`} className={buttonClass("secondary", "md")}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </header>

      {needsRotation && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 sm:flex-row sm:items-center"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-sm text-[var(--color-text)]">
            A member was removed. The space key must be rotated to lock out any copy they kept.
            {!perms.rotate && " Ask the owner to rotate it; adding files is paused until then."}
          </p>
          {perms.rotate && (
            <Link href={`/spaces/${id}/settings#rotate`} className={buttonClass("primary", "sm")}>
              Rotate key
            </Link>
          )}
        </div>
      )}

      {inFlight && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3.5 py-2 text-sm text-[var(--color-text-secondary)]"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {inFlight.status === "paused"
            ? "Unlock your vault to finish adding files."
            : `Adding ${inFlight.done} of ${inFlight.total} files…`}
        </div>
      )}

      <section className="space-y-3" aria-label="Files">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <Input
              ref={filterRef}
              icon={<Search className="h-4 w-4" />}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (filter) setFilter("");
                  else e.currentTarget.blur();
                }
                if (e.key === "ArrowDown" && ids[0]) {
                  e.preventDefault();
                  nav.moveFocus(null, 0, false);
                }
              }}
              placeholder="Filter files  ( / )"
              aria-label="Filter files"
            />
          </div>
          <p className="hidden text-xs tabular-nums text-[var(--color-text-muted)] sm:block">
            {plural(rows.length, "file")}
          </p>
          <div
            role="group"
            aria-label="Layout"
            className="ms-auto flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          >
            {(
              [
                ["list", Table, "List view"],
                ["grid", LayoutGrid, "Grid view"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                aria-label={label}
                aria-pressed={view === v}
                onClick={() => chooseView(v)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]",
                  view === v && "bg-[var(--color-surface-2)] text-[var(--color-text)]",
                  FOCUS_RING,
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        <LiveRegion message={announce} />

        {selectMode && (
          <div
            className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-md"
            role="toolbar"
            aria-label="Selection actions"
          >
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => (allSelected ? nav.clear() : nav.selectAll())}
              aria-label={allSelected ? "Deselect all" : "Select all"}
            />
            <span className="text-sm font-medium tabular-nums text-[var(--color-text)]">
              {selected.size} selected
            </span>
            <div className="ms-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void downloadFiles([...selected])}
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
              {canEdit && (
                <Button size="sm" variant="danger" onClick={() => setConfirmIds([...selected])}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove from Space
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => nav.clear()}
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {rows.length === 0 && pendingRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)]">
            <EmptyState
              icon={<FileIcon className="h-7 w-7 text-[var(--color-text-muted)]" />}
              title="No files yet"
              description={
                canEdit
                  ? "Add files from your vault to share them here. They stay end-to-end encrypted."
                  : "Editors and admins can add files to this space."
              }
              action={
                canEdit && !addBlocked ? (
                  <Link href={`/spaces/${id}/add`} className={buttonClass("primary", "md")}>
                    <Plus className="h-4 w-4" />
                    Add files
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : visibleRows.length === 0 && pendingRows.length === 0 ? (
          <p className="panel px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
            No files match &ldquo;{filter.trim()}&rdquo;.
          </p>
        ) : (
          <div
            ref={gridRef}
            role="listbox"
            aria-label={`Files in ${meta.name || "this space"}`}
            aria-multiselectable="true"
            onKeyDown={nav.onContainerKeyDown}
            className={cn(
              view === "grid"
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                : "divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)]",
            )}
          >
            {visibleRows.map((row) => {
              const props = nav.getItemProps(row.id);
              const isSel = selected.has(row.id);
              return (
                <FileItem
                  key={row.id}
                  row={row}
                  view={view}
                  selected={isSel}
                  busy={downloading.has(row.id)}
                  tabIndex={props.tabIndex}
                  focusedMarker={props["data-focused"]}
                  onKeyDown={props.onKeyDown}
                  onFocus={props.onFocus}
                  onClick={(e) => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    if (isCoarsePointer() && selectMode) toggleOne(row.id);
                    else props.onClick(e);
                  }}
                  onOpen={() => void downloadFiles([row.id])}
                  onToggle={() => toggleOne(row.id)}
                  onPressStart={(e) => {
                    if (e.pointerType !== "touch") return;
                    cancelPress();
                    pressTimer.current = setTimeout(() => {
                      suppressClick.current = true;
                      toggleOne(row.id);
                    }, LONG_PRESS_MS);
                  }}
                  onPressEnd={cancelPress}
                />
              );
            })}
            {pendingRows.map((row) => (
              <PendingItem key={row.id} name={row.name} view={view} />
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!confirmIds}
        onOpenChange={(o) => {
          if (!removing && !o) setConfirmIds(null);
        }}
        destructive
        title={`Remove ${plural(confirmIds?.length ?? 0, "file")} from this Space?`}
        description="Members lose access to these files here. Your original files in your vault are not deleted."
        confirmLabel="Remove"
        loading={removing}
        onConfirm={() => void removeFiles()}
      />
    </PageShell>
  );
}

function FileItem({
  row,
  view,
  selected,
  busy,
  tabIndex,
  focusedMarker,
  onKeyDown,
  onFocus,
  onClick,
  onOpen,
  onToggle,
  onPressStart,
  onPressEnd,
}: {
  row: SpaceFileRow;
  view: View;
  selected: boolean;
  busy: boolean;
  tabIndex: number;
  focusedMarker?: boolean;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: (e: React.FocusEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onOpen: () => void;
  onToggle: () => void;
  onPressStart: (e: React.PointerEvent) => void;
  onPressEnd: () => void;
}) {
  const common = {
    role: "option" as const,
    "aria-selected": selected,
    "data-item-id": row.id,
    "data-focused": focusedMarker,
    tabIndex,
    onKeyDown,
    onFocus,
    onClick,
    onDoubleClick: onOpen,
    onPointerDown: onPressStart,
    onPointerUp: onPressEnd,
    onPointerCancel: onPressEnd,
    onPointerLeave: onPressEnd,
  };
  const check = (
    <Checkbox
      checked={selected}
      tabIndex={-1}
      aria-label={`Select ${row.name}`}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={onToggle}
      className={cn(view === "grid" && "absolute start-2.5 top-2.5")}
    />
  );

  if (view === "grid") {
    return (
      <div
        {...common}
        className={cn(
          "group relative flex cursor-pointer select-none [-webkit-touch-callout:none] flex-col items-center gap-2 rounded-2xl border bg-[var(--color-surface)] px-3 pb-3 pt-8 text-center transition-colors",
          selected
            ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/8"
            : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]",
          FOCUS_RING,
        )}
      >
        {check}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]">
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileTypeIcon name={row.name} className="h-6 w-6" />
          )}
        </div>
        <p
          className="w-full truncate text-sm font-medium text-[var(--color-text)]"
          title={row.name}
        >
          {row.name}
        </p>
        <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
          {typeof row.size === "number" ? formatBytes(row.size) : " "}
        </p>
      </div>
    );
  }

  return (
    <div
      {...common}
      className={cn(
        "group flex cursor-pointer select-none [-webkit-touch-callout:none] items-center gap-3 px-3 py-2.5 transition-colors focus-visible:ring-inset",
        selected ? "bg-[var(--color-accent)]/8" : "hover:bg-[var(--color-surface-1)]",
        FOCUS_RING,
      )}
    >
      {check}
      {busy ? (
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[var(--color-text-muted)]" />
      ) : (
        <FileTypeIcon
          name={row.name}
          className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]" title={row.name}>
        {row.name}
      </span>
      {typeof row.size === "number" && (
        <span className="hidden flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)] sm:inline">
          {formatBytes(row.size)}
        </span>
      )}
      <span className="hidden w-24 flex-shrink-0 text-end text-xs text-[var(--color-text-muted)] md:inline">
        {new Date(row.addedAt).toLocaleDateString()}
      </span>
    </div>
  );
}

function PendingItem({ name, view }: { name: string; view: View }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex animate-pulse items-center gap-3 text-[var(--color-text-muted)]",
        view === "grid"
          ? "flex-col rounded-2xl border border-dashed border-[var(--color-border)] px-3 py-8 text-center"
          : "px-3 py-2.5",
      )}
    >
      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <span className="text-xs">adding&hellip;</span>
    </div>
  );
}

function SpaceHomeSkeleton() {
  return (
    <PageShell>
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex items-start gap-4" aria-busy="true">
        <Skeleton className="h-12 w-12 flex-shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-80 max-w-full rounded-md" />
          <Skeleton className="h-7 w-44 rounded-full" />
        </div>
      </div>
      <div className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] px-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </PageShell>
  );
}
