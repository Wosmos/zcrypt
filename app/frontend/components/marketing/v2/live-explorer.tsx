"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { FileMetadata } from "@/types";
import { FileTable, type SortField, type SortDir } from "@/components/files/file-table";
import { FileCard } from "@/components/files/file-card";
import { ExplorerToolbar } from "@/components/files/explorer/explorer-toolbar";
import { ExplorerBreadcrumb } from "@/components/files/explorer/breadcrumb";
import type { ViewMode, GridCols } from "@/components/files/explorer/types";
import { Logo } from "@/components/ui/logo";
import {
  Shield,
  BarChart3,
  Layers,
  Wand2,
  Settings,
  Trash2,
  Search,
  Lock,
  Infinity as InfinityIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * The real explorer, on the landing page.
 *
 * This is not a drawing of the app. FileTable, FileCard, ExplorerToolbar and
 * ExplorerBreadcrumb are the exact components the dashboard renders, fed with
 * sample files instead of the API. Sorting, the view toggle and select mode
 * all work. Anything that would need an account (download, delete, share)
 * shows a hint instead, so a visitor learns the product by touching it.
 *
 * The shell around them (sidebar, top bar) mirrors app/(app)/layout.tsx: the
 * same floating panels, the same nav labels, so what they see here is what
 * they get after sign-up.
 */
const NOW = Date.now();
const day = 86_400_000;

const SAMPLE: FileMetadata[] = [
  f("passport-scan.pdf", 2_516_582, 0.62, 1, NOW - 2 * day, "telegram"),
  f("wedding-photos.zip", 1_288_490_188, 0.98, 128, NOW - 5 * day, "telegram"),
  f("tax-return-2025.pdf", 901_120, 0.58, 1, NOW - 9 * day, "github"),
  f("lease-signed.pdf", 317_440, 0.7, 1, NOW - 12 * day, "github"),
  f("savings.xlsx", 45_056, 0.31, 1, NOW - 20 * day, "gitlab"),
  f("thesis-final-v9.docx", 3_145_728, 0.44, 1, NOW - 33 * day, "huggingface"),
];

function f(
  name: string,
  size: number,
  ratio: number,
  chunks: number,
  at: number,
  platform: string,
): FileMetadata {
  const compressed = Math.round(size * ratio);
  return {
    id: name,
    original_name: name,
    original_size: size,
    compressed_size: compressed,
    encrypted_size: compressed + chunks * 28,
    chunk_count: chunks,
    sha256: "",
    created_at: new Date(at).toISOString(),
    platform,
  };
}

const NAV = [
  { label: "Vault", Icon: Shield, active: true },
  { label: "Insights", Icon: BarChart3 },
  { label: "Spaces", Icon: Layers },
  { label: "Tools", Icon: Wand2 },
  { label: "Settings", Icon: Settings },
  { label: "Deleted Files", Icon: Trash2 },
];

const noDrag = {
  dragging: false,
  overTarget: null,
  acceptsDrag: () => false,
  dropHandlers: () => ({
    onDragOver: () => {},
    onDragLeave: () => {},
    onDrop: () => {},
  }),
};

export function LiveExplorer({ className }: { className?: string }) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("list");
  const [gridCols, setGridCols] = useState<GridCols>("auto");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const files = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...SAMPLE].sort((a, b) => {
      switch (sortField) {
        case "name":
          return dir * a.original_name.localeCompare(b.original_name);
        case "size":
          return dir * (a.original_size - b.original_size);
        case "saved":
          return dir * (a.compressed_size / a.original_size - b.compressed_size / b.original_size);
        case "type":
          return dir * ext(a.original_name).localeCompare(ext(b.original_name));
        default:
          return dir * (Date.parse(a.created_at) - Date.parse(b.created_at));
      }
    });
  }, [sortField, sortDir]);

  const say = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2200);
  };

  const onSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };
  const onSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const onSelectAll = () =>
    setSelected((s) => (s.size === files.length ? new Set() : new Set(files.map((x) => x.id))));

  const needsAccount = (what: string) => () =>
    say(`${what} works after sign-up. Everything else here is live.`);

  return (
    <div className={cn("v2-frame", className)}>
      <div className="v2-shell">
        <aside className="panel v2-side" aria-hidden="true">
          <div className="px-1.5 pb-3 pt-1">
            <Logo size="xl" subtitle="Cloud Encrypted Drive" />
          </div>
          <nav className="space-y-0.5">
            {NAV.map(({ label, Icon, active }) => (
              <div key={label} className={cn("v2-side-item", active && "is-active")}>
                <Icon />
                <span>{label}</span>
              </div>
            ))}
          </nav>
          <div className="v2-meter">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-[var(--color-text-secondary)]">
              <span>Storage</span>
              <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
              </span>
            </div>
            <div className="v2-meter-bar">
              <i />
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
              1.29 GB across 2 accounts you own
            </p>
          </div>
        </aside>

        <div className="v2-main">
          <div className="panel v2-topbar" aria-hidden="true">
            <div className="v2-search">
              <Search />
              <span>Search files</span>
              <kbd className="ml-auto rounded border border-[var(--color-border)] px-1.5 text-[10px]">
                ⌘K
              </kbd>
            </div>
            <span className="v2-pill">
              <Lock /> Vault unlocked
            </span>
            <span className="v2-avatar">W</span>
          </div>

          <div className="panel v2-content relative">
            <ExplorerToolbar
              breadcrumb={
                <ExplorerBreadcrumb
                  breadcrumb={[
                    { id: null, name: "My Vault" },
                    { id: "docs", name: "Documents" },
                  ]}
                  onNavigate={() => say("Folders open after sign-up.")}
                  {...noDrag}
                />
              }
              view={view}
              onViewChange={setView}
              gridCols={gridCols}
              onGridColsChange={setGridCols}
              selectMode={selectMode}
              onToggleSelect={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            />
            <div className="mt-3">
              {view === "list" ? (
                <FileTable
                  files={files}
                  downloadStates={{}}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={onSort}
                  onDownload={needsAccount("Download")}
                  onDelete={needsAccount("Delete")}
                  onPreview={needsAccount("Preview")}
                  onShare={needsAccount("Sharing")}
                  selectable={selectMode}
                  selectedIds={selected}
                  onSelect={onSelect}
                  onSelectAll={onSelectAll}
                />
              ) : (
                <div
                  className={cn(
                    "grid gap-3",
                    gridCols === "auto" ? "grid-cols-2 lg:grid-cols-3" : `grid-cols-${gridCols}`,
                  )}
                >
                  {files.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      onDownload={needsAccount("Download")}
                      onDelete={needsAccount("Delete")}
                      onPreview={needsAccount("Preview")}
                      onShare={needsAccount("Sharing")}
                      selectable={selectMode}
                      selected={selected.has(file.id)}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className={cn("v2-demo-hint", hint && "is-on")} role="status">
              {hint}
            </div>
          </div>
        </div>
      </div>
      <div className="v2-frame-glow" aria-hidden="true" />
    </div>
  );
}

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1);
}

export function ExplorerCaption({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-center text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}
