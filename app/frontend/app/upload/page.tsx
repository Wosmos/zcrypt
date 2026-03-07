"use client";

import { useCallback, useState } from "react";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadQueue } from "@/components/upload/upload-queue";
import { Input } from "@/components/ui/input";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useUploadStore } from "@/store/upload";
import { useFileList } from "@/hooks/useFileList";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { pushFile } from "@/lib/api";
import { toast } from "@/store/toast";
import { Lock, AlertTriangle, Shield, Zap, Box, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function UploadPage() {
  const [passphrase, setPassphrase] = useState("");
  const { isAnyConnected } = usePlatformHealth();
  const { addToQueue, updateStatus, setError } = useUploadStore();
  const { refresh } = useFileList();

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
    async (files: File[]) => {
      if (!passphrase) {
        toast.warning("Enter a passphrase first");
        return;
      }
      if (!isAnyConnected) {
        toast.warning("Connect a platform in Settings first");
        return;
      }

      for (const file of files) {
        const id = addToQueue(file);
        updateStatus(id, "compressing", 0, "Starting...");

        try {
          await pushFile(file, passphrase);
          updateStatus(id, "done", 100, "Done");
          toast.success(`${file.name} uploaded`);
          refresh();
        } catch (err) {
          setError(id, err instanceof Error ? err.message : "Upload failed");
          toast.error(
            `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }
    },
    [passphrase, isAnyConnected, addToQueue, updateStatus, setError, refresh]
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
          Upload
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Files are compressed, encrypted, and distributed across your platforms
        </p>
      </div>

      {/* Warning banner */}
      {!isAnyConnected && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-800/25 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              No platform connected
            </p>
            <p className="text-xs text-amber-400/60 mt-0.5">
              <Link
                href="/settings"
                className="underline hover:text-amber-300 transition-colors"
              >
                Go to Settings
              </Link>{" "}
              to connect a platform before uploading.
            </p>
          </div>
        </div>
      )}

      {/* Passphrase */}
      <Input
        label="Passphrase"
        type="password"
        placeholder="Enter your encryption passphrase"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        icon={<Lock className="h-4 w-4" />}
      />

      {/* Upload zone */}
      <UploadZone
        onFiles={handleUpload}
        hint={
          !isAnyConnected
            ? "Connect a platform in Settings first"
            : !passphrase
              ? "Enter a passphrase above first"
              : undefined
        }
      />

      <UploadQueue />

      {/* Pipeline info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <PipelineStep
          icon={<Zap className="h-4 w-4" />}
          title="Compress"
          desc="Zstd level 22"
        />
        <div className="hidden sm:flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-zinc-700" />
        </div>
        <PipelineStep
          icon={<Shield className="h-4 w-4" />}
          title="Encrypt"
          desc="AES-256-GCM"
        />
        <div className="hidden sm:flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-zinc-700" />
        </div>
        <PipelineStep
          icon={<Box className="h-4 w-4" />}
          title="Chunk & Push"
          desc="90MB chunks to Git"
        />
      </div>
    </div>
  );
}

function PipelineStep({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-3.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-zinc-800/50 text-zinc-500">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-300">{title}</p>
        <p className="text-[11px] text-zinc-600">{desc}</p>
      </div>
    </div>
  );
}
