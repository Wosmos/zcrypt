"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadQueue } from "@/components/upload/upload-queue";
import { PlatformSelector } from "@/components/upload/platform-selector";
import { FileCard, type DownloadState } from "@/components/files/file-card";
import { FileTable, type SortField, type SortDir } from "@/components/files/file-table";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { CompactStats } from "@/components/vault/compact-stats";
import { StorageQuota } from "@/components/vault/storage-quota";
import { PlatformHealth } from "@/components/vault/platform-health";
import { ExportImport } from "@/components/vault/export-import";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useUploadStore } from "@/store/upload";
import { usePassphraseStore } from "@/store/passphrase";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { pushFile, pullFile, deleteFile, listIncompleteUploads } from "@/lib/api";
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
} from "lucide-react";
import Link from "next/link";
import { useNotifications } from "@/hooks/useNotifications";
import { FilePreviewModal, useFilePreview } from "@/components/ui/file-preview-modal";

type ModalMode = { type: "upload"; files: File[] } | { type: "download"; filename: string } | { type: "preview"; filename: string } | null;

export default function VaultPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { files, loading, error, refresh } = useFileList();
  const { statuses, repos, isAnyConnected } = usePlatformHealth();
  const { addToQueue, updateStatus, setError, setFileId, addIncomplete } = useUploadStore();
  const { getPassphrase, clear: clearPassphrase } = usePassphraseStore();
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);
  const cacheUntil = usePassphraseStore((s) => s.cacheUntil);
  const getRemainingMinutes = usePassphraseStore((s) => s.getRemainingMinutes);
  const [, forceUpdate] = useState(0);
  const { notify, requestPermission, isSupported, isGranted } = useNotifications();
  const preview = useFilePreview();

  // Tick the passphrase timer display every 30s
  useEffect(() => {
    if (!cachedPassphrase) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, [cachedPassphrase]);

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
    const { queue, findByFileId } = useUploadStore.getState();
    let target = event.file_id ? findByFileId(event.file_id) : undefined;
    if (!target) {
      target = queue.find(
        (i) => i.status !== "done" && i.status !== "failed" && i.status !== "queued" && i.status !== "paused"
      );
    }
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
      const cached = getPassphrase();
      if (cached) {
        startUpload(selectedFiles, cached);
      } else {
        setModalMode({ type: "upload", files: selectedFiles });
        setPassphraseError(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAnyConnected]
  );

  const startUpload = useCallback(
    async (uploadFiles: File[], passphrase: string) => {
      for (const file of uploadFiles) {
        const id = addToQueue(file);
        updateStatus(id, "sending", 0, "Sending to server");

        try {
          const result = await pushFile(file, passphrase, selectedPlatform ?? undefined, (percent) => {
            const { queue } = useUploadStore.getState();
            const item = queue.find((i) => i.id === id);
            if (item && item.status === "sending") {
              updateStatus(id, "sending", percent, "Sending to server");
            }
          });

          const res = result as { file_id?: string; status?: string };
          if (res.file_id) {
            setFileId(id, res.file_id);
            updateStatus(id, "compressing", 65, "Processing on server...");
          } else {
            updateStatus(id, "done", 100, "Done");
            toast.success(`${file.name} uploaded`);
            refresh();
          }
        } catch (err) {
          setError(id, err instanceof Error ? err.message : "Upload failed");
          toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    },
    [selectedPlatform, addToQueue, updateStatus, setError, setFileId, refresh]
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
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this file?")) return;
      try {
        await deleteFile(id);
        toast.success("File deleted");
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [refresh]
  );

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

      try {
        toast.info(`Loading preview...`);
        const blob = await pullFile(filename, passphrase);
        preview.openPreview(blob, filename, file.original_size);
      } catch (err) {
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

      if (modalMode.type === "upload") {
        startUpload(modalMode.files, passphrase);
      } else if (modalMode.type === "download") {
        startDownload(modalMode.filename, passphrase);
      } else {
        startPreview(modalMode.filename, passphrase);
      }
    },
    [modalMode, startUpload, startDownload, startPreview]
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
  };

  const filtered = (search
    ? files.filter((f) => f.original_name.toLowerCase().includes(search.toLowerCase()))
    : files
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
      default: return 0;
    }
  });
  const remainingMinutes = getRemainingMinutes();
  const hasCachedPassphrase = !!cachedPassphrase && !!cacheUntil && Date.now() < cacheUntil;

  const modalSubtitle = modalMode
    ? modalMode.type === "upload"
      ? modalMode.files.length === 1
        ? modalMode.files[0].name
        : `${modalMode.files.length} files selected`
      : modalMode.filename
    : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vault</h1>
          <div className="mt-1.5">
            <CompactStats fileCount={files.length} totalSize={totalSize} totalEncrypted={totalEncrypted} lastUploadDate={lastUploadDate} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasCachedPassphrase && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
              <Lock className="h-3 w-3" />
              <span>{remainingMinutes}m</span>
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
              className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                isGranted
                  ? "text-emerald-500 bg-emerald-500/10"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
              }`}
              title={isGranted ? "Notifications enabled" : "Enable notifications"}
            >
              {isGranted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            </button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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

      {/* Storage & Platform overview */}
      {(repos.length > 0 || statuses.some((s) => s.connected)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StorageQuota repos={repos} />
          <PlatformHealth statuses={statuses} repos={repos} />
        </div>
      )}

      {/* Search + View toggle */}
      {files.length > 0 && (
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="flex rounded-xl border border-[var(--color-border)] overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode("cards")}
              className={`flex items-center justify-center h-[38px] w-9 transition-colors ${
                viewMode === "cards"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
              }`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center justify-center h-[38px] w-9 border-l border-[var(--color-border)] transition-colors ${
                viewMode === "table"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
              }`}
              title="Table view"
            >
              <TableProperties className="h-4 w-4" />
            </button>
          </div>
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
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 && files.length > 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-[var(--color-text-muted)]" />}
          title="No matching files"
          description="Try a different search term"
        />
      ) : files.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-8 w-8 text-[var(--color-text-muted)]" />}
          title="No files yet"
          description="Upload your first file to get started. Files are compressed, encrypted, and stored across your connected platforms."
        />
      ) : viewMode === "table" ? (
        <FileTable
          files={filtered}
          downloadStates={downloadStates}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          onDownload={handleDownloadClick}
          onDelete={handleDelete}
          onPreview={handlePreview}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              downloadState={downloadStates[file.id] || "idle"}
              onDownload={handleDownloadClick}
              onDelete={handleDelete}
              onPreview={handlePreview}
            />
          ))}
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
        confirmLabel={modalMode?.type === "upload" ? "Upload" : modalMode?.type === "preview" ? "Preview" : "Download"}
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
    </div>
  );
}
