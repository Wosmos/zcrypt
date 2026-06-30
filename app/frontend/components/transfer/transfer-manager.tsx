"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useUploadStore } from "@/store/upload";
import { useDownloadStore } from "@/store/download";
import { usePassphraseStore } from "@/store/passphrase";
import { getFilesData } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { toast } from "@/store/toast";
import { ChevronDown, CheckCircle2, AlertCircle, ArrowUpDown } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn } from "@/lib/utils";
import {
  TransferItem,
  type TransferEntry,
  type TransferState,
} from "./transfer-item";

// ---------------------------------------------------------------------------
// <TransferManager /> — a single docked bottom-right panel unifying uploads +
// downloads. Mounted ONCE in app/(app)/layout.tsx so it persists across
// navigation (the stores are singletons). Renders null when both queues are
// empty.
//
// Props:
//   onNeedUnlock?(resume): void
//     Called when a Retry/Resume needs the vault passphrase but none is cached.
//     `resume` is a zero-arg callback the unlock flow should invoke AFTER a
//     successful unlock (so the action proceeds with the now-cached passphrase).
//     The manager NEVER prompts for a passphrase itself and NEVER reads/forwards
//     the passphrase anywhere except the store methods that need it locally.
// ---------------------------------------------------------------------------
export interface TransferManagerProps {
  onNeedUnlock?: (resume: () => void) => void;
}

// Visual ordering: in-flight work on top, finished work sinks to the bottom.
const STATE_RANK: Record<TransferState, number> = {
  active: 0,
  paused: 1,
  queued: 2,
  failed: 3,
  cancelled: 4,
  done: 5,
};

export function TransferManager({ onNeedUnlock }: TransferManagerProps) {
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  // Upload store
  const uploadQueue = useUploadStore((s) => s.queue);
  const pauseUpload = useUploadStore((s) => s.pauseUpload);
  const resumeUpload = useUploadStore((s) => s.resumeUpload);
  const retryUpload = useUploadStore((s) => s.retryUpload);
  const removeUpload = useUploadStore((s) => s.removeFromQueue);
  const clearUploads = useUploadStore((s) => s.clearCompleted);
  const getItemFolderId = useUploadStore((s) => s.getItemFolderId);

  // Download store
  const downloadQueue = useDownloadStore((s) => s.queue);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const retryDownload = useDownloadStore((s) => s.retryDownload);
  const removeDownload = useDownloadStore((s) => s.removeFromQueue);
  const clearDownloads = useDownloadStore((s) => s.clearCompleted);

  // Read the cached vault passphrase silently (never sent anywhere — only handed
  // to the local store method that re-encrypts/decrypts client-side). If absent,
  // defer to the page's vault-unlock flow via onNeedUnlock.
  const withPassphrase = (run: (passphrase: string) => void) => {
    const cached = usePassphraseStore.getState().getPassphrase();
    if (cached) {
      run(cached);
      return;
    }
    onNeedUnlock?.(() => {
      const pass = usePassphraseStore.getState().getPassphrase();
      if (pass) run(pass);
    });
  };

  // FIX-4: resolve the password an UPLOAD item must (re-)encrypt under. A
  // protected-folder upload re-encrypts its remaining chunks with the FOLDER
  // password — never the vault passphrase — so resume/retry must derive the KEK
  // from the same folder password the chunks already uploaded used. The dock
  // lives outside the page's useFolderProtection (it can't open the folder-unlock
  // modal), so if the folder isn't currently unlocked we ask the user to open it
  // first rather than silently corrupting the file with the wrong key.
  const withUploadPassword = (id: string, run: (password: string) => void) => {
    const folderId = getItemFolderId(id);
    const protectedFolder =
      folderId != null && useFolderRegistry.getState().isProtected(folderId);
    if (!protectedFolder) {
      // Unprotected upload → vault passphrase, exactly as before.
      withPassphrase(run);
      return;
    }
    const folderPw = useFolderPasswordStore.getState().get(folderId!);
    if (folderPw) {
      run(folderPw);
      return;
    }
    // Locked protected folder: the folder-unlock prompt only lives on the Vault
    // page. Tell the user to open the folder there (which caches its password),
    // then retry — never fall back to the vault pass (would produce undecryptable
    // chunks).
    toast.info("Open the protected folder to unlock it, then retry this transfer.");
  };

  // FIX-4: resolve the password a DOWNLOAD item must decrypt under. For an
  // unprotected file this is the vault passphrase; for a protected-folder file
  // it is that folder's password. We always hand the download store the global
  // folder-aware resolver (resolveFilePasswordGlobal) so per-file routing matches
  // the initial download path. The vault gate below only ensures the vault is
  // unlocked for the unprotected/base case; the resolver swaps in the folder
  // password for protected files (and clear-cache + re-prompt is handled in the
  // download store on a wrong password).
  const withDownloadPassword = (fileId: string, run: (passphrase: string) => void) => {
    const file = getFilesData().find((f) => f.id === fileId);
    const folderId = file?.folder_id ?? null;
    const protectedFolder =
      folderId != null && useFolderRegistry.getState().isProtected(folderId);
    if (protectedFolder) {
      const folderPw = useFolderPasswordStore.getState().get(folderId!);
      if (folderPw) {
        run(folderPw);
        return;
      }
      toast.info("Open the protected folder to unlock it, then retry this download.");
      return;
    }
    withPassphrase(run);
  };

  const entries = useMemo<TransferEntry[]>(() => {
    const up: TransferEntry[] = uploadQueue.map((item) => {
      let state: TransferState;
      switch (item.status) {
        case "done": state = "done"; break;
        case "failed": state = "failed"; break;
        case "paused": state = "paused"; break;
        case "queued": state = "queued"; break;
        default: state = "active"; // "encrypting" | "uploading"
      }
      return {
        key: `up:${item.id}`,
        id: item.id,
        direction: "upload",
        name: item.file.name,
        progress: item.progress,
        state,
        stage: item.stage,
        error: item.error,
        sizeBytes: item.file.size,
        bytesProcessed: item.bytesProcessed,
        totalBytes: item.totalBytes,
        startedAt: item.startedAt,
      };
    });

    const down: TransferEntry[] = downloadQueue.map((item) => {
      let state: TransferState;
      switch (item.status) {
        case "done": state = "done"; break;
        case "failed": state = "failed"; break;
        case "cancelled": state = "cancelled"; break;
        case "queued": state = "queued"; break;
        default: state = "active"; // "downloading"
      }
      return {
        key: `dl:${item.id}`,
        id: item.id,
        direction: "download",
        name: item.filename,
        progress: item.progress,
        state,
        stage: item.stage,
        error: item.error,
        sizeBytes: item.fileSize,
        startedAt: item.startedAt,
      };
    });

    return [...up, ...down].sort((a, b) => {
      const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
      if (rank !== 0) return rank;
      return b.startedAt - a.startedAt; // newest first within the same bucket
    });
  }, [uploadQueue, downloadQueue]);

  const activeCount = entries.filter(
    (e) => e.state === "active" || e.state === "queued" || e.state === "paused",
  ).length;
  const failedCount = entries.filter((e) => e.state === "failed").length;
  const hasCompleted = entries.some(
    (e) => e.state === "done" || e.state === "cancelled" || e.state === "failed",
  );
  const allSettled = activeCount === 0;

  // Aggregate progress over still-running work (paused counts as in-progress).
  const runningEntries = entries.filter(
    (e) => e.state === "active" || e.state === "paused" || e.state === "queued",
  );
  const aggregateProgress =
    runningEntries.length > 0
      ? Math.round(runningEntries.reduce((sum, e) => sum + (e.progress || 0), 0) / runningEntries.length)
      : 100;

  const controls = {
    onPause: (id: string) => pauseUpload(id),
    // FIX-4: resume/retry of a protected-folder upload re-encrypts the remaining
    // chunks under the FOLDER password (matching the already-uploaded chunks),
    // not the vault passphrase. withUploadPassword picks the right one by the
    // item's destination folder.
    onResume: (id: string) => withUploadPassword(id, (pass) => resumeUpload(id, pass)),
    onCancelUpload: (id: string) => removeUpload(id),
    onRetryUpload: (id: string) => withUploadPassword(id, (pass) => retryUpload(id, pass)),
    onStopDownload: (id: string) => cancelDownload(id),
    // FIX-4: retry of a protected-folder download decrypts under the FOLDER
    // password. withDownloadPassword gates the vault for the base/unprotected
    // case; we always pass the folder-aware global resolver so per-file routing
    // (and wrong-password clear-cache + re-prompt) matches the initial download.
    onRetryDownload: (id: string) => {
      const item = downloadQueue.find((d) => d.id === id);
      if (!item) return;
      withDownloadPassword(item.fileId, (pass) =>
        retryDownload(id, pass, resolveFilePasswordGlobal)
      );
    },
    onDismiss: (entry: TransferEntry) =>
      entry.direction === "upload" ? removeUpload(entry.id) : removeDownload(entry.id),
  };

  const clearCompleted = () => {
    clearUploads();
    clearDownloads();
  };

  const headerLabel = allSettled
    ? failedCount > 0
      ? `${failedCount} failed`
      : "Transfers complete"
    : `${activeCount} active`;

  return (
    <AnimatePresence>
      {entries.length > 0 && (
        <motion.div
          key="transfer-dock"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="panel fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 w-[min(calc(100vw-2rem),380px)] overflow-hidden rounded-2xl shadow-2xl backdrop-blur-sm md:bottom-4"
          role="region"
          aria-label="Transfers"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3.5 py-2.5">
            <div className="flex-shrink-0">
              {allSettled ? (
                failedCount > 0 ? (
                  <AlertCircle className="h-4 w-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
                )
              ) : (
                <LogoSpinner size={16} speed="fast" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-text)]">Transfers</p>
              <p
                aria-live="polite"
                className="truncate text-[11px] tabular-nums text-[var(--color-text-muted)]"
              >
                {headerLabel}
              </p>
            </div>

            {hasCompleted && (
              <button
                type="button"
                onClick={clearCompleted}
                className="rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                Clear completed
              </button>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand transfers" : "Collapse transfers"}
              aria-expanded={!collapsed}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  collapsed && "rotate-180",
                )}
              />
            </button>
          </div>

          {/* Body: full list when expanded, compact aggregate pill when collapsed */}
          <AnimatePresence initial={false} mode="wait">
            {collapsed ? (
              <motion.div
                key="collapsed"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <ArrowUpDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <motion.div
                      className="h-full rounded-full bg-[var(--color-accent)]"
                      initial={false}
                      animate={{ width: `${allSettled ? 100 : aggregateProgress}%` }}
                      transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
                    />
                  </div>
                  <span className="flex-shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
                    {allSettled ? "Done" : `${aggregateProgress}%`}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="max-h-[min(60vh,420px)] overflow-y-auto p-2"
              >
                <motion.div layout={!reduceMotion} className="space-y-1.5">
                  <AnimatePresence initial={false}>
                    {entries.map((entry) => (
                      <TransferItem key={entry.key} entry={entry} controls={controls} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
