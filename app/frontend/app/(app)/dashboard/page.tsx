"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { VaultLockOverlay } from "@/components/vault/vault-lock-overlay";
import { FeedbackModal } from "@/components/feedback/feedback-modal";

import { UploadZone } from "@/components/upload/upload-zone";
import { PlatformSelector } from "@/components/upload/platform-selector";
import { IncompleteUploads } from "@/components/upload/incomplete-uploads";
import { SharedStorageBanner } from "@/components/dashboard/shared-storage-banner";
import { ConnectStorageDialog } from "@/components/dashboard/connect-storage-dialog";

import { VaultLock } from "@/components/ui/vault-lock";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShareModal } from "@/components/ui/share-modal";
import { BulkShareModal } from "@/components/ui/bulk-share-modal";
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
import { useAndroidShare } from "@/hooks/useAndroidShare";
import { toDesktopFile } from "@/lib/tauri";
import { useFolderProtection } from "@/hooks/useFolderProtection";
import { useFileDecryptor } from "@/hooks/useFileDecryptor";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { useFolderStore } from "@/store/folders";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import { useRecentlyViewedStore } from "@/store/recently-viewed";
import { useVaultSearch } from "@/components/ui/command-palette";
import { VaultShortcuts } from "@/components/files/vault-shortcuts";
import type { DecryptedFolder } from "@/hooks/useFolders";

import { Shield, AlertTriangle, RefreshCw, FileUpload, HardDrive, FolderAdd } from "@/lib/icons";
import type { FileMetadata } from "@/types";
import { useAutoTour } from "@/components/onboarding/tour-provider";

/**
 * Vault page: composition over a god-component (REBUILD_SPEC §6).
 *
 * The unified <VaultExplorer /> owns browsing / folders / search / view / sort /
 * selection / drag. This page owns the page chrome (header + tabs + accordion),
 * the crypto/upload/download handlers (lifted into useVaultActions), and the
 * modals the explorer hands control back to (delete confirm, share, details,
 * move-to-folder, preview). Every decrypt action routes through the ONE vault
 * unlock provided by <VaultLockProvider> (header pill = <VaultLock />).
 */
export default function VaultPage() {
  const t = useTranslations("dashboard");
  const ta = useTranslations("app");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const search = useVaultSearch((s) => s.query);
  const setSearch = useVaultSearch((s) => s.setQuery);
  const explorerRef = useRef<VaultExplorerHandle>(null);
  useEffect(() => () => useVaultSearch.getState().setQuery(""), []);

  // OS file drop anywhere on the page. dragDepth counts nested enter/leave
  // pairs (every descendant fires its own dragenter/dragleave as the pointer
  // crosses it), so the overlay only clears on the OUTERMOST leave, not on
  // every child boundary crossed while dragging over the page. Checking
  // dataTransfer.types for "Files" excludes the explorer's own in-app
  // drag-to-move (a non-native drag with no Files type), which must keep
  // working unaffected by this.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const isOSFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    if (!isOSFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }, []);

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    if (!isOSFileDrag(e)) return;
    e.preventDefault();
  }, []);

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    if (!isOSFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }, []);

  // Modal targets the explorer hands back to the page.
  const [deleteRequest, setDeleteRequest] = useState<
    { kind: "single"; file: FileMetadata } | { kind: "bulk"; ids: string[] } | null
  >(null);
  const [shareTarget, setShareTarget] = useState<FileMetadata | null>(null);
  const [bulkShareIds, setBulkShareIds] = useState<string[] | null>(null);
  const [moveRequest, setMoveRequest] = useState<
    | { kind: "file"; fileId: string }
    | { kind: "folder"; folder: DecryptedFolder }
    | { kind: "bulk"; fileIds: string[] }
    | null
  >(null);
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
  // routing as every other vault action: folder pass for protected files, else
  // the vault passphrase; no plaintext/passphrase ever leaves the page.
  const { decryptToBlob, prefetch } = useFileDecryptor(folderProtection);

  // Current folder (global store): uploads land here; reads gate protected ones.
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
  const [rekeyProgress, setRekeyProgress] = useState<{ done: number; total: number } | null>(null);

  // Files in a given folder (re-key sweeps operate on these).
  const filesInFolder = useCallback(
    (folderId: string) => files.filter((f) => (f.folder_id ?? null) === folderId),
    [files],
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
    [folderProtection, setCurrentFolder],
  );

  // Protect a folder: re-key its files from the vault pass to the new folder
  // password (vault must be unlocked), then persist protection. Shows progress.
  const submitProtect = useCallback(
    async (password: string) => {
      if (!protectTarget) return;
      const vaultPass = usePassphraseStore.getState().getPassphrase();
      const inFolder = filesInFolder(protectTarget.id);
      if (inFolder.length > 0 && !vaultPass) {
        throw new Error(ta("dashboard.rekeyUnlockProtect"));
      }
      setRekeyProgress({ done: 0, total: inFolder.length });
      try {
        await folderProtection.protectFolder(
          protectTarget.id,
          password,
          inFolder,
          vaultPass ?? "",
          (p) => setRekeyProgress({ done: p.done, total: p.total }),
        );
        toast.success(t("toastFolderProtected"));
        setProtectTarget(null);
        await refresh();
      } finally {
        setRekeyProgress(null);
      }
    },
    [protectTarget, filesInFolder, folderProtection, refresh, t, ta],
  );

  // Remove protection: needs the folder password (prompt if uncached) AND the
  // vault unlocked, then re-keys every file back to the vault pass.
  const submitRemoveProtection = useCallback(async () => {
    if (!removeTarget) return;
    const vaultPass = usePassphraseStore.getState().getPassphrase();
    const inFolder = filesInFolder(removeTarget.id);
    if (inFolder.length > 0 && !vaultPass) {
      throw new Error(ta("dashboard.rekeyUnlockRemove"));
    }
    const run = async (folderPw: string) => {
      setRekeyProgress({ done: 0, total: inFolder.length });
      try {
        await folderProtection.unprotectFolder(
          removeTarget.id,
          folderPw,
          inFolder,
          vaultPass ?? "",
          (p) => setRekeyProgress({ done: p.done, total: p.total }),
        );
        toast.success(t("toastFolderPasswordRemoved"));
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
  }, [removeTarget, filesInFolder, folderProtection, refresh, t, ta]);

  // ── Explorer callbacks that surface a page-owned modal ──────────────────────
  const handleDeleteRequest = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) setDeleteRequest({ kind: "single", file });
    },
    [files],
  );

  const handleShareRequest = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) setShareTarget(file);
    },
    [files],
  );

  const handleOpenDetails = useCallback((file: FileMetadata) => {
    setDetailsTarget(file);
    setDetailsOpen(true);
  }, []);

  // Open a file in the full viewer. The explorer hands us the navigable folder
  // list so prev/next walks the same set the user is browsing. We gate on the
  // vault first (folder names + the unprotected decrypt path need it); the
  // decryptor swaps in a folder password for protected files on demand.
  const logRecentlyViewed = useRecentlyViewedStore((s) => s.logView);
  const handleOpenFile = useCallback(
    (file: FileMetadata, folderFiles: FileMetadata[]) => {
      const list = folderFiles.length > 0 ? folderFiles : [file];
      const idx = Math.max(
        0,
        list.findIndex((f) => f.id === file.id),
      );
      vault.withPassphrase(() => {
        setViewerFiles(list);
        setViewerIndex(idx);
        setViewerOpen(true);
        logRecentlyViewed(file.id);
      });
    },
    [vault, logRecentlyViewed],
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
    [files, handleOpenFile],
  );

  const pendingOpen = useVaultSearch((s) => s.pendingOpen);
  useEffect(() => {
    if (!pendingOpen || !vault.ready) return;
    const file = files.find((f) => f.id === pendingOpen);
    useVaultSearch.getState().requestOpen(null);
    if (!file) return;
    const fid = file.folder_id ?? null;
    handleOpenFile(
      file,
      files.filter((f) => (f.folder_id ?? null) === fid),
    );
  }, [pendingOpen, vault.ready, files, handleOpenFile]);

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const executeDelete = useCallback(() => {
    if (!deleteRequest) return;
    if (deleteRequest.kind === "single") {
      actions.executeDelete(deleteRequest.file);
    } else {
      void actions.executeBulkDelete(deleteRequest.ids);
    }
    setDeleteRequest(null);
  }, [deleteRequest, actions]);

  // ── Upload dialog → existing upload flow ────────────────────────────────────
  const handleDialogFiles = useCallback(
    (selectedFiles: File[]) => {
      setUploadOpen(false);
      actions.handleFilesSelected(selectedFiles);
    },
    [actions],
  );

  const handleSharedFiles = useCallback(
    (paths: string[]) => actions.handleFilesSelected(paths.map(toDesktopFile)),
    [actions],
  );
  useAndroidShare(handleSharedFiles, vault.ready);

  const handlePageDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isOSFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length > 0) actions.handleFilesSelected(dropped);
    },
    [actions],
  );

  // Mirror PlatformHealth's filter so the "Storage & backup" panel only renders
  // when it has content to show.
  const hasConnectedPlatform = statuses.some((s) => s.connected);

  const uploadHint =
    quotaInfo && !quotaInfo.can_upload
      ? t("storageUnavailable")
      : statuses.some((s) => s.connected) &&
          !statuses.some((s) => s.platform === "huggingface" && s.connected)
        ? t("hintHuggingFace")
        : vault.unlocked
          ? t("hintUnlocked")
          : undefined;

  // Full-screen lock mask: shown ONLY once the rehydrate attempt has settled
  // (`vault.ready`, so a remembered-device session never flashes it), the vault
  // is locked, and there are actually encrypted files to protect (a brand-new
  // empty vault keeps its normal onboarding, no forced unlock wall). The real
  // protection is the plaintext eviction on lock; this is the visible signal.
  //
  // The file content ALSO holds on a skeleton until `vault.ready` (see the
  // explorer branch below), so a locked vault never flashes its file grid
  // before this mask mounts, and a remembered-device vault never flashes this
  // mask before its content. Both resolve together on the `ready` flip.
  const showLockOverlay = vault.ready && !vault.unlocked && files.length > 0;
  useAutoTour("vault", vault.ready && !loading && !error && !showLockOverlay && !currentFolderId);

  return (
    // No animate-fade-in anywhere on this tree: it leaves a lingering `transform`
    // that becomes the containing block for position:sticky, which breaks BOTH
    // sticky mobile rows (search bar here + the filter row inside the explorer)
    // and lets content leak past them. Correct sticky beats a 0.25s entrance.
    <div
      className="relative space-y-6"
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-surface)] px-12 py-10">
            <FileUpload className="h-8 w-8 text-[var(--color-accent)]" />
            <p className="text-base font-semibold text-[var(--color-text)]">{t("dropToUpload")}</p>
          </div>
        </div>
      )}
      {/* Desktop actions row: vault lock, then [New folder, Upload, refresh]. Search
          is the global bar in the TopBar; on mobile the lock lives in the TopBar and
          New folder + Upload move beside the type filters. */}
      <div className="hidden flex-row items-center justify-between gap-3 sm:flex">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
          <VaultLock
            unlocked={vault.unlocked}
            remainingSeconds={vault.remainingSeconds}
            persistent={vault.persistent}
            modalOpen={vault.modalProps.open}
            onUnlock={() => vault.unlock()}
            onLock={vault.lock}
            className="hidden flex-shrink-0 sm:inline-flex"
            tour="vault-lock"
          />
        </div>
        {/* Desktop actions. New folder, Upload, refresh. Hidden on mobile (moved to TopBar + filters). */}
        <div className="hidden flex-shrink-0 items-center gap-2 sm:flex">
          <VaultShortcuts />
          <Button
            variant="secondary"
            onClick={() => explorerRef.current?.startNewFolder()}
            aria-label={t("newFolder")}
            data-tour="new-folder"
          >
            <FolderAdd className="h-4 w-4" />
            <span className="hidden sm:inline">{t("newFolder")}</span>
          </Button>
          <Button onClick={() => setUploadOpen(true)} data-tour="upload-button">
            <FileUpload className="h-4 w-4" />
            {t("upload")}
          </Button>
          <IconButton
            icon={RefreshCw}
            label={t("refresh")}
            variant="secondary"
            onClick={() => refresh()}
          />
        </div>
        {/* Mobile has no refresh button: native pull-to-refresh (drag down at the
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
                {t("storageUnavailable")}
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                {t.rich("storageSettingUp", {
                  link: (chunks) => (
                    <Link
                      href="/settings"
                      className="underline hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </div>
        )}

        {/* Shared storage nudge: only renders for users riding the global token,
              and only once a day. Above the uploads so it is seen before someone
              starts a transfer that the cap would refuse. */}
        <SharedStorageBanner />
        <ConnectStorageDialog />

        {/* Unfinished uploads (started but never completed), resume or discard.
              Resume goes through handleResumeIncomplete so the ORIGINAL session's
              platform is pinned (never re-resolved through the picker). */}
        <IncompleteUploads
          onResume={(file, upload) => actions.handleResumeIncomplete(file, upload)}
        />

        {/* Empty vault → CTA; otherwise the unified explorer. The explorer
              renders its own loading / locked / no-results states. Until the
              lock decision has settled (`vault.ready`), hold on the explorer's
              neutral skeleton, never paint real file content (tiles / names /
              thumbnails) that would then get masked by the lock overlay, and
              never show the empty-state before we know the vault is truly empty. */}
        {vault.ready && !loading && !error && files.length === 0 ? (
          <EmptyState
            icon={<Shield className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("noFilesTitle")}
            description={t("noFilesDescription")}
            action={
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <FileUpload className="h-4 w-4" />
                {t("uploadDialogTitle")}
              </Button>
            }
          />
        ) : (
          <VaultExplorer
            ref={explorerRef}
            search={search}
            onSearchChange={setSearch}
            files={files}
            loading={loading || !vault.ready}
            error={error}
            onPreview={handlePreviewInViewer}
            onDownload={actions.handleDownload}
            onShare={handleShareRequest}
            onOpenDetails={handleOpenDetails}
            onOpenFile={handleOpenFile}
            onDelete={handleDeleteRequest}
            onMoveFile={actions.handleMoveFileTo}
            onMoveRequest={(fileId) => setMoveRequest({ kind: "file", fileId })}
            onBulkDelete={(ids) => setDeleteRequest({ kind: "bulk", ids })}
            onBulkDownload={actions.handleBulkDownload}
            onBulkMove={(ids) => setMoveRequest({ kind: "bulk", fileIds: ids })}
            onBulkShare={(ids) => setBulkShareIds(ids)}
            onUploadClick={() => setUploadOpen(true)}
            onOpenFolderRequest={handleOpenFolderRequest}
            onProtectFolder={setProtectTarget}
            onRemoveFolderPassword={setRemoveTarget}
            onMoveFolderRequest={(folder) => setMoveRequest({ kind: "folder", folder })}
          />
        )}

        {/* Storage & backup, de-emphasized, collapsed by default. Only render
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
                  {ta("dashboard.storageBackup")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 pb-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
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

      {/* Floating "+": the single mobile entry to New folder / Upload. Hidden
          while the full-screen viewer is open, or while the lock mask is up (it
          would poke through the mask at z-50). */}
      {!viewerOpen && !showLockOverlay && vault.ready && (
        <VaultFab
          onNewFolder={() => explorerRef.current?.startNewFolder()}
          onUpload={() => setUploadOpen(true)}
        />
      )}

      {/* Full-screen lock mask over the vault (blur + lock + Unlock CTA). Sits
          below the PassphraseModal (z-50), which the click opens on top. */}
      {showLockOverlay && <VaultLockOverlay onUnlock={() => vault.unlock()} />}

      {/* ── Modals the explorer hands control back to ───────────────────────── */}

      {/* File preview modal (decrypted in-memory by useVaultActions), retained
          for any legacy in-memory preview path; the click/kebab now open the
          richer <FileViewer> below. */}
      <FilePreviewModal
        open={preview.open}
        onClose={preview.closePreview}
        blob={preview.blob}
        filename={preview.filename}
        fileSize={preview.fileSize}
      />

      {/* Full multi-format file viewer (OWNER 1): opened by a file click / the
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
          folderId == null ? vault.lock() : folderProtection.clearFolderPassword(folderId)
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

      <BulkShareModal
        open={!!bulkShareIds}
        onClose={() => setBulkShareIds(null)}
        files={bulkShareIds ? files.filter((f) => bulkShareIds.includes(f.id)) : []}
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

      <MoveToFolderDialog
        open={!!moveRequest}
        fileId={moveRequest?.kind === "file" ? moveRequest.fileId : null}
        folderId={moveRequest?.kind === "folder" ? moveRequest.folder.id : null}
        fileIds={moveRequest?.kind === "bulk" ? moveRequest.fileIds : undefined}
        onClose={() => setMoveRequest(null)}
        onMoved={() => refresh()}
        onMoveFile={moveRequest?.kind !== "folder" ? actions.moveFileWithRekey : undefined}
      />

      {/* Folder unlock (open a protected folder / verify before re-key sweeps) */}
      <FolderUnlockModal state={folderProtection.modalState} />

      {/* Set / replace a folder password (with re-key progress) */}
      <SetFolderPasswordDialog
        state={{
          open: !!protectTarget,
          folderName: protectTarget?.name ?? "",
          fileCount: protectTarget
            ? files.filter((f) => (f.folder_id ?? null) === protectTarget.id).length
            : 0,
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
          fileCount: removeTarget
            ? files.filter((f) => (f.folder_id ?? null) === removeTarget.id).length
            : 0,
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

      <ConfirmDialog
        open={!!deleteRequest}
        onOpenChange={(o) => !o && setDeleteRequest(null)}
        onConfirm={executeDelete}
        destructive
        title={deleteRequest?.kind === "bulk" ? t("trashSelectedTitle") : t("trashFileTitle")}
        description={
          deleteRequest?.kind === "bulk" ? (
            t("trashSelectedDescription", { count: deleteRequest.ids.length })
          ) : (
            <>
              <span className="block">{t("trashFileDescription")}</span>
              {deleteRequest && (
                <span className="mt-3 block truncate rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 font-mono text-xs text-[var(--color-text-muted)]">
                  {deleteRequest.file.original_name}
                </span>
              )}
            </>
          )
        }
        confirmLabel={
          deleteRequest?.kind === "bulk"
            ? t("trashSelectedConfirm", { count: deleteRequest.ids.length })
            : t("trashFileConfirm")
        }
      />

      {/* Upload dialog: upload zone + platform selector. Lives outside the tab
          conditional so the header Upload button works from any tab. */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-xl border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <DialogHeader>
            <DialogTitle>{t("uploadDialogTitle")}</DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              {t("uploadDialogDescription")}
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
