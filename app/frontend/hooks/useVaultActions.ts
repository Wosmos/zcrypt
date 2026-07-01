"use client";

import { useCallback, useEffect, useMemo } from "react";
import { isTauri } from "@/lib/tauri";
import { primeThumbnails } from "@/hooks/useThumbnail";
import { ensureUserKeypair } from "@/lib/keys";
import { useUploadStore } from "@/store/upload";
import { useDownloadStore } from "@/store/download";
import { usePassphraseStore } from "@/store/passphrase";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import { useNotifications } from "@/hooks/useNotifications";
import { notifications as notifActions } from "@/store/notifications";
import { deleteFile, bulkDeleteFiles, moveFile } from "@/lib/api";
import { invalidateTrash } from "@/store/trash";
import { clearDecryptCacheForFile } from "@/lib/decrypt-cache";
import { toast } from "@/store/toast";
import { formatBytes } from "@/lib/utils";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { IncorrectPassphraseError } from "@/lib/crypto";
import { FolderUnlockCancelled } from "@/hooks/useFolderProtection";
import type { FileMetadata, QuotaInfo } from "@/types";
import type { UseVaultLock } from "@/hooks/useVaultLock";
import type { UseFolderProtection } from "@/hooks/useFolderProtection";

/**
 * useVaultActions — all the crypto / upload / download / preview / delete /
 * share / move / bulk handlers for the Vault page, lifted out of the page so it
 * reads as composition (REBUILD_SPEC §6). Every decrypt action routes through
 * the ONE vault unlock (`vault.withPassphrase`) — there is never a bespoke
 * per-file passphrase prompt (spec §3).
 *
 * Zero-knowledge: the passphrase is only ever read from the vault cache and
 * handed to client-side store methods / in-memory decrypt. It is never sent to
 * the server and never logged.
 */

interface UseVaultActionsArgs {
  vault: UseVaultLock;
  files: FileMetadata[];
  quotaInfo: QuotaInfo | null;
  selectedPlatform: string | null;
  refresh: () => Promise<void>;
  refreshQuota: () => Promise<void>;
  setFiles: (files: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[])) => void;
  /** Open a blob preview (already-decrypted plaintext) via useFilePreview. */
  openPreview: (blob: Blob | null, filename: string, fileSize: number) => void;
  closePreview: () => void;
  /** Per-folder-password routing + re-key orchestration (spec §3). */
  folderProtection: UseFolderProtection;
  /** The folder the explorer is currently browsing — uploads land here, and
   *  uploads into a protected folder are wrapped with its folder password. */
  currentFolderId: string | null;
}

export interface VaultActions {
  /** Upload entry point — dupe detection + quota guard + vault unlock. */
  handleFilesSelected: (selectedFiles: File[]) => void;
  /** Single-file download (filename-keyed, matches the explorer callback). */
  handleDownload: (filename: string) => void;
  /** In-memory decrypt + integrity check + media preview. */
  handlePreview: (filename: string) => void;
  /** Optimistic drag-to-move reparent (re-keys across a protection boundary). */
  handleMoveFileTo: (fileId: string, folderId: string | null) => void;
  /** Move a file via the dialog, re-keying first if it crosses a protection
   *  boundary. Awaitable; throws on failure so the dialog can surface it. */
  moveFileWithRekey: (fileId: string, destFolderId: string | null) => Promise<void>;
  /** Bulk ZIP download (2GB cap warning). */
  handleBulkDownload: (ids: string[]) => void;
  /** Run the actual soft-delete (optimistic) for a confirmed target. */
  executeDelete: (target: FileMetadata) => void;
  /** Run the actual bulk soft-delete (optimistic). */
  executeBulkDelete: (ids: string[]) => Promise<void>;
}

export function useVaultActions({
  vault,
  files,
  quotaInfo,
  selectedPlatform,
  refresh,
  refreshQuota,
  setFiles,
  openPreview,
  closePreview,
  folderProtection,
  currentFolderId,
}: UseVaultActionsArgs): VaultActions {
  const { statuses } = usePlatformHealth();
  const { startUpload: storeStartUpload, startDesktopUpload } = useUploadStore();
  const updateStatus = useUploadStore((s) => s.updateStatus);
  const setUploadError = useUploadStore((s) => s.setError);
  const storeStartDownload = useDownloadStore((s) => s.startDownload);
  const startBulkZipDownload = useDownloadStore((s) => s.startBulkZipDownload);
  const downloadQueue = useDownloadStore((s) => s.queue);
  const { notify } = useNotifications();

  // A fast id->file lookup for the per-file password resolvers (download / bulk /
  // thumbnail), so a file in a protected folder uses its folder password.
  const fileById = useMemo(() => {
    const m = new Map<string, FileMetadata>();
    for (const f of files) m.set(f.id, f);
    return m;
  }, [files]);

  // ── Thumbnails: batch-load whenever the vault is unlocked + files exist ─────
  // Read the cached passphrase directly (guarded on `unlocked`, so this never
  // prompts) and never log it. `vault.unlocked` is the only reactive trigger we
  // care about; `files` re-runs when the list changes. Protected-folder files
  // route through the NON-prompting thumbnail resolver (locked ones are skipped).
  // We also re-run when a folder password is cached so newly-unlocked protected
  // folders get their thumbnails.
  const vaultUnlocked = vault.unlocked;
  const folderPwCache = useFolderPasswordStore((s) => s.cache);
  const thumbnailResolver = folderProtection.thumbnailPasswordResolver;
  useEffect(() => {
    if (!vaultUnlocked || files.length === 0) return;
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (passphrase) {
      // Arm lazy generation; each card generates its own thumbnail on render.
      primeThumbnails(passphrase, (fileId) => thumbnailResolver(fileId, fileById));
      // Ensure this account has an X25519 keypair (foundation for sharing).
      ensureUserKeypair(passphrase);
    }
  }, [files, vaultUnlocked, folderPwCache, thumbnailResolver, fileById]);

  // ── SSE events from the backend pipeline → upload store ─────────────────────
  useOperationStatus((event) => {
    if (!event.file_id) return;
    const { findByFileId } = useUploadStore.getState();
    const target = findByFileId(event.file_id);
    if (!target) return;

    const stageLower = event.stage.toLowerCase();
    if (stageLower.startsWith("error:")) {
      const errorMsg = event.stage.substring(7);
      setUploadError(target.id, errorMsg);
      notifActions.uploadFailed(target.file.name, errorMsg);
      return;
    }

    const status =
      stageLower === "done"
        ? ("done" as const)
        : stageLower.includes("encrypt")
          ? ("encrypting" as const)
          : ("uploading" as const);
    updateStatus(target.id, status, event.percent, event.stage, event.bytes_processed, event.total_bytes);
    if (stageLower === "done") {
      notify(`Upload complete`, { body: target.file.name, tag: "upload-done" });
      notifActions.uploadComplete(target.file.name);
    }
  });

  // ── Upload ──────────────────────────────────────────────────────────────────
  // `wrapPassphrase` wraps the CEK at init: the FOLDER password for a protected
  // current folder, else the vault passphrase. `folderId` files the upload into
  // the current folder. Unprotected uploads pass the vault pass exactly as today.
  const startUpload = useCallback(
    (uploadFiles: File[], wrapPassphrase: string, folderId: string | null) => {
      // Desktop: native picker + sidecar (no browser File data transfer).
      if (isTauri) {
        startDesktopUpload(wrapPassphrase, refresh);
        return;
      }
      // 0/unset means "unlimited" → defer to the device-profile default.
      const maxConcurrent = quotaInfo?.max_concurrent_uploads || undefined;
      // Large files prefer HuggingFace direct upload when connected.
      const hfConnected = statuses.some((s) => s.platform === "huggingface" && s.connected);
      storeStartUpload(
        uploadFiles,
        wrapPassphrase,
        selectedPlatform ?? undefined,
        maxConcurrent,
        refresh,
        hfConnected,
        folderId
      );
    },
    [selectedPlatform, storeStartUpload, startDesktopUpload, refresh, quotaInfo, statuses]
  );

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      // Managed storage / personal tokens must be available.
      if (quotaInfo && !quotaInfo.can_upload) {
        toast.warning("No storage platform connected. Go to Settings to connect one.");
        return;
      }

      const dupes: string[] = [];
      const uniqueFiles = selectedFiles.filter((f) => {
        const exists = files.some(
          (existing) => existing.original_name === f.name && existing.original_size === f.size
        );
        if (exists) dupes.push(f.name);
        return !exists;
      });

      if (dupes.length > 0) {
        const names =
          dupes.length <= 3 ? dupes.join(", ") : `${dupes.slice(0, 3).join(", ")} +${dupes.length - 3} more`;
        toast.warning(`Skipped ${dupes.length} duplicate${dupes.length > 1 ? "s" : ""}: ${names}`);
      }

      if (uniqueFiles.length === 0) return;

      const destFolderId = currentFolderId;
      const folderProtected =
        destFolderId != null && useFolderRegistry.getState().isProtected(destFolderId);

      // Uploading into a PROTECTED folder: wrap the CEK with the FOLDER password.
      // The vault must still be unlocked (folder names + the rest of the app), and
      // the folder must be unlocked too — withFolderPassword prompts/verifies if
      // its password isn't cached.
      if (folderProtected) {
        vault.withPassphrase(() => {
          folderProtection.withFolderPassword(destFolderId!, "this folder", () => {
            const folderPw = useFolderPasswordStore.getState().get(destFolderId!);
            if (!folderPw) return; // cancelled / expired between prompt and run
            startUpload(uniqueFiles, folderPw, destFolderId);
          });
        });
        return;
      }

      // Unprotected (Root or a plain folder): vault passphrase wraps the CEK,
      // exactly as today. Runs immediately if already unlocked.
      vault.withPassphrase((passphrase) => {
        primeThumbnails(passphrase, (fileId) => thumbnailResolver(fileId, fileById));
        startUpload(uniqueFiles, passphrase, destFolderId);
      });
    },
    [quotaInfo, files, vault, startUpload, currentFolderId, folderProtection, thumbnailResolver, fileById]
  );

  // A per-file resolver passed into the decrypt pipeline. For a protected-folder
  // file it returns the (cached or just-verified) folder password; on a wrong
  // password it clears that folder's cache + re-prompts (mirrors the vault wrong-
  // passphrase flow). For everything else it returns the vault passphrase.
  const resolvePasswordForFile = useCallback(
    (fileId: string): Promise<string> => {
      const file = fileById.get(fileId);
      if (!file) return Promise.reject(new Error("File not found"));
      return folderProtection.passwordForFile(file);
    },
    [fileById, folderProtection]
  );

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(
    (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;
      const active = downloadQueue.find(
        (d) => d.fileId === file.id && d.status === "downloading"
      );
      if (active) return; // already downloading

      // Gate on the vault (folder-name decryption + the unprotected case); the
      // per-file resolver swaps in the folder password for protected files.
      vault.withPassphrase((passphrase) => {
        storeStartDownload(file.id, filename, file.original_size, passphrase, resolvePasswordForFile);
      });
    },
    [files, downloadQueue, vault, storeStartDownload, resolvePasswordForFile]
  );

  // ── Bulk ZIP download ───────────────────────────────────────────────────────
  const handleBulkDownload = useCallback(
    (ids: string[]) => {
      const filesToDownload = files.filter((f) => ids.includes(f.id));
      if (filesToDownload.length === 0) return;
      const totalSize = filesToDownload.reduce((s, f) => s + f.original_size, 0);
      const MAX_ZIP_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
      if (totalSize > MAX_ZIP_SIZE) {
        toast.warning(
          `Selected files total ${formatBytes(totalSize)} — too large for ZIP. Download individually instead.`
        );
        return;
      }
      const bulkFiles = filesToDownload.map((f) => ({
        fileId: f.id,
        filename: f.original_name,
        fileSize: f.original_size,
      }));
      vault.withPassphrase((passphrase) => {
        startBulkZipDownload(bulkFiles, passphrase, resolvePasswordForFile);
      });
    },
    [files, vault, startBulkZipDownload, resolvePasswordForFile]
  );

  // ── Preview (in-memory decrypt + zstd + SHA-256 integrity check) ────────────
  const startPreview = useCallback(
    async (filename: string) => {
      const file = files.find((f) => f.original_name === filename);
      if (!file) return;

      openPreview(null, filename, file.original_size);

      try {
        // Resolve the right password (vault, or folder pass for a protected
        // folder — prompting/verifying if its password isn't cached).
        const passphrase = await folderProtection.passwordForFile(file);

        const { getFileMeta, getFileChunk } = await import("@/lib/api");
        const { resolveFileKey, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
        const { getZstdCodec } = await import("@/lib/zstd");
        const zstd = await getZstdCodec();

        const meta = await getFileMeta(file.id);
        const salt = fromBase64(meta.salt);
        const keyBytes = await resolveFileKey(passphrase, salt, meta.wrapped_cek);

        const chunks: Uint8Array[] = [];
        for (let i = 0; i < meta.chunk_count; i++) {
          const { data, compressed } = await getFileChunk(file.id, i);
          let plain = await decryptChunk(keyBytes, new Uint8Array(data));
          if (compressed && zstd) {
            // ZstdStream (not ZstdSimple): doesn't require frame content size.
            plain = zstd.ZstdStream.decompress(plain);
          }
          chunks.push(plain);
        }

        const totalSize = chunks.reduce((s, c) => s + c.byteLength, 0);
        const full = new Uint8Array(totalSize);
        let offset = 0;
        for (const c of chunks) {
          full.set(c, offset);
          offset += c.byteLength;
        }

        const hash = await sha256Hex(full);
        if (hash !== meta.sha256) throw new Error("File integrity check failed");

        const blob = new Blob([full], { type: "application/octet-stream" });
        openPreview(blob, filename, file.original_size);
      } catch (err) {
        closePreview();
        const msg = err instanceof Error ? err.message : "Preview failed";
        const looksLikeWrongKey =
          msg.toLowerCase().includes("decrypt") ||
          msg.toLowerCase().includes("passphrase") ||
          msg.toLowerCase().includes("cipher") ||
          err instanceof IncorrectPassphraseError;

        if (looksLikeWrongKey) {
          const fid = file.folder_id ?? null;
          if (fid && useFolderRegistry.getState().isProtected(fid)) {
            // Wrong FOLDER password → clear that folder's cache + re-prompt the
            // folder unlock with an inline error, then retry the same preview.
            folderProtection.clearFolderPassword(fid);
            folderProtection.withFolderPassword(fid, "this folder", () => {
              void startPreview(filename);
            });
          } else {
            // Wrong VAULT passphrase → re-lock and re-prompt the single vault
            // modal with an inline error, then retry once unlocked.
            vault.lock();
            vault.setError("Incorrect passphrase. Please try again.");
            vault.reopen(() => void startPreview(filename));
          }
        } else {
          toast.error(msg);
        }
      }
    },
    [files, vault, openPreview, closePreview, folderProtection]
  );

  const handlePreview = useCallback(
    (filename: string) => {
      // Gate on the vault (so folder names/the rest of the app are usable); the
      // per-file resolver inside startPreview swaps in the folder password.
      vault.withPassphrase(() => {
        void startPreview(filename);
      });
    },
    [vault, startPreview]
  );

  // ── Move (with cross-protection-boundary re-key) ────────────────────────────
  // Resolve the password that decrypts files in a given "zone" (folder): the
  // folder password for a protected folder (prompting/verifying if uncached), or
  // the vault passphrase otherwise. Reuses passwordForFile by giving it a probe
  // file scoped to the target folder.
  const passwordForZone = useCallback(
    (folderId: string | null): Promise<string> =>
      folderProtection.passwordForFile({
        id: "",
        original_name: "",
        original_size: 0,
        compressed_size: 0,
        encrypted_size: 0,
        chunk_count: 0,
        sha256: "",
        created_at: "",
        folder_id: folderId,
      }),
    [folderProtection]
  );

  // Move a file to `destFolderId`, re-keying first if it crosses a protection
  // boundary (vault↔protected, protected↔protected). Returns a promise so the
  // MoveToFolderDialog can await it; throws on failure so the caller reverts.
  const moveFileWithRekey = useCallback(
    async (fileId: string, destFolderId: string | null) => {
      const file = fileById.get(fileId);
      if (!file) throw new Error("File not found");
      const srcFolderId = file.folder_id ?? null;
      if (srcFolderId === destFolderId) return; // no-op

      const reg = useFolderRegistry.getState();
      const srcProtected = srcFolderId != null && reg.isProtected(srcFolderId);
      const destProtected = destFolderId != null && reg.isProtected(destFolderId);

      // Same protection zone (both unprotected, OR both protected by the SAME
      // folder password — but distinct folders never share a key, so "both
      // protected" still means different keys) ⇒ re-key only when the key
      // actually changes. Unprotected→unprotected needs no re-key.
      if (!srcProtected && !destProtected) {
        await moveFile(fileId, destFolderId);
        // Drop cached plaintext tagged with the old folder (covers the dialog
        // move path; the drag path evicts optimistically too — both are safe).
        clearDecryptCacheForFile(fileId);
        return;
      }

      // Crosses a boundary: recover the CEK under the source password, rewrap
      // under the destination password (new salt), persist, THEN move. Prompts
      // for whichever side's password isn't cached.
      const sourcePassword = await passwordForZone(srcFolderId);
      const destPassword = await passwordForZone(destFolderId);
      await folderProtection.rekeyFileForMove(fileId, sourcePassword, destPassword);
      await moveFile(fileId, destFolderId);
      clearDecryptCacheForFile(fileId);
    },
    [fileById, passwordForZone, folderProtection]
  );

  // Optimistic drag-to-move reparent. Re-keys across a protection boundary
  // first; an unprotected→unprotected move is byte-for-byte the same as before.
  const handleMoveFileTo = useCallback(
    (fileId: string, folderId: string | null) => {
      const file = files.find((f) => f.id === fileId);
      if (!file) return;
      const originalFolderId = file.folder_id ?? null;
      if (originalFolderId === folderId) return; // already there
      // Functional update against the LIVE cache — NOT the render-time `files`
      // snapshot. A bulk drag / folder-merge fires this once per file in the same
      // tick; mapping over a captured snapshot made each call clobber the last
      // (only one file actually moved). Composing off `cur` moves every file.
      setFiles((cur) => cur.map((f) => (f.id === fileId ? { ...f, folder_id: folderId } : f)));
      // The cached plaintext is tagged with the file's OLD folder; drop it so a
      // later folder re-lock can't serve it under the wrong zone, and so it
      // re-decrypts under the destination folder's key if that changed.
      clearDecryptCacheForFile(fileId);
      toast.success(
        folderId === null ? `Moved "${file.original_name}" to Root` : `Moved "${file.original_name}"`
      );
      // Revert THIS file only (functionally) on failure — never a whole-list
      // snapshot, which would undo sibling moves still in flight from the same
      // bulk action.
      const revertThisFile = () =>
        setFiles((cur) =>
          cur.map((f) => (f.id === fileId ? { ...f, folder_id: originalFolderId } : f))
        );
      moveFileWithRekey(fileId, folderId).catch((err) => {
        // FIX-2: the user cancelled the folder-unlock prompt — revert quietly
        // (a soft, non-error hint), no scary toast and no reconcile fetch
        // (nothing changed server-side).
        if (err instanceof FolderUnlockCancelled) {
          revertThisFile();
          toast.info("Move cancelled");
          return;
        }
        toast.error(err instanceof Error ? err.message : "Failed to move file");
        revertThisFile();
        void refresh(); // reconcile the row's true folder/key state
      });
    },
    [files, setFiles, moveFileWithRekey, refresh]
  );

  // ── Delete (optimistic soft-delete → Trash) ─────────────────────────────────
  const executeDelete = useCallback(
    (target: FileMetadata) => {
      setFiles((cur) => cur.filter((f) => f.id !== target.id));
      clearDecryptCacheForFile(target.id);
      toast.success("File deleted");
      refreshQuota();
      // Fire-and-forget; reconcile against the server on failure (refresh, not a
      // captured snapshot, to avoid resurrecting a concurrently-deleted file).
      deleteFile(target.id)
        .then(() => {
          // The row now lives in Trash — keep that view in sync.
          void invalidateTrash();
        })
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : "Delete failed");
          refresh();
          refreshQuota();
        });
    },
    [files, setFiles, refresh, refreshQuota]
  );

  const executeBulkDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      // Optimistic: drop the rows instantly — no spinner wait.
      setFiles((cur) => cur.filter((f) => !idSet.has(f.id)));
      ids.forEach((id) => clearDecryptCacheForFile(id));
      try {
        const result = await bulkDeleteFiles(ids);
        if (result.failed > 0) {
          toast.warning(`${result.deleted} deleted, ${result.failed} failed`);
          refresh(); // reconcile the partial failure against the server
        } else {
          toast.success(`Deleted ${result.deleted} file${result.deleted !== 1 ? "s" : ""}`);
        }
        // Deleted rows now live in Trash.
        void invalidateTrash();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bulk delete failed");
        refresh();
      } finally {
        refreshQuota();
      }
    },
    [files, setFiles, refresh, refreshQuota]
  );

  return {
    handleFilesSelected,
    handleDownload,
    handlePreview,
    handleMoveFileTo,
    moveFileWithRekey,
    handleBulkDownload,
    executeDelete,
    executeBulkDelete,
  };
}
