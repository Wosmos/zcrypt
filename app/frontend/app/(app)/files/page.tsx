"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileCard, DownloadState } from "@/components/files/file-card";
import { Input } from "@/components/ui/input";
import { useFileList } from "@/hooks/useFileList";
import { pullFile, deleteFile } from "@/lib/api";
import { toast } from "@/store/toast";
import { formatBytes } from "@/lib/utils";
import { Search, Lock, FolderOpen, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FilesPage() {
  const [search, setSearch] = useState("");
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const [pendingDownload, setPendingDownload] = useState<string | null>(null);
  const [modalPassphrase, setModalPassphrase] = useState("");
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const { files, loading, error, refresh } = useFileList();

  // Focus passphrase input when modal opens
  useEffect(() => {
    if (pendingDownload && passphraseInputRef.current) {
      setTimeout(() => passphraseInputRef.current?.focus(), 50);
    }
  }, [pendingDownload]);

  const filtered = search
    ? files.filter((f) =>
        f.original_name.toLowerCase().includes(search.toLowerCase())
      )
    : files;

  const totalSize = files.reduce((sum, f) => sum + f.original_size, 0);

  const setFileDownloadState = useCallback((id: string, state: DownloadState) => {
    setDownloadStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const handleDownloadClick = useCallback(
    (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;
      if (downloadStates[file.id] === "downloading") return;

      setPendingDownload(filename);
      setModalPassphrase("");
    },
    [files, downloadStates]
  );

  const startDownload = useCallback(
    async (filename: string, passphrase: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;

      setFileDownloadState(file.id, "downloading");
      toast.info(`Downloading ${filename}...`);

      try {
        const blob = await pullFile(filename, passphrase);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        setFileDownloadState(file.id, "done");
        toast.success(`${filename} downloaded`);

        setTimeout(() => setFileDownloadState(file.id, "idle"), 3000);
      } catch (err) {
        setFileDownloadState(file.id, "idle");
        toast.error(err instanceof Error ? err.message : "Download failed");
      }
    },
    [files, setFileDownloadState]
  );

  const handleModalConfirm = useCallback(() => {
    if (!modalPassphrase) {
      toast.warning("Enter your passphrase");
      return;
    }
    if (!pendingDownload) return;

    const filename = pendingDownload;
    setPendingDownload(null);
    startDownload(filename, modalPassphrase);
  }, [modalPassphrase, pendingDownload, startDownload]);

  const handleModalClose = useCallback(() => {
    setPendingDownload(null);
    setModalPassphrase("");
  }, []);

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Files
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {files.length} file{files.length !== 1 ? "s" : ""} —{" "}
            {formatBytes(totalSize)} total
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refresh()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Search */}
      <Input
        type="text"
        placeholder="Search files..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        icon={<Search className="h-4 w-4" />}
      />

      {/* Error */}
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
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)] mb-5">
            <FolderOpen className="h-8 w-8 text-[var(--color-text-muted)]" />
          </div>
          <h3 className="text-lg font-semibold">
            {search ? "No matching files" : "No files yet"}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
            {search
              ? "Try a different search term"
              : "Upload your first file to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              downloadState={downloadStates[file.id] || "idle"}
              onDownload={handleDownloadClick}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Passphrase modal — portaled to body */}
      {pendingDownload && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={handleModalClose}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Enter Passphrase</h3>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[240px]">
                    {pendingDownload}
                  </p>
                </div>
              </div>
              <button
                onClick={handleModalClose}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleModalConfirm();
              }}
            >
              <div className="relative">
                <input
                  ref={passphraseInputRef}
                  type="password"
                  placeholder="Your encryption passphrase"
                  value={modalPassphrase}
                  onChange={(e) => setModalPassphrase(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all"
                  autoComplete="off"
                />
              </div>

              <div className="flex gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!modalPassphrase}
                  className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Download
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
