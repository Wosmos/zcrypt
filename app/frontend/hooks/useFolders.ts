"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listFolders,
  createFolder as apiCreateFolder,
  renameFolder as apiRenameFolder,
  deleteFolder as apiDeleteFolder,
} from "@/lib/api";
import { deriveNameKey, encryptName, decryptNameSafe } from "@/lib/name-crypto";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";
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
}

/** Invalidate every cached folder listing (any parent). Folder mutations change
 *  the current parent's children; restoring/cascading can touch others, so we
 *  reconcile the whole `folders` key space — the lists are small. */
function invalidateFolders(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ["folders"] });
}

export function useFolders() {
  const user = useAuthStore((s) => s.user);
  const getPassphrase = usePassphraseStore((s) => s.getPassphrase);
  // Subscribe to the raw cached passphrase (a reactive VALUE, not the stable
  // getPassphrase fn) so this hook re-decrypts the moment the vault is unlocked
  // or locked anywhere — e.g. via the header VaultLock pill.
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);

  const currentFolderId = useFolderStore((s) => s.currentFolderId);
  const breadcrumb = useFolderStore((s) => s.breadcrumb);
  const setCurrentFolder = useFolderStore((s) => s.setCurrentFolder);
  const navigateToCrumbStore = useFolderStore((s) => s.navigateToCrumb);

  // Raw (encrypted) folder list for the current parent — the single source of
  // truth, cached per parent. Names are decrypted client-side below.
  const rawQuery = useQuery({
    queryKey: qk.folders(currentFolderId),
    queryFn: () => listFolders(currentFolderId),
  });

  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  const [locked, setLocked] = useState(false);

  // Cache the derived name key so we don't re-derive (PBKDF2) on every refresh.
  const nameKeyRef = useRef<CryptoKey | null>(null);
  const keyForPassphraseRef = useRef<string | null>(null);

  const getNameKey = useCallback(async (): Promise<CryptoKey | null> => {
    if (!user) return null;
    const passphrase = getPassphrase();
    if (!passphrase) return null;
    if (nameKeyRef.current && keyForPassphraseRef.current === passphrase) {
      return nameKeyRef.current;
    }
    const key = await deriveNameKey(passphrase, user.id);
    nameKeyRef.current = key;
    keyForPassphraseRef.current = passphrase;
    return key;
  }, [user, getPassphrase]);

  // Decrypt folder names whenever the raw list changes OR the vault locks/unlocks
  // (`cachedPassphrase`). A cancel flag drops a stale in-flight decrypt if the
  // folder/passphrase changes before it resolves, so the displayed list always
  // matches the current parent.
  const raw = rawQuery.data;
  useEffect(() => {
    let cancelled = false;
    if (!raw) {
      setFolders([]);
      return;
    }
    // Record protection metadata so any browsed folder can be password-routed
    // by id (the backend has no get-by-id).
    useFolderRegistry.getState().record(raw);
    (async () => {
      const key = await getNameKey();
      if (cancelled) return;
      setLocked(!key);
      const decrypted = await Promise.all(
        raw.map(async (f) => ({
          ...f,
          name: key ? await decryptNameSafe(f.encrypted_name, key) : "[locked]",
          protected: f.pw_salt != null,
        }))
      );
      if (!cancelled) setFolders(decrypted);
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, cachedPassphrase, getNameKey]);

  const refresh = useCallback(async () => {
    await invalidateFolders();
  }, []);

  const createFolder = useCallback(
    async (name: string) => {
      const key = await getNameKey();
      if (!key) throw new Error("Unlock your vault to create folders");
      const trimmed = name.trim();
      // Block a duplicate sibling name (case-insensitive). Folder names are
      // E2E-encrypted so the server can't enforce this — the guard runs here
      // against the decrypted listing of the current folder.
      if (folders.some((f) => f.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`A folder named "${trimmed}" already exists here.`);
      }
      const encrypted_name = await encryptName(trimmed, key);
      await apiCreateFolder({ encrypted_name, parent_id: currentFolderId });
      await invalidateFolders();
    },
    [getNameKey, currentFolderId, folders]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const key = await getNameKey();
      if (!key) throw new Error("Unlock your vault to rename folders");
      const trimmed = name.trim();
      if (folders.some((f) => f.id !== id && f.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`A folder named "${trimmed}" already exists here.`);
      }
      const encrypted_name = await encryptName(trimmed, key);
      await apiRenameFolder(id, encrypted_name);
      await invalidateFolders();
    },
    [getNameKey, folders]
  );

  const deleteFolder = useCallback(async (id: string) => {
    await apiDeleteFolder(id);
    // Deleting a folder soft-deletes its files too (cascade to Trash) — refresh
    // folders AND the vault list / trash / quota so those files don't linger as
    // ghosts in the explorer.
    await invalidateFolders();
    void invalidateFilesViews();
  }, []);

  const openFolder = useCallback(
    (folder: DecryptedFolder) => {
      setCurrentFolder(folder.id, folder.name);
    },
    [setCurrentFolder]
  );

  const navigateToCrumb = useCallback(
    (index: number) => {
      navigateToCrumbStore(index);
    },
    [navigateToCrumbStore]
  );

  return {
    folders,
    loading: rawQuery.isPending,
    locked,
    refresh,
    createFolder,
    renameFolder,
    deleteFolder,
    openFolder,
    navigateToCrumb,
    currentFolderId,
    breadcrumb,
  };
}
