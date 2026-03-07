"use client";

import { useCallback, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadQueue } from "@/components/upload/upload-queue";
import { FileCard } from "@/components/files/file-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useUploadStore } from "@/store/upload";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { pushFile, pullFile, deleteFile } from "@/lib/api";
import { toast } from "@/store/toast";
import { formatBytes } from "@/lib/utils";
import {
  Shield,
  HardDrive,
  Layers,
  Lock,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";

export default function Dashboard() {
  const [passphrase, setPassphrase] = useState("");
  const { files, refresh } = useFileList();
  const { isAnyConnected } = usePlatformHealth();
  const { addToQueue, updateStatus, setError } = useUploadStore();

  useOperationStatus((event) => {
    const { queue } = useUploadStore.getState();
    const active = queue.find(
      (i) =>
        i.status !== "done" && i.status !== "failed" && i.status !== "queued"
    );
    if (active) {
      const status =
        event.stage === "done" ? ("done" as const) : ("uploading" as const);
      updateStatus(active.id, status, event.percent, event.stage);
      if (event.stage === "done") refresh();
    }
  });

  const handleUpload = useCallback(
    async (uploadFiles: File[]) => {
      if (!passphrase) {
        toast.warning("Enter a passphrase first");
        return;
      }
      if (!isAnyConnected) {
        toast.warning("Connect a platform in Settings first");
        return;
      }

      for (const file of uploadFiles) {
        const id = addToQueue(file);
        updateStatus(id, "compressing", 0, "Starting...");

        try {
          await pushFile(file, passphrase);
          updateStatus(id, "done", 100, "Done");
          toast.success(`${file.name} uploaded successfully`);
          refresh();
        } catch (err) {
          setError(id, err instanceof Error ? err.message : "Upload failed");
          toast.error(
            `Failed to upload ${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }
    },
    [passphrase, isAnyConnected, addToQueue, updateStatus, setError, refresh]
  );

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
        toast.error(
          err instanceof Error ? err.message : "Download failed"
        );
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

  const totalSize = files.reduce((sum, f) => sum + f.original_size, 0);
  const totalEncrypted = files.reduce((sum, f) => sum + f.encrypted_size, 0);
  const savings =
    totalSize > 0 ? ((1 - totalEncrypted / totalSize) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Your encrypted cloud storage at a glance
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Layers className="h-4 w-4" />}
          label="Files"
          value={files.length.toString()}
          accent="indigo"
        />
        <StatCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Original"
          value={formatBytes(totalSize)}
          accent="zinc"
        />
        <StatCard
          icon={<Shield className="h-4 w-4" />}
          label="Encrypted"
          value={formatBytes(totalEncrypted)}
          accent="emerald"
        />
        <StatCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Savings"
          value={`${savings}%`}
          accent="amber"
        />
      </div>

      {/* Passphrase + Quick upload */}
      <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 p-5 space-y-4">
        <Input
          label="Passphrase"
          type="password"
          placeholder="Enter your encryption passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
        />
        <UploadZone
          onFiles={handleUpload}
          compact
          hint={
            !isAnyConnected
              ? "Connect a platform in Settings first"
              : !passphrase
                ? "Enter a passphrase above first"
                : undefined
          }
        />
      </div>

      <UploadQueue />

      {/* Recent files */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Recent Files
            </h2>
            <Link href="/files">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {files.slice(0, 5).map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-800/30 ring-1 ring-zinc-700/40 mb-5">
            <Shield className="h-8 w-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-300">No files yet</h3>
          <p className="text-sm text-zinc-600 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Upload your first file to get started. Files are compressed,
            encrypted, and stored across your connected platforms.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "indigo" | "zinc" | "emerald" | "amber";
}) {
  const styles = {
    indigo: {
      icon: "text-indigo-400 bg-indigo-500/10 ring-1 ring-indigo-500/20",
      value: "text-indigo-50",
    },
    zinc: {
      icon: "text-zinc-400 bg-zinc-800/60 ring-1 ring-zinc-700/40",
      value: "text-zinc-100",
    },
    emerald: {
      icon: "text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20",
      value: "text-emerald-50",
    },
    amber: {
      icon: "text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20",
      value: "text-amber-50",
    },
  };

  return (
    <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 p-4">
      <div
        className={`inline-flex items-center justify-center h-9 w-9 rounded-xl mb-3 ${styles[accent].icon}`}
      >
        {icon}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${styles[accent].value}`}>
        {value}
      </p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5 font-medium">
        {label}
      </p>
    </div>
  );
}
