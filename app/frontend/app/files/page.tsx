"use client";

import { useCallback, useState } from "react";
import { FileCard } from "@/components/files/file-card";
import { Input } from "@/components/ui/input";
import { useFileList } from "@/hooks/useFileList";
import { pullFile, deleteFile } from "@/lib/api";
import { toast } from "@/store/toast";
import { formatBytes } from "@/lib/utils";
import { Search, Lock, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FilesPage() {
  const [passphrase, setPassphrase] = useState("");
  const [search, setSearch] = useState("");
  const { files, loading, error, refresh } = useFileList();

  const filtered = search
    ? files.filter((f) =>
        f.original_name.toLowerCase().includes(search.toLowerCase())
      )
    : files;

  const totalSize = files.reduce((sum, f) => sum + f.original_size, 0);

  const handleDownload = useCallback(
    async (filename: string) => {
      if (!passphrase) {
        toast.warning("Enter your passphrase to download");
        return;
      }
      try {
        const blob = await pullFile(filename, passphrase);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${filename} downloaded`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Download failed");
      }
    },
    [passphrase]
  );

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

      {/* Search + Passphrase */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="h-4 w-4" />}
        />
        <Input
          type="password"
          placeholder="Passphrase (for downloads)"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
        />
      </div>

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
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
