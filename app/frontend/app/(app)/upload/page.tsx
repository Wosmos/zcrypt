"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadQueue } from "@/components/upload/upload-queue";
import { PlatformSelector } from "@/components/upload/platform-selector";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useUploadStore } from "@/store/upload";
import { useFileList } from "@/hooks/useFileList";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { pushFile, listIncompleteUploads } from "@/lib/api";
import { toast } from "@/store/toast";
import { Lock, AlertTriangle, Shield, Zap, Box, ArrowRight, X } from "lucide-react";
import Link from "next/link";

export default function UploadPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [modalPassphrase, setModalPassphrase] = useState("");
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const { statuses, isAnyConnected } = usePlatformHealth();
  const { addToQueue, updateStatus, setError, setFileId, addIncomplete } = useUploadStore();
  const { refresh } = useFileList();

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

  // Focus passphrase input when modal opens
  useEffect(() => {
    if (pendingFiles && passphraseInputRef.current) {
      setTimeout(() => passphraseInputRef.current?.focus(), 50);
    }
  }, [pendingFiles]);

  // SSE events from backend pipeline — route by file_id
  useOperationStatus((event) => {
    const { queue, findByFileId } = useUploadStore.getState();

    let target = event.file_id ? findByFileId(event.file_id) : undefined;

    if (!target) {
      target = queue.find(
        (i) =>
          i.status !== "done" && i.status !== "failed" && i.status !== "queued" && i.status !== "paused"
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
    if (stageLower === "done") refresh();
  });

  // When user drops/selects files, show the passphrase modal
  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (!isAnyConnected) {
        toast.warning("Connect a platform in Settings first");
        return;
      }
      setPendingFiles(files);
      setModalPassphrase("");
    },
    [isAnyConnected]
  );

  // Actually start uploading after passphrase is entered
  const startUpload = useCallback(
    async (files: File[], passphrase: string) => {
      for (const file of files) {
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
          toast.error(
            `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }
    },
    [selectedPlatform, addToQueue, updateStatus, setError, setFileId, refresh]
  );

  const handleModalConfirm = useCallback(() => {
    if (!modalPassphrase) {
      toast.warning("Enter a passphrase");
      return;
    }
    if (!pendingFiles) return;

    const files = pendingFiles;
    setPendingFiles(null);
    startUpload(files, modalPassphrase);
  }, [modalPassphrase, pendingFiles, startUpload]);

  const handleModalClose = useCallback(() => {
    setPendingFiles(null);
    setModalPassphrase("");
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Upload
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Files are compressed, encrypted, and distributed across your platforms
        </p>
      </div>

      {/* Warning banner */}
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

      {/* Platform selector */}
      <PlatformSelector
        statuses={statuses}
        selected={selectedPlatform}
        onSelect={setSelectedPlatform}
      />

      {/* Upload zone — no passphrase needed up front */}
      <UploadZone
        onFiles={handleFilesSelected}
        hint={
          !isAnyConnected
            ? "Connect a platform in Settings first"
            : selectedPlatform
              ? `Uploading to ${selectedPlatform}`
              : undefined
        }
      />

      <UploadQueue />

      {/* Pipeline info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <PipelineStep
          icon={<Zap className="h-4 w-4" />}
          title="Compress"
          desc="Zstd compression"
        />
        <div className="hidden sm:flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
        </div>
        <PipelineStep
          icon={<Shield className="h-4 w-4" />}
          title="Encrypt"
          desc="AES-256-GCM"
        />
        <div className="hidden sm:flex items-center justify-center">
          <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
        </div>
        <PipelineStep
          icon={<Box className="h-4 w-4" />}
          title="Chunk & Push"
          desc="10MB resumable chunks"
        />
      </div>

      {/* Passphrase modal — portaled to body so it's always viewport-centered */}
      {pendingFiles && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
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
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {pendingFiles.length === 1
                      ? pendingFiles[0].name
                      : `${pendingFiles.length} files selected`}
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
                  Upload
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
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
      <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)]">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] text-[var(--color-text-muted)]">{desc}</p>
      </div>
    </div>
  );
}
