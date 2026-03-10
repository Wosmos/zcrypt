"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadQueue } from "@/components/upload/upload-queue";
import { PlatformSelector } from "@/components/upload/platform-selector";
import { FileCard, type DownloadState } from "@/components/files/file-card";
import { FileTable, type SortField, type SortDir } from "@/components/files/file-table";
import { FileTypeFilter } from "@/components/files/file-type-filter";
import { MobileVaultHeader } from "@/components/vault/mobile-vault-header";
import { UploadFAB } from "@/components/vault/upload-fab";
import { InsightsTab } from "@/components/vault/insights-tab";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CompactStats } from "@/components/vault/compact-stats";
import { StorageQuota } from "@/components/vault/storage-quota";
import { UserQuota } from "@/components/vault/user-quota";
import { PlatformHealth } from "@/components/vault/platform-health";
import { ExportImport } from "@/components/vault/export-import";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { batchLoadThumbnails } from "@/hooks/useThumbnail";
import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useUploadStore } from "@/store/upload";
import { usePassphraseStore } from "@/store/passphrase";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { pullFile, deleteFile, listIncompleteUploads, getQuota } from "@/lib/api";
import { toast } from "@/store/toast";
import {
  Shield,
  Search,
  AlertTriangle,
  Lock,
  RefreshCw,
  X,
  Bell,
  BellOff,
  LayoutGrid,
  TableProperties,
  CheckSquare,
  Square,
  Trash2,
  Download,
  BarChart3,
} from "lucide-react";
import { cn, formatBytes, getFileCategory } from "@/lib/utils";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";
import { FilePreviewModal, useFilePreview } from "@/components/ui/file-preview-modal";
import type { QuotaInfo, FileMetadata } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmModal } from "@/components/ui/confirm-modal";

const PAGE_SIZE = 12;

type ModalMode = { type: "upload"; files: File[] } | { type: "download"; filename: string } | { type: "preview"; filename: string } | { type: "bulk-download" } | { type: "unlock" } | null;

export default function VaultPage() {
  const [activeTab, setActiveTab] = useState<"files" | "insights">("files");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const { files, loading, error, refresh } = useFileList();
  const { statuses, repos, isAnyConnected } = usePlatformHealth();
  const { updateStatus, setError, addIncomplete, startUpload: storeStartUpload } = useUploadStore();
  const { getPassphrase, clear: clearPassphrase } = usePassphraseStore();
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);
  const cacheUntil = usePassphraseStore((s) => s.cacheUntil);
  const getRemainingMinutes = usePassphraseStore((s) => s.getRemainingMinutes);
  const [, forceUpdate] = useState(0);
  const { notify, requestPermission, isSupported, isGranted } = useNotifications();
  const preview = useFilePreview();
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState<{ totalSize: number; remaining: number } | null>(null);

  // Fetch quota info
  useEffect(() => {
    getQuota().then(setQuotaInfo).catch(() => {});
  }, []);

  // Tick the passphrase timer display every 30s
  useEffect(() => {
    if (!cachedPassphrase) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, [cachedPassphrase]);

  // Auto-load thumbnails when passphrase is cached and files are available
  useEffect(() => {
    const pp = getPassphrase();
    if (pp && files.length > 0) {
      batchLoadThumbnails(files, pp).catch(() => {});
    }
  }, [files, getPassphrase]);

  // Load incomplete uploads on mount
  useEffect(() => {
    listIncompleteUploads()
      .then((uploads) => {
        for (const u of uploads) {
          addIncomplete(u.file_id, u.original_name, u.original_size, u.total_chunks, u.pending_chunks, u.active);
        }
      })
      .catch(() => {});
  }, [addIncomplete]);

  // SSE events from backend pipeline
  useOperationStatus((event) => {
    if (!event.file_id) return;
    const { findByFileId } = useUploadStore.getState();
    const target = findByFileId(event.file_id);
    if (!target) return;

    const stageLower = event.stage.toLowerCase();
    if (stageLower.startsWith("error:")) {
      const errorMsg = event.stage.substring(7);
      setError(target.id, errorMsg);
      return;
    }

    const status =
      stageLower === "done"
        ? ("done" as const)
        : stageLower.includes("compress")
          ? ("compressing" as const)
          : stageLower.includes("encrypt")
            ? ("encrypting" as const)
            : ("uploading" as const);
    updateStatus(target.id, status, event.percent, event.stage, event.bytes_processed, event.total_bytes);
    if (stageLower === "done") {
      refresh();
      notify(`Upload complete`, { body: target.file.name, tag: "upload-done" });
    }
  });

  // --- Upload flow ---
  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      if (!isAnyConnected) {
        toast.warning("Connect a platform in Settings first");
        return;
      }

      const dupes: string[] = [];
      const uniqueFiles = selectedFiles.filter((f) => {
        const exists = files.some((existing) => existing.original_name === f.name && existing.original_size === f.size);
        if (exists) dupes.push(f.name);
        return !exists;
      });

      if (dupes.length > 0) {
        const names = dupes.length <= 3 ? dupes.join(", ") : `${dupes.slice(0, 3).join(", ")} +${dupes.length - 3} more`;
        toast.warning(`Skipped ${dupes.length} duplicate${dupes.length > 1 ? "s" : ""}: ${names}`);
      }

      if (uniqueFiles.length === 0) return;

      if (quotaInfo && !quotaInfo.is_unlimited && quotaInfo.quota_bytes > 0) {
        const totalUploadSize = uniqueFiles.reduce((sum, f) => sum + f.size, 0);
        const remaining = quotaInfo.quota_bytes - quotaInfo.used_bytes;
        if (totalUploadSize > remaining) {
          setQuotaExceeded({ totalSize: totalUploadSize, remaining: Math.max(0, remaining) });
          return;
        }
      }
      const cached = getPassphrase();
      if (cached) {
        startUpload(uniqueFiles, cached);
      } else {
        setModalMode({ type: "upload", files: uniqueFiles });
        setPassphraseError(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAnyConnected, quotaInfo, files]
  );

  const startUpload = useCallback(
    (uploadFiles: File[], passphrase: string) => {
      const maxConcurrent = quotaInfo?.max_concurrent_uploads ?? 2;
      storeStartUpload(uploadFiles, passphrase, selectedPlatform ?? undefined, maxConcurrent, refresh);
    },
    [selectedPlatform, storeStartUpload, refresh, quotaInfo]
  );

  // --- Download flow ---
  const handleDownloadClick = useCallback(
    (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file || downloadStates[file.id] === "downloading") return;

      const cached = getPassphrase();
      if (cached) {
        startDownload(filename, cached);
      } else {
        setModalMode({ type: "download", filename });
        setPassphraseError(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, downloadStates]
  );

  const startDownload = useCallback(
    async (filename: string, passphrase: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;

      setDownloadStates((prev) => ({ ...prev, [file.id]: "downloading" }));
      toast.info(`Downloading ${filename}...`);

      try {
        const blob = await pullFile(filename, passphrase);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        setDownloadStates((prev) => ({ ...prev, [file.id]: "done" }));
        toast.success(`${filename} downloaded`);
        setTimeout(() => setDownloadStates((prev) => ({ ...prev, [file.id]: "idle" })), 3000);
      } catch (err) {
        setDownloadStates((prev) => ({ ...prev, [file.id]: "idle" }));
        const msg = err instanceof Error ? err.message : "Download failed";
        if (msg.toLowerCase().includes("decrypt") || msg.toLowerCase().includes("passphrase") || msg.toLowerCase().includes("cipher")) {
          clearPassphrase();
          setModalMode({ type: "download", filename });
          setPassphraseError("Incorrect passphrase. Please try again.");
        } else {
          toast.error(msg);
        }
      }
    },
    [files, clearPassphrase]
  );

  // --- Delete ---
  const handleDeleteClick = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) setDeleteTarget(file);
    },
    [files]
  );

  const executeDelete = useCallback(
    async () => {
      if (!deleteTarget) return;
      setDeleting(true);
      try {
        await deleteFile(deleteTarget.id);
        toast.success("File deleted");
        setDeleteTarget(null);
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleting(false);
      }
    },
    [deleteTarget, refresh]
  );

  // --- Bulk operations ---
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = new Set(filtered.map((f) => f.id));
    setSelectedIds((prev) => {
      if (filtered.every((f) => prev.has(f.id))) return new Set();
      return allIds;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, search, typeFilter, sortField, sortDir]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const executeBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await deleteFile(id);
        deleted++;
      } catch {
        // continue with next
      }
    }
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
    toast.success(`Deleted ${deleted} file${deleted !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setSelectionMode(false);
    refresh();
  }, [selectedIds, refresh]);

  const startBulkDownload = useCallback((passphrase: string) => {
    const filesToDownload = files.filter((f) => selectedIds.has(f.id));
    for (const file of filesToDownload) {
      startDownload(file.original_name, passphrase);
    }
    exitSelectionMode();
  }, [files, selectedIds, startDownload, exitSelectionMode]);

  const handleBulkDownload = useCallback(() => {
    const cached = getPassphrase();
    if (cached) {
      startBulkDownload(cached);
    } else {
      setModalMode({ type: "bulk-download" });
      setPassphraseError(null);
    }
  }, [getPassphrase, startBulkDownload]);

  // --- Unlock vault (trigger thumbnail batch load) ---
  const handleUnlock = useCallback(() => {
    const cached = getPassphrase();
    if (cached) {
      // Already unlocked — trigger batch load with cached passphrase
      batchLoadThumbnails(files, cached).catch(() => {});
    } else {
      setModalMode({ type: "unlock" });
      setPassphraseError(null);
    }
  }, [getPassphrase, files]);

  // --- Preview ---
  const handlePreview = useCallback(
    (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;

      const cached = getPassphrase();
      if (cached) {
        startPreview(filename, cached);
      } else {
        setModalMode({ type: "preview", filename });
        setPassphraseError(null);
      }
    },
    [files, getPassphrase]
  );

  const startPreview = useCallback(
    async (filename: string, passphrase: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;

      preview.openPreview(null, filename, file.original_size);

      try {
        const blob = await pullFile(filename, passphrase);
        preview.openPreview(blob, filename, file.original_size);
      } catch (err) {
        preview.closePreview();
        const msg = err instanceof Error ? err.message : "Preview failed";
        if (msg.toLowerCase().includes("decrypt") || msg.toLowerCase().includes("passphrase") || msg.toLowerCase().includes("cipher")) {
          clearPassphrase();
          setModalMode({ type: "preview", filename });
          setPassphraseError("Incorrect passphrase. Please try again.");
        } else {
          toast.error(msg);
        }
      }
    },
    [files, clearPassphrase, preview]
  );

  // --- Modal handler ---
  const handleModalConfirm = useCallback(
    (passphrase: string) => {
      if (!modalMode) return;
      setModalMode(null);
      setPassphraseError(null);

      // Always batch-load thumbnails in background when passphrase is entered
      batchLoadThumbnails(files, passphrase).catch(() => {});

      if (modalMode.type === "upload") {
        startUpload(modalMode.files, passphrase);
      } else if (modalMode.type === "download") {
        startDownload(modalMode.filename, passphrase);
      } else if (modalMode.type === "bulk-download") {
        startBulkDownload(passphrase);
      } else if (modalMode.type === "unlock") {
        // Unlock mode: thumbnails already started loading above
      } else {
        startPreview(modalMode.filename, passphrase);
      }
    },
    [modalMode, files, startUpload, startDownload, startPreview, startBulkDownload]
  );

  // --- Computed ---
  const totalSize = files.reduce((sum, f) => sum + f.original_size, 0);
  const totalEncrypted = files.reduce((sum, f) => sum + f.encrypted_size, 0);
  const lastUploadDate = files.length > 0
    ? files.reduce((latest, f) => (f.created_at > latest ? f.created_at : latest), files[0].created_at)
    : undefined;
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  // Apply search + type filter + sort
  const filtered = (search
    ? files.filter((f) => f.original_name.toLowerCase().includes(search.toLowerCase()))
    : files
  ).filter((f) => typeFilter ? getFileCategory(f.original_name) === typeFilter : true
  ).slice().sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortField) {
      case "name": return dir * a.original_name.localeCompare(b.original_name);
      case "size": return dir * (a.original_size - b.original_size);
      case "saved": {
        const sa = a.original_size > 0 ? (1 - a.encrypted_size / a.original_size) : 0;
        const sb = b.original_size > 0 ? (1 - b.encrypted_size / b.original_size) : 0;
        return dir * (sa - sb);
      }
      case "date": return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "type": return dir * getFileCategory(a.original_name).localeCompare(getFileCategory(b.original_name));
      default: return 0;
    }
  });

  // Reset type filter when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleTypeFilter = (category: string | null) => {
    setTypeFilter(category);
    setCurrentPage(1);
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFiles = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const remainingMinutes = getRemainingMinutes();
  const hasCachedPassphrase = !!cachedPassphrase && !!cacheUntil && Date.now() < cacheUntil;

  const modalSubtitle = modalMode
    ? modalMode.type === "upload"
      ? modalMode.files.length === 1
        ? modalMode.files[0].name
        : `${modalMode.files.length} files selected`
      : modalMode.type === "bulk-download"
        ? `${selectedIds.size} files selected`
        : modalMode.type === "unlock"
          ? "Unlock to view encrypted thumbnails"
          : modalMode.type === "download" || modalMode.type === "preview"
            ? modalMode.filename
            : undefined
    : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/20">
              <Shield className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Encrypted Storage</p>
                {quotaInfo && (
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                    quotaInfo.plan === "pro"
                      ? "bg-violet-500/15 text-violet-500"
                      : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)]"
                  )}>
                    {quotaInfo.plan}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">My Vault</h1>
            </div>
          </div>
          <CompactStats fileCount={files.length} totalSize={totalSize} totalEncrypted={totalEncrypted} lastUploadDate={lastUploadDate} quotaInfo={quotaInfo} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {hasCachedPassphrase && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent)] bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-2.5 py-1.5 rounded-lg">
              <Lock className="h-3 w-3" />
              <span className="hidden sm:inline">{remainingMinutes}m</span>
              <button
                onClick={clearPassphrase}
                className="ml-0.5 hover:text-red-400 transition-colors"
                title="Clear cached passphrase"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {isSupported && (
            <button
              onClick={requestPermission}
              className={cn(
                "flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
                isGranted
                  ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
              )}
              title={isGranted ? "Notifications enabled" : "Enable notifications"}
            >
              {isGranted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refresh()} className="h-9 w-9 p-0">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface-1)] w-fit">
        {([
          { id: "files" as const, label: "Files", icon: Shield },
          { id: "insights" as const, label: "Insights", icon: BarChart3 },
        ]).map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === id
                ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            <TabIcon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "insights" ? (
        <InsightsTab files={files} repos={repos} quotaInfo={quotaInfo} />
      ) : (
      <>

      {/* No platform warning */}
      {!isAnyConnected && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              No platform connected
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
              <Link
                href="/settings"
                className="underline hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
              >
                Go to Settings
              </Link>{" "}
              to connect a platform before uploading.
            </p>
          </div>
        </div>
      )}

      {/* Upload zone */}
      <div className="space-y-3">
        <UploadZone
          onFiles={handleFilesSelected}
          hint={
            !isAnyConnected
              ? "Connect a platform in Settings first"
              : hasCachedPassphrase
                ? "Passphrase cached — drop files to upload instantly"
                : undefined
          }
        />
        <PlatformSelector
          statuses={statuses}
          selected={selectedPlatform}
          onSelect={setSelectedPlatform}
        />
      </div>

      {/* Upload queue */}
      <UploadQueue />

      {/* Quota, Storage & Platform overview */}
      {(repos.length > 0 || statuses.some((s) => s.connected) || quotaInfo) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotaInfo && <UserQuota quota={quotaInfo} />}
          <StorageQuota repos={repos} />
          <PlatformHealth statuses={statuses} repos={repos} />
        </div>
      )}


      {/* Search + View toggle + Select */}
      {files.length > 0 && (
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
              {/* Select toggle */}
              <button
                onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                className={cn(
                  "flex items-center gap-1.5 h-[38px] px-3 rounded-xl border text-[12px] font-medium transition-colors",
                  selectionMode
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Select</span>
              </button>

              {/* View mode toggle */}
              <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {([
                  { mode: "grid" as const, icon: LayoutGrid, title: "Grid" },
                  { mode: "table" as const, icon: TableProperties, title: "Table" },
                ]).map(({ mode, icon: ModeIcon, title }, i) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "flex items-center justify-center h-[38px] w-9 transition-colors",
                      i > 0 && "border-l border-[var(--color-border)]",
                      viewMode === mode
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
                    )}
                    title={title}
                  >
                    <ModeIcon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* File type filter chips */}
          <FileTypeFilter
            files={search ? files.filter((f) => f.original_name.toLowerCase().includes(search.toLowerCase())) : files}
            activeFilter={typeFilter}
            onFilter={handleTypeFilter}
          />
        </div>
      )}

      {/* Backend error */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="text-sm text-red-600 dark:text-red-300">
            {error} — is the backend running on :8080?
          </div>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <>
          {/* Mobile skeleton */}
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
          {/* Desktop skeleton */}
          <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-0 overflow-hidden">
                <Skeleton className="h-[130px] w-full" />
                <div className="p-3.5 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : filtered.length === 0 && files.length > 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-[var(--color-text-muted)]" />}
          title="No matching files"
          description={typeFilter ? `No ${typeFilter.toLowerCase()} files found${search ? ` matching "${search}"` : ""}` : "Try a different search term"}
        />
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-8 w-8 text-[var(--color-text-muted)]" />}
          title="No files yet"
          description="Upload your first file to get started. Files are compressed, encrypted, and stored across your connected platforms."
        />
      ) : viewMode === "table" ? (
        <>
          <FileTable
            files={paginatedFiles}
            downloadStates={downloadStates}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onDownload={handleDownloadClick}
            onDelete={handleDeleteClick}
            onPreview={handlePreview}
            selectable={selectionMode}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onSelectAll={selectAll}
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
            {/* Mobile: compact list layout */}
            <div className="space-y-1.5 md:hidden">
              {paginatedFiles.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  downloadState={downloadStates[file.id] || "idle"}
                  onDownload={handleDownloadClick}
                  onDelete={handleDeleteClick}
                  onPreview={handlePreview}
                  selectable={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
            {/* Desktop: grid layout */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                downloadState={downloadStates[file.id] || "idle"}
                onDownload={handleDownloadClick}
                onDelete={handleDeleteClick}
                onPreview={handlePreview}
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

      {/* Bulk selection floating bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl backdrop-blur-sm">
            <span className="text-sm font-medium tabular-nums">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <button
              onClick={selectAll}
              className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-2 py-1 rounded-lg hover:bg-[var(--color-surface-1)] transition-colors"
            >
              {filtered.every((f) => selectedIds.has(f.id)) ? (
                <><Square className="h-3.5 w-3.5" /> Deselect</>
              ) : (
                <><CheckSquare className="h-3.5 w-3.5" /> All</>
              )}
            </button>
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <button
              onClick={handleBulkDownload}
              className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-accent)] px-2 py-1.5 rounded-lg hover:bg-[var(--color-accent)]/10 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="flex items-center gap-1 text-[12px] font-medium text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <div className="w-px h-5 bg-[var(--color-border)]" />
            <button
              onClick={exitSelectionMode}
              className="flex items-center justify-center h-7 w-7 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Vault backup */}
      {files.length > 0 && <ExportImport files={files} />}

      {/* Shared passphrase modal */}
      <PassphraseModal
        open={!!modalMode}
        onConfirm={handleModalConfirm}
        onClose={() => { setModalMode(null); setPassphraseError(null); }}
        title="Enter Passphrase"
        subtitle={modalSubtitle}
        confirmLabel={modalMode?.type === "upload" ? "Upload" : modalMode?.type === "unlock" ? "Unlock" : modalMode?.type === "preview" ? "Preview" : "Download"}
        error={passphraseError}
      />

      {/* File preview modal */}
      <FilePreviewModal
        open={preview.open}
        onClose={preview.closePreview}
        blob={preview.blob}
        filename={preview.filename}
        fileSize={preview.fileSize}
      />

      {/* Confirm delete modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onConfirm={executeDelete}
        onClose={() => setDeleteTarget(null)}
        title="Delete File"
        description="This file will be permanently deleted from all storage platforms. This action cannot be undone."
        details={deleteTarget?.original_name}
        confirmLabel="Delete File"
        variant="danger"
        loading={deleting}
      />

      {/* Bulk delete confirm */}
      <ConfirmModal
        open={showBulkDeleteConfirm}
        onConfirm={executeBulkDelete}
        onClose={() => setShowBulkDeleteConfirm(false)}
        title="Delete Selected Files"
        description={`${selectedIds.size} file${selectedIds.size !== 1 ? "s" : ""} will be permanently deleted from all storage platforms. This action cannot be undone.`}
        confirmLabel={`Delete ${selectedIds.size} File${selectedIds.size !== 1 ? "s" : ""}`}
        variant="danger"
        loading={bulkDeleting}
      />

      {/* Mobile upload FAB */}
      {isAnyConnected && <UploadFAB onFiles={handleFilesSelected} />}

      {/* Storage quota exceeded modal */}
      <ConfirmModal
        open={!!quotaExceeded}
        onConfirm={() => setQuotaExceeded(null)}
        onClose={() => setQuotaExceeded(null)}
        title="Storage Quota Exceeded"
        description={
          quotaExceeded
            ? `The selected files (${formatBytes(quotaExceeded.totalSize)}) exceed your available storage (${formatBytes(quotaExceeded.remaining)} remaining). Delete some files or contact an admin to increase your quota.`
            : ""
        }
        confirmLabel="OK"
        cancelLabel="Close"
        variant="warning"
      />
      </>
      )}
    </div>
  );
}
