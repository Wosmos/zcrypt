"use client";

import { useState, useMemo } from "react";
import { FileCard, type DownloadState } from "@/components/files/file-card";
import { FileTable, type SortField, type SortDir } from "@/components/files/file-table";
import { FileTypeFilter } from "@/components/files/file-type-filter";
import { MobileVaultHeader } from "@/components/vault/mobile-vault-header";
import { CompactStats } from "@/components/vault/compact-stats";
import { UploadZone } from "@/components/upload/upload-zone";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/store/toast";
import type { FileMetadata, QuotaInfo, RepoInfo } from "@/types";
import { cn, getFileCategory } from "@/lib/utils";
import {
  Shield,
  Search,
  Info,
  LayoutGrid,
  TableProperties,
  CheckSquare,
  Lock,
} from "lucide-react";

const PAGE_SIZE = 12;

// ── Mock data (mirrors real vault) ───────────────────────────────
const MOCK_FILES: FileMetadata[] = [
  {
    id: "f1",
    original_name: "project-backup-2026.tar.gz",
    original_size: 2_453_000_000,
    compressed_size: 1_842_000_000,
    encrypted_size: 1_845_600_000,
    chunk_count: 18,
    sha256: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "f2",
    original_name: "photos-collection-2025.zip",
    original_size: 8_120_000_000,
    compressed_size: 7_980_000_000,
    encrypted_size: 7_985_000_000,
    chunk_count: 62,
    sha256: "b2c3d4e5f6a78901bcdef1234567890abcdef1234567890abcdef1234567890a",
    created_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
  },
  {
    id: "f3",
    original_name: "database-dump-prod.sql",
    original_size: 512_000_000,
    compressed_size: 201_000_000,
    encrypted_size: 202_400_000,
    chunk_count: 2,
    sha256: "c3d4e5f6a7b89012cdef1234567890abcdef1234567890abcdef1234567890ab",
    created_at: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f4",
    original_name: "design-assets-v4.fig",
    original_size: 340_000_000,
    compressed_size: 318_000_000,
    encrypted_size: 319_500_000,
    chunk_count: 3,
    sha256: "d4e5f6a7b8c90123def1234567890abcdef1234567890abcdef1234567890abc",
    created_at: new Date(Date.now() - 5 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f5",
    original_name: "client-presentation-q1.pptx",
    original_size: 128_000_000,
    compressed_size: 119_000_000,
    encrypted_size: 119_800_000,
    chunk_count: 1,
    sha256: "e5f6a7b8c9d01234ef1234567890abcdef1234567890abcdef1234567890abcd",
    created_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f6",
    original_name: "kubernetes-manifests.yaml",
    original_size: 3_200_000,
    compressed_size: 1_100_000,
    encrypted_size: 1_150_000,
    chunk_count: 1,
    sha256: "f6a7b8c9d0e12345f01234567890abcdef1234567890abcdef1234567890abcde",
    created_at: new Date(Date.now() - 8 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f7",
    original_name: "family-videos-2025.mp4",
    original_size: 4_800_000_000,
    compressed_size: 4_780_000_000,
    encrypted_size: 4_785_000_000,
    chunk_count: 48,
    sha256: "a7b8c9d0e1f23456012345678901bcdef1234567890abcdef1234567890abcdef",
    created_at: new Date(Date.now() - 10 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f8",
    original_name: "ssh-keys-backup.tar.gz",
    original_size: 45_000,
    compressed_size: 38_000,
    encrypted_size: 42_000,
    chunk_count: 1,
    sha256: "b8c9d0e1f2a34567123456789012cdef1234567890abcdef1234567890abcdef0",
    created_at: new Date(Date.now() - 14 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f9",
    original_name: "annual-report-2026.pdf",
    original_size: 24_600_000,
    compressed_size: 22_100_000,
    encrypted_size: 22_300_000,
    chunk_count: 1,
    sha256: "c9d0e1f2a3b45678234567890123def1234567890abcdef1234567890abcdef01",
    created_at: new Date(Date.now() - 1 * 3600_000).toISOString(),
  },
  {
    id: "f10",
    original_name: "app-screenshot.png",
    original_size: 5_400_000,
    compressed_size: 5_300_000,
    encrypted_size: 5_350_000,
    chunk_count: 1,
    sha256: "d0e1f2a3b4c56789345678901234ef1234567890abcdef1234567890abcdef012",
    created_at: new Date(Date.now() - 12 * 3600_000).toISOString(),
  },
];

const MOCK_QUOTA: QuotaInfo = {
  used_bytes: MOCK_FILES.reduce((s, f) => s + f.original_size, 0),
  quota_bytes: 50_000_000_000,
  has_personal_key: true,
  is_unlimited: false,
  plan: "pro",
  max_concurrent_uploads: 3,
};

const MOCK_REPOS: RepoInfo[] = [
  {
    id: "r1",
    platform: "huggingface",
    name: "zpush-vault-01",
    url: "https://huggingface.co/datasets/user/zpush-vault-01",
    used_bytes: 12_400_000_000,
    max_bytes: 280_000_000_000,
    active: true,
  },
  {
    id: "r2",
    platform: "huggingface",
    name: "zpush-vault-02",
    url: "https://huggingface.co/datasets/user/zpush-vault-02",
    used_bytes: 4_000_000_000,
    max_bytes: 280_000_000_000,
    active: true,
  },
];

// ── Demo page (read-only mirror of real vault) ───────────────────
export default function DemoClient() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const files = MOCK_FILES;

  // Block all mutating actions
  const readOnlyToast = () => toast.info("Read-only demo mode");
  const readOnlyFiles = (_files: File[]) => readOnlyToast();
  const readOnlyStr = (_s: string) => readOnlyToast();

  const totalSize = files.reduce((sum, f) => sum + f.original_size, 0);
  const totalEncrypted = files.reduce((sum, f) => sum + f.encrypted_size, 0);
  const lastUploadDate = files.reduce(
    (latest, f) => (f.created_at > latest ? f.created_at : latest),
    files[0].created_at,
  );

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    return (
      search
        ? files.filter((f) =>
            f.original_name.toLowerCase().includes(search.toLowerCase()),
          )
        : files
    )
      .filter((f) =>
        typeFilter ? getFileCategory(f.original_name) === typeFilter : true,
      )
      .slice()
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortField) {
          case "name":
            return dir * a.original_name.localeCompare(b.original_name);
          case "size":
            return dir * (a.original_size - b.original_size);
          case "saved": {
            const sa =
              a.original_size > 0
                ? 1 - a.encrypted_size / a.original_size
                : 0;
            const sb =
              b.original_size > 0
                ? 1 - b.encrypted_size / b.original_size
                : 0;
            return dir * (sa - sb);
          }
          case "date":
            return (
              dir *
              (new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime())
            );
          case "type":
            return (
              dir *
              getFileCategory(a.original_name).localeCompare(
                getFileCategory(b.original_name),
              )
            );
          default:
            return 0;
        }
      });
  }, [files, search, typeFilter, sortField, sortDir]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleTypeFilter = (category: string | null) => {
    setTypeFilter(category);
    setCurrentPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFiles = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const downloadStates: Record<string, DownloadState> = {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Demo banner */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
        <Info className="h-4 w-4 text-sky-500 shrink-0" />
        <p className="text-xs text-sky-600 dark:text-sky-300 font-medium">
          Demo mode — all data is simulated. Uploads, downloads and deletes are
          disabled.
        </p>
      </div>

      {/* Header — matches real vault */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/20">
              <Shield className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">
                Encrypted Storage
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                My Vault
              </h1>
            </div>
          </div>
          <CompactStats
            fileCount={files.length}
            totalSize={totalSize}
            totalEncrypted={totalEncrypted}
            lastUploadDate={lastUploadDate}
            quotaInfo={MOCK_QUOTA}
          />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-2.5 py-1.5 rounded-lg">
            <Lock className="h-3 w-3" />
            <span className="hidden sm:inline">25m</span>
          </div>
        </div>
      </div>

      {/* Upload zone (read-only) */}
      <UploadZone
        onFiles={readOnlyFiles}
        hint="Read-only demo — uploads are disabled"
      />

      {/* Mobile vault header */}
      <MobileVaultHeader
        files={files}
        quotaInfo={MOCK_QUOTA}
        repos={MOCK_REPOS}
        isUnlocked={true}
        onUnlock={readOnlyToast}
        onCategoryClick={handleTypeFilter}
        activeCategory={typeFilter}
      />

      {/* Search + View toggle */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              icon={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() =>
                selectionMode
                  ? (setSelectionMode(false), setSelectedIds(new Set()))
                  : setSelectionMode(true)
              }
              className={cn(
                "flex items-center gap-1.5 h-[38px] px-3 rounded-xl border text-[12px] font-medium transition-colors",
                selectionMode
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]",
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Select</span>
            </button>

            <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              {(
                [
                  {
                    mode: "grid" as const,
                    icon: LayoutGrid,
                    title: "Grid",
                  },
                  {
                    mode: "table" as const,
                    icon: TableProperties,
                    title: "Table",
                  },
                ] as const
              ).map(({ mode, icon: ModeIcon, title }, i) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "flex items-center justify-center h-[38px] w-9 transition-colors",
                    i > 0 && "border-l border-[var(--color-border)]",
                    viewMode === mode
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]",
                  )}
                  title={title}
                >
                  <ModeIcon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <FileTypeFilter
          files={
            search
              ? files.filter((f) =>
                  f.original_name
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
              : files
          }
          activeFilter={typeFilter}
          onFilter={handleTypeFilter}
        />
      </div>

      {/* File list */}
      {filtered.length === 0 && files.length > 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-[var(--color-text-muted)]" />}
          title="No matching files"
          description={
            typeFilter
              ? `No ${typeFilter.toLowerCase()} files found${search ? ` matching "${search}"` : ""}`
              : "Try a different search term"
          }
        />
      ) : viewMode === "table" ? (
        <>
          <FileTable
            files={paginatedFiles}
            downloadStates={downloadStates}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onDownload={readOnlyStr}
            onDelete={readOnlyStr}
            onPreview={readOnlyStr}
            selectable={selectionMode}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onSelectAll={() => {}}
          />
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </>
      ) : (
        <>
          <div>
            {/* Mobile: compact list */}
            <div className="space-y-1.5 md:hidden">
              {paginatedFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  downloadState={downloadStates[file.id] || "idle"}
                  onDownload={readOnlyStr}
                  onDelete={readOnlyStr}
                  onPreview={readOnlyStr}
                  selectable={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
            {/* Desktop: grid */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  downloadState={downloadStates[file.id] || "idle"}
                  onDownload={readOnlyStr}
                  onDelete={readOnlyStr}
                  onPreview={readOnlyStr}
                  selectable={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
