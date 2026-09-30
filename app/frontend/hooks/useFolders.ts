"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listFolders,
  createFolder as apiCreateFolder,
  renameFolder as apiRenameFolder,
  deleteFolder as apiDeleteFolder,
  updateFolderStyle as apiUpdateFolderStyle,
} from "@/lib/api";
import { encryptName, encryptStyle, type CustomStyle } from "@/lib/name-crypto";
import { userNameKey, LOCKED } from "@/lib/sealed";
import { ensureNames, peekName, peekStyle, subscribeNames, getNamesEpoch } from "@/lib/file-names";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";
import { useFolderStore } from "@/store/folders";
import { useFolderRegistry } from "@/store/folder-registry";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { invalidateFilesViews } from "@/lib/invalidate";
import type { Folder } from "@/types";

export interface DecryptedFolder extends Folder {
  name: string;
  /** Derived: true iff the folder has password protection (`pw_salt != null`). */
  protected: boolean;
  /** Custom card style (icon + color), decrypted from `encrypted_style`. Null when unset/locked/corrupt. */
  style: CustomStyle | null;
}

/** Invalidate every cached folder listing (any parent). Folder mutations change
 *  the current parent's children; restoring/cascading can touch others, so we
 *  reconcile the whole `folders` key space: the lists are small. */
function invalidateFolders(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ["folders"] });
}

/** Resolve a raw folder list against the in-memory name maps. While unlocked, a
 *  name still being decrypted reads as "" for a frame rather than "[locked]". */
function resolveFolders(raw: Folder[], unlocked: boolean, _epoch?: number): DecryptedFolder[] {
  return raw.map((f) => ({
    ...f,
    name: unlocked ? (peekName(f.encrypted_name) ?? "") : LOCKED,
    protected: f.pw_salt != null,
    style: unlocked ? peekStyle(f.encrypted_style) : null,
  }));
}

const EMPTY: DecryptedFolder[] = [];

export function useFolders() {
  // Subscribe to the raw cached passphrase (a reactive VALUE) so names flip the
  // moment the vault is unlocked or locked anywhere, e.g. via the header pill.
  const hasUser = useAuthStore((s) => s.user != null);
  const unlocked = usePassphraseStore((s) => s.cachedPassphrase != null) && hasUser;
  const epoch = useSyncExternalStore(subscribeNames, getNamesEpoch, getNamesEpoch);

  const currentFolderId = useFolderStore((s) => s.currentFolderId);
  const breadcrumb = useFolderStore((s) => s.breadcrumb);
  const setCurrentFolder = useFolderStore((s) => s.setCurrentFolder);
  const navigateToCrumbStore = useFolderStore((s) => s.navigateToCrumb);

  // The cache holds the raw (encrypted) listing per parent, which is what gets
  // persisted. Names are resolved in `select` from the shared name maps, so an
  // unlock or a revisit re-derives from cache with no refetch.
  const select = useCallback(
    (raw: Folder[]) => resolveFolders(raw, unlocked, epoch),
    [epoch, unlocked],
  );
  const query = useQuery({
    queryKey: qk.folders(currentFolderId),
    queryFn: () => listFolders(currentFolderId),
    select,
  });
  const folders = query.data ?? EMPTY;

  // Record protection metadata so any browsed folder can be password-routed by
  // id (the backend has no get-by-id), and decrypt any names not seen yet.
  const updatedAt = query.dataUpdatedAt;
  useEffect(() => {
    const raw = queryClient.getQueryData<Folder[]>(qk.folders(currentFolderId));
    if (!raw) return;
    useFolderRegistry.getState().record(raw);
    if (unlocked)
      void ensureNames(
        raw.map((f) => f.encrypted_name),
        raw.map((f) => f.encrypted_style),
      );
  }, [updatedAt, currentFolderId, unlocked]);

  const refresh = useCallback(async () => {
    await invalidateFolders();
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      const key = await userNameKey();
      if (!key) throw new Error("Unlock your vault to create folders");
      const trimmed = name.trim();
      // Block a duplicate sibling name (case-insensitive). Folder names are
      // E2E-encrypted so the server can't enforce this, the guard runs here
      // against the decrypted listing of the current folder.
      if (folders.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`A folder named "${trimmed}" already exists here.`);
      }
      const encrypted_name = await encryptName(trimmed, key);
      await apiCreateFolder({ encrypted_name, parent_id: currentFolderId });
      await invalidateFolders();
    },
    [currentFolderId, folders],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const key = await userNameKey();
      if (!key) throw new Error("Unlock your vault to rename folders");
      const trimmed = name.trim();
      if (
        folders.some((f) => f.id !== id && f.name.trim().toLowerCase() === trimmed.toLowerCase())
      ) {
        throw new Error(`A folder named "${trimmed}" already exists here.`);
      }
      const encrypted_name = await encryptName(trimmed, key);
      await apiRenameFolder(id, encrypted_name);
      await invalidateFolders();
    },
    [folders],
  );

  const updateFolderStyle = useCallback(async (folderId: string, style: CustomStyle | null) => {
    const key = await userNameKey();
    if (!key) throw new Error("Unlock your vault to customize folders");
    const encrypted_style = style ? await encryptStyle(style, key) : null;
    await apiUpdateFolderStyle(folderId, encrypted_style);
    await invalidateFolders();
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    await apiDeleteFolder(id);
    // Deleting a folder soft-deletes its files too (cascade to Trash), refresh
    // folders AND the vault list / trash / quota so those files don't linger as
    // ghosts in the explorer.
    await invalidateFolders();
    void invalidateFilesViews();
  }, []);

  const openFolder = useCallback(
    (folder: DecryptedFolder) => {
      setCurrentFolder(folder.id, folder.name);
    },
    [setCurrentFolder],
  );

  const navigateToCrumb = useCallback(
    (index: number) => {
      navigateToCrumbStore(index);
    },
    [navigateToCrumbStore],
  );

  return {
    folders,
    loading: query.isPending,
    locked: !unlocked,
    refresh,
    createFolder,
    renameFolder,
    updateFolderStyle,
    deleteFolder,
    openFolder,
    navigateToCrumb,
    currentFolderId,
    breadcrumb,
  };
}
