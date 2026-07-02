"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { VaultExplorer, type VaultExplorerHandle } from "@/components/files/vault-explorer";
import { MoveToFolderDialog } from "@/components/files/move-to-folder-dialog";
import { FileViewer } from "@/components/viewers/file-viewer";
import {
  FolderUnlockModal,
  SetFolderPasswordDialog,
  RemoveFolderPasswordDialog,
} from "@/components/files/folder-password-dialogs";
import { DetailsDrawer } from "@/components/files/details-drawer";
import { PlatformHealth } from "@/components/vault/platform-health";
import { ExportImport } from "@/components/vault/export-import";
import { VaultFab } from "@/components/vault/vault-fab";
import { FeedbackModal } from "@/components/feedback/feedback-modal";

import { UploadZone } from "@/components/upload/upload-zone";
import { PlatformSelector } from "@/components/upload/platform-selector";

import { VaultLock } from "@/components/ui/vault-lock";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShareModal } from "@/components/ui/share-modal";
import { FilePreviewModal, useFilePreview } from "@/components/ui/file-preview-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useQuota } from "@/hooks/useQuota";
import { useFeedbackTrigger } from "@/hooks/useFeedbackTrigger";
import { useVaultActions } from "@/hooks/useVaultActions";
import { useFolderProtection } from "@/hooks/useFolderProtection";
import { useFileDecryptor } from "@/hooks/useFileDecryptor";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { useFolderStore } from "@/store/folders";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import type { DecryptedFolder } from "@/hooks/useFolders";

import {
  Shield,
  AlertTriangle,
  RefreshCw,
  FileUpload,
  HardDrive,
  FolderAdd,
  Search,
  X,
} from "@/lib/icons";
import type { FileMetadata } from "@/types";

/**
 * Vault page — composition over a god-component (REBUILD_SPEC §6).
 *
 * The unified <VaultExplorer /> owns browsing / folders / search / view / sort /
 * selection / drag. This page owns the page chrome (header + tabs + accordion),
 * the crypto/upload/download handlers (lifted into useVaultActions), and the
 * modals the explorer hands control back to (delete confirm, share, details,
 * move-to-folder, preview). Every decrypt action routes through the ONE vault
 * unlock provided by <VaultLockProvider> (header pill = <VaultLock />).
 */
export default function VaultPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const explorerRef = useRef<VaultExplorerHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box (GitHub/Slack convention) — unless the user is
  // already typing in a field. Escape (handled on the input) clears + blurs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Modal targets the explorer hands back to the page.
  const [deleteTarget, setDeleteTarget] = useState<FileMetadata | null>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [shareTarget, setShareTarget] = useState<FileMetadata | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<FileMetadata | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Full file viewer (OWNER 2): a navigable list (the opened file's folder) + the
  // index within it. Decryption is fully in-browser via useFileDecryptor.
  const [viewerFiles, setViewerFiles] = useState<FileMetadata[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { files, loading, error, refresh, setFiles } = useFileList();
  const { statuses, repos } = usePlatformHealth();
  const { quota: quotaInfo, refresh: refreshQuota } = useQuota();
  const preview = useFilePreview();

  // The single app-wide vault unlock (provider lives in the layout).
  const vault = useVaultLockContext();

  // Per-folder password protection: routing + re-key orchestration (spec §3).
  const folderProtection = useFolderProtection(vault);

  // In-browser decryptor for the full file viewer (OWNER 1). Same password
  // routing as every other vault action — folder pass for protected files, else
  // the vault passphrase; no plaintext/passphrase ever leaves the page.
  const { decryptToBlob, prefetch } = useFileDecryptor(folderProtection);

  // Current folder (global store) — uploads land here; reads gate protected ones.
  const currentFolderId = useFolderStore((s) => s.currentFolderId);
  const setCurrentFolder = useFolderStore((s) => s.setCurrentFolder);

  const {
    showFeedback,
    dismiss: dismissFeedback,
    markSubmitted: markFeedbackSubmitted,
  } = useFeedbackTrigger(quotaInfo?.used_bytes ?? 0, quotaInfo?.quota_bytes ?? 0);

  // All crypto / upload / download / preview / delete / move / bulk handlers.
  const actions = useVaultActions({
    vault,
    files,
    quotaInfo,
    selectedPlatform,
    refresh,
    refreshQuota,
    setFiles,
    openPreview: preview.openPreview,
    closePreview: preview.closePreview,
    folderProtection,
    currentFolderId,
  });

  // ── Folder protection: set / remove password + open-protected dialogs ───────
  const [protectTarget, setProtectTarget] = useState<DecryptedFolder | null>(null);
  const [removeTarget, setRemoveTarget] = useState<DecryptedFolder | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<DecryptedFolder | null>(null);
  const [rekeyProgress, setRekeyProgress] = useState<{ done: number; total: number } | null>(null);

  // Files in a given folder (re-key sweeps operate on these).
  const filesInFolder = useCallback(
    (folderId: string) => files.filter((f) => (f.folder_id ?? null) === folderId),
    [files]
  );

  // Open a folder: a protected one verifies its password (cache TTL) before
  // navigating in; an unprotected one navigates immediately (unchanged).
  const handleOpenFolderRequest = useCallback(
    (folder: DecryptedFolder) => {
      if (folder.protected) {
        folderProtection.withFolderPassword(folder.id, folder.name, () => {
          setCurrentFolder(folder.id, folder.name);
        });
      } else {
        setCurrentFolder(folder.id, folder.name);
      }
    },
    [folderProtection, setCurrentFolder]
  );

  // Protect a folder: re-key its files from the vault pass to the new folder
  // password (vault must be unlocked), then persist protection. Shows progress.
  const submitProtect = useCallback(
    async (password: string) => {
      if (!protectTarget) return;
      const vaultPass = usePassphraseStore.getState().getPassphrase();
      const inFolder = filesInFolder(protectTarget.id);
      if (inFolder.length > 0 && !vaultPass) {
        throw new Error("Unlock your vault first to re-key the files in this folder.");
      }
      setRekeyProgress({ done: 0, total: inFolder.length });
      try {
        await folderProtection.protectFolder(
          protectTarget.id,
          password,
          inFolder,
          vaultPass ?? "",
          (p) => setRekeyProgress({ done: p.done, total: p.total })
        );
        toast.success("Folder protected");
        setProtectTarget(null);
        await refresh();
      } finally {
        setRekeyProgress(null);
      }
    },
    [protectTarget, filesInFolder, folderProtection, refresh]
  );

  // Remove protection: needs the folder password (prompt if uncached) AND the
  // vault unlocked, then re-keys every file back to the vault pass.
  const submitRemoveProtection = useCallback(async () => {
    if (!removeTarget) return;
    const vaultPass = usePassphraseStore.getState().getPassphrase();
    const inFolder = filesInFolder(removeTarget.id);
    if (inFolder.length > 0 && !vaultPass) {
      throw new Error("Unlock your vault first to re-key the files back.");
    }
    const run = async (folderPw: string) => {
      setRekeyProgress({ done: 0, total: inFolder.length });
      try {
        await folderProtection.unprotectFolder(
          removeTarget.id,
          folderPw,
          inFolder,
          vaultPass ?? "",
          (p) => setRekeyProgress({ done: p.done, total: p.total })
        );
        toast.success("Folder password removed");
        setRemoveTarget(null);
        await refresh();
      } finally {
        setRekeyProgress(null);
      }
    };
    const cached = useFolderPasswordStore.getState().get(removeTarget.id);
    if (cached) {
      await run(cached);
    } else {
      // Prompt + verify the folder password, then run the sweep.
      folderProtection.withFolderPassword(removeTarget.id, removeTarget.name, () => {
        const pw = useFolderPasswordStore.getState().get(removeTarget.id);
        if (pw) void run(pw);
      });
    }
  }, [removeTarget, filesInFolder, folderProtection, refresh]);

  // ── Explorer callbacks that surface a page-owned modal ──────────────────────
  const handleDeleteRequest = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) setDeleteTarget(file);
    },
    [files]
  );

  const handleShareRequest = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) setShareTarget(file);
    },
    [files]
  );

  const handleOpenDetails = useCallback((file: FileMetadata) => {
    setDetailsTarget(file);
    setDetailsOpen(true);
  }, []);

  // Open a file in the full viewer. The explorer hands us the navigable folder
  // list so prev/next walks the same set the user is browsing. We gate on the
  // vault first (folder names + the unprotected decrypt path need it); the
  // decryptor swaps in a folder password for protected files on demand.
  const handleOpenFile = useCallback(
    (file: FileMetadata, folderFiles: FileMetadata[]) => {
      const list = folderFiles.length > 0 ? folderFiles : [file];
      const idx = Math.max(0, list.findIndex((f) => f.id === file.id));
      vault.withPassphrase(() => {
        setViewerFiles(list);
        setViewerIndex(idx);
        setViewerOpen(true);
      });
    },
    [vault]
  );

  // Kebab "Preview" (filename-keyed) routes to the SAME full viewer, scoped to
  // the file's folder so prev/next still walks that folder.
  const handlePreviewInViewer = useCallback(
    (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;
      const fid = file.folder_id ?? null;
      const folderFiles = files.filter((f) => (f.folder_id ?? null) === fid);
      handleOpenFile(file, folderFiles);
    },
    [files, handleOpenFile]
  );

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const executeDelete = useCallback(() => {
    if (!deleteTarget) return;
    actions.executeDelete(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, actions]);

  const executeBulkDelete = useCallback(() => {
    if (!bulkDeleteIds) return;
    void actions.executeBulkDelete(bulkDeleteIds);
    setBulkDeleteIds(null);
  }, [bulkDeleteIds, actions]);

  // ── Upload dialog → existing upload flow ────────────────────────────────────
  const handleDialogFiles = useCallback(
    (selectedFiles: File[]) => {
      setUploadOpen(false);
      actions.handleFilesSelected(selectedFiles);
    },
    [actions]
  );

  // Mirror PlatformHealth's filter so the "Storage & backup" panel only renders
  // when it has content to show.
  const hasConnectedPlatform = statuses.some((s) => s.connected);

  const uploadHint =
    quotaInfo && !quotaInfo.can_upload
      ? "Storage not available yet"
      : statuses.some((s) => s.connected) &&
          !statuses.some((s) => s.platform === "huggingface" && s.connected)
        ? "Tip: connect Hugging Face for faster large-file (2GB+) uploads"
        : vault.unlocked
          ? "Vault unlocked — drop files to upload instantly"
          : undefined;

  return (
    // No animate-fade-in anywhere on this tree: it leaves a lingering `transform`
    // that becomes the containing block for position:sticky, which breaks BOTH
    // sticky mobile rows (search bar here + the filter row inside the explorer)
    // and lets content leak past them. Correct sticky beats a 0.25s entrance.
    <div className="space-y-6">
      {/* Top row — search + actions. DESKTOP (sm+): search with the vault-lock
          toggle hugging its right edge, then [New folder, Upload, refresh] far right.
          On MOBILE this row is sticky and carries only search — the vault-lock toggle
          lives in the global TopBar and refresh is replaced by pull-to-refresh; New
          folder + Upload move beside the type filters. */}
      <div className="sticky -top-1 z-20 -mx-3 flex flex-row items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 sm:static sm:z-auto sm:mx-0 sm:justify-between sm:gap-3 sm:border-b-0 sm:bg-transparent sm:p-0">
        {/* Left group: search + the vault lock hugging its right edge (desktop). */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
          <div className="relative w-full min-w-0 flex-1 sm:w-80">
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search your vault"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                e.currentTarget.blur();
              }
            }}
            icon={<Search className="h-4 w-4" />}
            className="h-9 pr-9"
            aria-label="Search your vault"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-muted)] sm:block">
              /
            </kbd>
          )}
          </div>
          <VaultLock
            unlocked={vault.unlocked}
            remainingSeconds={vault.remainingSeconds}
            persistent={vault.persistent}
            modalOpen={vault.modalProps.open}
            onUnlock={() => vault.unlock()}
            onLock={vault.lock}
            className="hidden flex-shrink-0 sm:inline-flex"
          />
        </div>
        {/* Desktop actions — New folder, Upload, refresh. Hidden on mobile (moved to TopBar + filters). */}
        <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
          <Button
            variant="secondary"
            onClick={() => explorerRef.current?.startNewFolder()}
            aria-label="New folder"
          >
            <FolderAdd className="h-4 w-4" />
            <span className="hidden sm:inline">New folder</span>
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <FileUpload className="h-4 w-4" />
            Upload
          </Button>
          <IconButton
            icon={RefreshCw}
            label="Refresh"
            variant="secondary"
            onClick={() => refresh()}
          />
        </div>
        {/* Mobile has no refresh button — native pull-to-refresh (drag down at the
            top) reloads the vault. The desktop refresh above stays. */}
      </div>

      {/* Vault file browser */}
      <div className="space-y-6">
          {/* No storage available warning */}
          {quotaInfo && !quotaInfo.can_upload && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Storage not available yet
                </p>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                  Managed storage is being set up. You can also{" "}
                  <Link
                    href="/settings"
                    className="underline hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                  >
                    connect your own platform
                  </Link>{" "}
                  for unlimited storage.
                </p>
              </div>
            </div>
          )}

          {/* Empty vault → CTA; otherwise the unified explorer. The explorer
              renders its own loading / locked / no-results states. */}
          {!loading && !error && files.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-7 w-7 text-[var(--color-text-muted)]" />}
              title="No files yet"
              description="Upload your first file to get started. Files are compressed, encrypted, and stored across your connected platforms."
              action={
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <FileUpload className="h-4 w-4" />
                  Upload files
                </Button>
              }
            />
          ) : (
            <VaultExplorer
              ref={explorerRef}
              search={search}
              onSearchChange={setSearch}
              files={files}
              loading={loading}
              error={error}
              onPreview={handlePreviewInViewer}
              onDownload={actions.handleDownload}
              onShare={handleShareRequest}
              onOpenDetails={handleOpenDetails}
              onOpenFile={handleOpenFile}
              onDelete={handleDeleteRequest}
              onMoveFile={actions.handleMoveFileTo}
              onMoveRequest={setMoveTarget}
              onBulkDelete={setBulkDeleteIds}
              onBulkDownload={actions.handleBulkDownload}
              onUploadClick={() => setUploadOpen(true)}
              onOpenFolderRequest={handleOpenFolderRequest}
              onProtectFolder={setProtectTarget}
              onRemoveFolderPassword={setRemoveTarget}
              onMoveFolderRequest={setMoveFolderTarget}
            />
          )}

          {/* Storage & backup — de-emphasized, collapsed by default. Only render
              when there's content: a personal platform or files to back up.
              Hidden on mobile (md-): platform storage lives in Insights and vault
              export/import in Settings, so it'd only clutter the phone. */}
          {(hasConnectedPlatform || files.length > 0) && (
            <Accordion type="single" collapsible className="hidden pt-2 md:block">
              <AccordionItem
                value="storage-backup"
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4"
              >
                <AccordionTrigger className="py-3.5 text-sm font-medium text-[var(--color-text-secondary)] hover:no-underline hover:text-[var(--color-text)] [&>svg]:text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />
                    Storage &amp; backup
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4">
                  <PlatformHealth statuses={statuses} repos={repos} />
                  {files.length > 0 && <ExportImport files={files} />}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Feedback modal */}
          <FeedbackModal
            open={showFeedback}
            onClose={dismissFeedback}
            onSubmitted={markFeedbackSubmitted}
          />
      </div>

      {/* Floating "+" — the single mobile entry to New folder / Upload. Hidden
          while the full-screen viewer is open so it doesn't float over it. */}
      {!viewerOpen && (
        <VaultFab
          onNewFolder={() => explorerRef.current?.startNewFolder()}
          onUpload={() => setUploadOpen(true)}
        />
      )}

      {/* ── Modals the explorer hands control back to ───────────────────────── */}

      {/* File preview modal (decrypted in-memory by useVaultActions) — retained
          for any legacy in-memory preview path; the click/kebab now open the
          richer <FileViewer> below. */}
      <FilePreviewModal
        open={preview.open}
        onClose={preview.closePreview}
        blob={preview.blob}
        filename={preview.filename}
        fileSize={preview.fileSize}
      />

      {/* Full multi-format file viewer (OWNER 1) — opened by a file click / the
          kebab Preview, with the file's folder as the prev/next list. Decrypts
          entirely in-browser via useFileDecryptor (zero-knowledge). */}
      <FileViewer
        open={viewerOpen}
        files={viewerFiles}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
        decrypt={decryptToBlob}
        prefetch={prefetch}
        onWrongPassword={(folderId) =>
          folderId == null
            ? vault.lock()
            : folderProtection.clearFolderPassword(folderId)
        }
      />

      {/* Share modal */}
      <ShareModal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        fileId={shareTarget?.id ?? ""}
        fileName={shareTarget?.original_name ?? ""}
        fileSize={shareTarget?.original_size ?? 0}
      />

      {/* File details drawer */}
      <DetailsDrawer
        file={detailsTarget}
        open={detailsOpen}
        onOpenChange={(o) => {
          setDetailsOpen(o);
          if (!o) setDetailsTarget(null);
        }}
      />

      {/* Move FILE to folder (kebab path; drag-to-move is handled in-explorer).
          Routes through moveFileWithRekey so a move across a protection boundary
          re-keys before moving. */}
      <MoveToFolderDialog
        open={!!moveTarget}
        fileId={moveTarget}
        onClose={() => setMoveTarget(null)}
        onMoved={() => refresh()}
        onMoveFile={actions.moveFileWithRekey}
      />

      {/* Move FOLDER to folder (keyboard-reachable C1; rejects self/descendant). */}
      <MoveToFolderDialog
        open={!!moveFolderTarget}
        fileId={null}
        folderId={moveFolderTarget?.id ?? null}
        onClose={() => setMoveFolderTarget(null)}
        onMoved={() => refresh()}
      />

      {/* Folder unlock (open a protected folder / verify before re-key sweeps) */}
      <FolderUnlockModal state={folderProtection.modalState} />

      {/* Set / replace a folder password (with re-key progress) */}
      <SetFolderPasswordDialog
        state={{
          open: !!protectTarget,
          folderName: protectTarget?.name ?? "",
          fileCount: protectTarget ? files.filter((f) => (f.folder_id ?? null) === protectTarget.id).length : 0,
          vaultUnlocked: vault.unlocked,
          progress: protectTarget ? rekeyProgress : null,
          onSubmit: submitProtect,
          onClose: () => {
            if (rekeyProgress) return; // don't close mid-sweep
            setProtectTarget(null);
          },
          onRequestVaultUnlock: () => vault.unlock(),
        }}
      />

      {/* Remove folder password (with re-key-back progress) */}
      <RemoveFolderPasswordDialog
        state={{
          open: !!removeTarget,
          folderName: removeTarget?.name ?? "",
          fileCount: removeTarget ? files.filter((f) => (f.folder_id ?? null) === removeTarget.id).length : 0,
          vaultUnlocked: vault.unlocked,
          progress: removeTarget ? rekeyProgress : null,
          onConfirm: submitRemoveProtection,
          onClose: () => {
            if (rekeyProgress) return;
            setRemoveTarget(null);
          },
          onRequestVaultUnlock: () => vault.unlock(),
        }}
      />

      {/* Confirm delete (single) */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={executeDelete}
        destructive
        title="Move file to Trash?"
        description={
          <>
            <span className="block">
              This file will be moved to Trash — you can restore it from Deleted Files.
            </span>
            {deleteTarget && (
              <span className="mt-3 block truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                {deleteTarget.original_name}
              </span>
            )}
          </>
        }
        confirmLabel="Move to Trash"
      />

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={!!bulkDeleteIds}
        onOpenChange={(o) => !o && setBulkDeleteIds(null)}
        onConfirm={executeBulkDelete}
        destructive
        title="Move selected files to Trash?"
        description={`${bulkDeleteIds?.length ?? 0} file${
          (bulkDeleteIds?.length ?? 0) !== 1 ? "s" : ""
        } will be moved to Trash — you can restore them from Deleted Files.`}
        confirmLabel={`Move ${bulkDeleteIds?.length ?? 0} file${
          (bulkDeleteIds?.length ?? 0) !== 1 ? "s" : ""
        } to Trash`}
      />

      {/* Upload dialog — upload zone + platform selector. Lives outside the tab
          conditional so the header Upload button works from any tab. */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-xl border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              Files are compressed, end-to-end encrypted, and chunked before they leave your device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <UploadZone onFiles={handleDialogFiles} hint={uploadHint} />
            <PlatformSelector
              statuses={statuses}
              selected={selectedPlatform}
              onSelect={setSelectedPlatform}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
