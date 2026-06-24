"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { getFileMeta, rekeyFile, setFolderPassword, removeFolderPassword } from "@/lib/api";
import { resolveFileKey, generateSalt, fromBase64 } from "@/lib/crypto";
import {
  deriveFolderPwSalt,
  makeFolderVerifier,
  verifyFolderPassword,
  rewrapFileKey,
} from "@/lib/folder-crypto";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFileStore } from "@/store/files";
import { usePassphraseStore } from "@/store/passphrase";
import type { UseVaultLock } from "@/hooks/useVaultLock";
import type { FileMetadata } from "@/types";

/**
 * Thrown when the user cancels/closes the folder-unlock modal (FIX-2). Callers
 * that awaited `passwordForFile` / `withFolderPassword` catch this to treat the
 * outcome as a clean "user cancelled" — revert any optimistic state, stop the
 * spinner — rather than surfacing a scary error. Never carries a password.
 */
export class FolderUnlockCancelled extends Error {
  constructor() {
    super("Folder unlock cancelled");
    this.name = "FolderUnlockCancelled";
  }
}

/**
 * useFolderProtection — the ONE owner of per-folder-password UX + crypto routing
 * for the Vault page (spec §3 "UI / integration").
 *
 * Mirrors `useVaultLock` but per folder: it owns a single folder-unlock modal
 * that VERIFIES a typed password via `verifyFolderPassword` before caching it
 * (TTL) in `store/folder-passwords`, and exposes:
 *   - `passwordForFile(file)`     → the right password to decrypt a file
 *                                   (vault pass for unprotected; folder pass for
 *                                   protected, prompting+verifying if uncached).
 *   - `thumbnailPasswordResolver` → a NON-prompting resolver for grid thumbnails
 *                                   (returns null for a locked protected folder).
 *   - `withFolderPassword(folderId, action)` → unlock-then-run for opening a
 *                                   protected folder.
 *   - `protectFolder` / `unprotectFolder` → re-key sweeps across the protection
 *                                   boundary, with progress.
 *   - `rekeyFileForMove`          → re-key one file when it crosses a boundary.
 *
 * Zero-knowledge: folder passwords live only in the in-memory cache, are never
 * sent to the server or logged; only opaque base64 (salt/verifier/wrapped CEK)
 * ever crosses the api layer.
 */

export interface FolderUnlockModalState {
  open: boolean;
  /** Folder being unlocked (id only — the name is shown for context). */
  folderId: string | null;
  folderName: string;
  error: string | null;
  /** Verify a typed password, cache on success, then run the pending action. */
  onConfirm: (password: string) => void;
  onClose: () => void;
}

export interface RekeyProgress {
  /** Human label, e.g. "Protecting folder" / "Removing protection". */
  title: string;
  done: number;
  total: number;
}

export interface UseFolderProtection {
  /**
   * Resolve the decryption password for a file. Unprotected → the vault pass
   * (must be unlocked). Protected folder → the cached folder password, prompting
   * (and verifying) via the folder-unlock modal if not cached. Rejects if the
   * user cancels the prompt or the vault is locked.
   */
  passwordForFile: (file: FileMetadata) => Promise<string>;
  /**
   * Synchronous, NON-prompting resolver for thumbnails. Returns the vault pass
   * for unprotected files, the cached folder pass for an unlocked protected
   * folder, or null (skip — never prompt) for a locked protected folder.
   */
  thumbnailPasswordResolver: (fileId: string, fileById: Map<string, FileMetadata>) => string | null;
  /** True iff a file lives in a folder known to be password-protected. */
  isFileProtected: (file: FileMetadata) => boolean;
  /**
   * Open a protected folder: verify its password, cache it, then run `action`.
   * If the user cancels/closes the unlock modal, `onCancel` runs (FIX-2) so the
   * caller can stop a spinner / revert state — no stuck UI.
   */
  withFolderPassword: (
    folderId: string,
    folderName: string,
    action: () => void,
    onCancel?: () => void
  ) => void;
  /** Clear one folder's cached password (e.g. after a wrong-password decrypt). */
  clearFolderPassword: (folderId: string) => void;
  /**
   * Protect a folder: derive salt + verifier, re-key every file in the folder
   * from the vault passphrase to the new folder password, then persist the
   * protection. Requires the vault unlocked (caller ensures). Reports progress.
   */
  protectFolder: (
    folderId: string,
    newPassword: string,
    filesInFolder: FileMetadata[],
    vaultPassphrase: string,
    onProgress?: (p: RekeyProgress) => void
  ) => Promise<void>;
  /**
   * Unprotect a folder: re-key every file back to the vault passphrase using the
   * (cached/typed) folder password, then remove protection. Reports progress.
   */
  unprotectFolder: (
    folderId: string,
    folderPassword: string,
    filesInFolder: FileMetadata[],
    vaultPassphrase: string,
    onProgress?: (p: RekeyProgress) => void
  ) => Promise<void>;
  /**
   * Re-key one file across a protection boundary: recover its CEK under the
   * source password, rewrap under the destination password with a fresh salt,
   * persist via rekeyFile. Caller does the moveFile AFTER this resolves.
   */
  rekeyFileForMove: (
    fileId: string,
    sourcePassword: string,
    destPassword: string
  ) => Promise<void>;
  /** Spread onto exactly ONE folder-unlock modal rendered by the page. */
  modalState: FolderUnlockModalState;
}

export function useFolderProtection(vault: UseVaultLock): UseFolderProtection {
  const cacheSet = useFolderPasswordStore((s) => s.set);
  const cacheGet = useFolderPasswordStore((s) => s.get);
  const cacheClear = useFolderPasswordStore((s) => s.clear);
  const registryGet = useFolderRegistry((s) => s.get);

  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pending unlock handlers. `onResolve` runs once the folder is unlocked +
  // verified; `onReject` runs if the user cancels/closes the modal (FIX-2) so the
  // awaiting promise rejects with FolderUnlockCancelled instead of hanging forever.
  const pendingRef = useRef<{
    onResolve: (password: string) => void;
    onReject: (err: FolderUnlockCancelled) => void;
  } | null>(null);

  const isFileProtected = useCallback(
    (file: FileMetadata): boolean => {
      const fid = file.folder_id ?? null;
      if (!fid) return false;
      const info = registryGet(fid);
      return info != null && info.pwSalt != null;
    },
    [registryGet]
  );

  const openModal = useCallback(
    (
      fid: string,
      fname: string,
      onResolve: (password: string) => void,
      onReject?: (err: FolderUnlockCancelled) => void
    ) => {
      pendingRef.current = { onResolve, onReject: onReject ?? (() => {}) };
      setFolderId(fid);
      setFolderName(fname);
      setError(null);
      setOpen(true);
    },
    []
  );

  const onConfirm = useCallback(
    async (password: string) => {
      if (!folderId) return;
      const info = registryGet(folderId);
      if (!info || info.pwSalt == null || info.pwVerifier == null) {
        // Should not happen — only protected folders reach this modal.
        setError("This folder is not password-protected.");
        return;
      }
      const ok = await verifyFolderPassword(password, info.pwSalt, info.pwVerifier);
      if (!ok) {
        setError("Incorrect folder password. Please try again.");
        return;
      }
      cacheSet(folderId, password);
      setOpen(false);
      setError(null);
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.onResolve(password);
    },
    [folderId, registryGet, cacheSet]
  );

  // Cancel/close: reject the pending unlock so the awaiting caller can revert its
  // optimistic state and stop cleanly (FIX-2), instead of leaving the promise
  // unresolved forever (the old hang). The reject runs AFTER closing so callers
  // never see a half-open modal.
  const onClose = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setError(null);
    setOpen(false);
    pending?.onReject(new FolderUnlockCancelled());
  }, []);

  const modalState: FolderUnlockModalState = useMemo(
    () => ({ open, folderId, folderName, error, onConfirm, onClose }),
    [open, folderId, folderName, error, onConfirm, onClose]
  );

  const withFolderPassword = useCallback(
    (fid: string, fname: string, action: () => void, onCancel?: () => void) => {
      const cached = cacheGet(fid);
      if (cached) {
        action();
        return;
      }
      // On cancel, run the caller's onCancel so it can stop a spinner / reset
      // state (FIX-2). We swallow the FolderUnlockCancelled here since this entry
      // point is callback-shaped (not promise-shaped).
      openModal(fid, fname, () => action(), () => onCancel?.());
    },
    [cacheGet, openModal]
  );

  const clearFolderPassword = useCallback(
    (fid: string) => cacheClear(fid),
    [cacheClear]
  );

  // Resolve the password for a single file, prompting (and verifying) for a
  // protected folder when its password isn't cached.
  const passwordForFile = useCallback(
    (file: FileMetadata): Promise<string> => {
      const fid = file.folder_id ?? null;
      const info = fid ? registryGet(fid) : null;
      const protectedFolder = !!fid && info != null && info.pwSalt != null;

      if (!protectedFolder) {
        // Unprotected: use the vault passphrase (vault must be unlocked).
        // `withPassphrase` resolves synchronously when unlocked, else after the
        // user confirms the vault modal; if they cancel, the promise stays
        // pending — acceptable (the action simply never runs), mirroring the
        // existing vault flow which also no-ops on cancel.
        return new Promise((resolve) => {
          vault.withPassphrase((pp) => resolve(pp));
        });
      }

      // Protected: cached password wins; otherwise prompt + verify. On cancel the
      // promise REJECTS with FolderUnlockCancelled (FIX-2) so the move/download/
      // preview caller can revert cleanly instead of hanging on a dead promise.
      const cached = cacheGet(fid!);
      if (cached) return Promise.resolve(cached);

      const name = folderNameFor(fid!);
      return new Promise((resolve, reject) => {
        openModal(
          fid!,
          name,
          (pw) => resolve(pw),
          (err) => reject(err)
        );
      });
    },
    [registryGet, cacheGet, vault, openModal]
  );

  // Best-effort folder name for the prompt (we only have ids here). The modal
  // shows "this folder" when no name is known.
  const folderNameFor = (_fid: string): string => "this folder";

  // Non-prompting thumbnail resolver: vault pass for unprotected, cached folder
  // pass for unlocked protected, null for locked protected (skip silently).
  const thumbnailPasswordResolver = useCallback(
    (fileId: string, fileById: Map<string, FileMetadata>): string | null => {
      const file = fileById.get(fileId);
      const fid = file?.folder_id ?? null;
      const info = fid ? registryGet(fid) : null;
      const protectedFolder = !!fid && info != null && info.pwSalt != null;
      if (!protectedFolder) {
        // Read the cached vault passphrase directly (no prompt) — caller only
        // batch-loads thumbnails while the vault is unlocked.
        return readVaultPassphrase();
      }
      return cacheGet(fid!); // null if the folder is locked → thumbnail skipped
    },
    [registryGet, cacheGet]
  );

  // ── Re-key sweeps ───────────────────────────────────────────────────────────

  const rekeyOneFile = useCallback(
    async (fileId: string, sourcePassword: string, destPassword: string): Promise<void> => {
      const meta = await getFileMeta(fileId);
      const salt = fromBase64(meta.salt);
      // Recover the EXISTING CEK under the source password (never regenerate it —
      // the file's chunks must stay decryptable). Throws on wrong source password.
      const cekBuf = await resolveFileKey(sourcePassword, salt, meta.wrapped_cek);
      const cek = new Uint8Array(cekBuf);
      // Rewrap that same CEK under the destination password with a fresh salt.
      const newSalt = generateSalt();
      const { salt: saltB64, wrapped_cek } = await rewrapFileKey(cek, destPassword, newSalt);
      // Persist only after the rewrap is proven (the new wrapped_cek decrypts the
      // recovered CEK by construction) — the server never sees keys.
      await rekeyFile(fileId, saltB64, wrapped_cek);
    },
    []
  );

  const rekeyFileForMove = useCallback(
    (fileId: string, sourcePassword: string, destPassword: string) =>
      rekeyOneFile(fileId, sourcePassword, destPassword),
    [rekeyOneFile]
  );

  const protectFolder = useCallback(
    async (
      fid: string,
      newPassword: string,
      filesInFolder: FileMetadata[],
      vaultPassphrase: string,
      onProgress?: (p: RekeyProgress) => void
    ): Promise<void> => {
      const pwSalt = deriveFolderPwSalt();
      const verifier = await makeFolderVerifier(newPassword, pwSalt);

      // Re-key existing files (uploaded under the vault passphrase) to the new
      // folder password BEFORE persisting protection. Each rekeyFile only ever
      // persists a proven-decryptable wrapped_cek (no data loss), but a partial
      // failure would leave SOME files folder-keyed while the folder is still
      // unprotected — so on failure we roll the re-keyed files BACK to the vault
      // pass, restoring a fully-consistent unprotected state before re-throwing.
      const total = filesInFolder.length;
      const rekeyed: string[] = [];
      const rollbackSweep = async () => {
        for (const id of rekeyed) {
          try {
            await rekeyOneFile(id, newPassword, vaultPassphrase);
          } catch {
            // Best-effort rollback; the file's CEK is intact either way.
          }
        }
      };
      onProgress?.({ title: "Protecting folder", done: 0, total });
      try {
        for (let i = 0; i < filesInFolder.length; i++) {
          await rekeyOneFile(filesInFolder[i].id, vaultPassphrase, newPassword);
          rekeyed.push(filesInFolder[i].id);
          onProgress?.({ title: "Protecting folder", done: i + 1, total });
        }
      } catch (err) {
        await rollbackSweep();
        throw err;
      }

      // Persist the protection record (opaque salt + verifier). If THIS fails
      // (FIX-5) the files are already folder-keyed but the server still shows the
      // folder unprotected — roll the sweep back to the vault pass so the folder
      // + its files end fully consistent (unprotected) before re-throwing.
      try {
        await setFolderPassword(fid, pwSalt, verifier);
      } catch (err) {
        await rollbackSweep();
        throw err;
      }
      // Update the local registry + cache the password (verified by construction).
      useFolderRegistry.getState().record([
        {
          id: fid,
          user_id: "",
          encrypted_name: "",
          created_at: "",
          pw_salt: pwSalt,
          pw_verifier: verifier,
        },
      ]);
      cacheSet(fid, newPassword);
    },
    [rekeyOneFile, cacheSet]
  );

  const unprotectFolder = useCallback(
    async (
      fid: string,
      folderPassword: string,
      filesInFolder: FileMetadata[],
      vaultPassphrase: string,
      onProgress?: (p: RekeyProgress) => void
    ): Promise<void> => {
      // Re-key every file back to the vault passphrase BEFORE removing protection
      // (so files are recoverable with the vault pass once protection is gone).
      // On a partial failure, roll the re-keyed files BACK to the folder password
      // so the still-protected folder stays fully consistent, then re-throw.
      const total = filesInFolder.length;
      const rekeyed: string[] = [];
      const rollbackSweep = async () => {
        for (const id of rekeyed) {
          try {
            await rekeyOneFile(id, vaultPassphrase, folderPassword);
          } catch {
            // Best-effort rollback; the file's CEK is intact either way.
          }
        }
      };
      onProgress?.({ title: "Removing protection", done: 0, total });
      try {
        for (let i = 0; i < filesInFolder.length; i++) {
          await rekeyOneFile(filesInFolder[i].id, folderPassword, vaultPassphrase);
          rekeyed.push(filesInFolder[i].id);
          onProgress?.({ title: "Removing protection", done: i + 1, total });
        }
      } catch (err) {
        await rollbackSweep();
        throw err;
      }

      // Remove the protection record. If THIS fails (FIX-5) the files are already
      // vault-keyed but the server still shows the folder protected — roll the
      // sweep back to the folder password so the still-protected folder + its
      // files end fully consistent before re-throwing.
      try {
        await removeFolderPassword(fid);
      } catch (err) {
        await rollbackSweep();
        throw err;
      }
      // Clear local protection state + cached password.
      useFolderRegistry.getState().record([
        {
          id: fid,
          user_id: "",
          encrypted_name: "",
          created_at: "",
          pw_salt: null,
          pw_verifier: null,
        },
      ]);
      cacheClear(fid);
    },
    [rekeyOneFile, cacheClear]
  );

  return {
    passwordForFile,
    thumbnailPasswordResolver,
    isFileProtected,
    withFolderPassword,
    clearFolderPassword,
    protectFolder,
    unprotectFolder,
    rekeyFileForMove,
    modalState,
  };
}

// Read the cached vault passphrase without subscribing / prompting (the caller
// only batch-loads thumbnails while the vault is unlocked).
function readVaultPassphrase(): string | null {
  return usePassphraseStore.getState().getPassphrase();
}

/**
 * Thrown by `resolveFilePasswordGlobal` when a file lives in a protected folder
 * whose password isn't cached. The transfer manager / download store catch this
 * to route through the page's unlock flow (vault modal opens, then the action
 * re-runs) and, on a subsequent wrong password, to clear + re-prompt.
 */
export class FolderPasswordRequired extends Error {
  readonly folderId: string;
  constructor(folderId: string) {
    super("Folder password required");
    this.name = "FolderPasswordRequired";
    this.folderId = folderId;
  }
}

/**
 * Standalone, NON-prompting, folder-aware password resolver for a single file
 * (FIX-4). Reads only the global singleton stores — the file list (to find the
 * file's folder), the folder registry (protection metadata), the folder-password
 * cache, and the vault passphrase — so it works OUTSIDE the React tree (e.g. the
 * docked TransferManager and the download store's retry/bulk paths), exactly
 * mirroring `useFolderProtection.passwordForFile` minus the prompt.
 *
 *   - Unprotected file → the cached vault passphrase (throws if the vault is
 *     locked — the caller's onNeedUnlock opens the vault modal).
 *   - Protected-folder file, password cached → that folder password.
 *   - Protected-folder file, NOT cached → throws FolderPasswordRequired so the
 *     caller can prompt + retry (mirrors the preview recovery).
 *
 * Zero-knowledge: returns an in-memory password only; never reads/writes the
 * server and never logs.
 */
export async function resolveFilePasswordGlobal(fileId: string): Promise<string> {
  const file = useFileStore.getState().files.find((f) => f.id === fileId);
  const fid = file?.folder_id ?? null;
  const protectedFolder = fid != null && useFolderRegistry.getState().isProtected(fid);

  if (!protectedFolder) {
    const vaultPass = usePassphraseStore.getState().getPassphrase();
    if (!vaultPass) throw new Error("Vault is locked");
    return vaultPass;
  }

  const cached = useFolderPasswordStore.getState().get(fid!);
  if (cached) return cached;
  throw new FolderPasswordRequired(fid!);
}
