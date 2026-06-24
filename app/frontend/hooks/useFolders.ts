"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { Folder } from "@/types";

export interface DecryptedFolder extends Folder {
  name: string;
  /** Derived: true iff the folder has password protection (`pw_salt != null`). */
  protected: boolean;
}

export function useFolders() {
  const user = useAuthStore((s) => s.user);
  const getPassphrase = usePassphraseStore((s) => s.getPassphrase);
  // Subscribe to the raw cached passphrase (a reactive VALUE, not the stable
  // getPassphrase fn) so this hook re-runs the moment the vault is unlocked or
  // locked anywhere — e.g. via the header VaultLock pill. Without this, folder
  // names stay stuck at "[locked]" after unlocking and `locked` stays
  // stale-true, which makes folder create/rename re-prompt for a passphrase the
  // user already entered.
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);

  const currentFolderId = useFolderStore((s) => s.currentFolderId);
  const breadcrumb = useFolderStore((s) => s.breadcrumb);
  const setCurrentFolder = useFolderStore((s) => s.setCurrentFolder);
  const navigateToCrumbStore = useFolderStore((s) => s.navigateToCrumb);
  const setFoldersStore = useFolderStore((s) => s.setFolders);
  const setLoadingStore = useFolderStore((s) => s.setLoading);
  const loading = useFolderStore((s) => s.loading);

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

  const refresh = useCallback(async () => {
    setLoadingStore(true);
    try {
      const raw = await listFolders(currentFolderId);
      setFoldersStore(raw);
      // Record each folder's protection metadata so any folder the user has
      // browsed can be password-routed by id (the backend has no get-by-id).
      useFolderRegistry.getState().record(raw);
      const key = await getNameKey();
      setLocked(!key);
      const decrypted = await Promise.all(
        raw.map(async (f) => ({
          ...f,
          name: key ? await decryptNameSafe(f.encrypted_name, key) : "[locked]",
          protected: f.pw_salt != null,
        }))
      );
      setFolders(decrypted);
    } catch {
      setFolders([]);
    } finally {
      setLoadingStore(false);
    }
  }, [currentFolderId, getNameKey, setFoldersStore, setLoadingStore]);

  useEffect(() => {
    refresh();
    // `cachedPassphrase` is an explicit dep: re-decrypt folder names whenever the
    // vault locks/unlocks (refresh's own identity doesn't change on unlock).
  }, [refresh, cachedPassphrase]);

  const createFolder = useCallback(
    async (name: string) => {
      const key = await getNameKey();
      if (!key) throw new Error("Unlock your vault to create folders");
      const encrypted_name = await encryptName(name.trim(), key);
      await apiCreateFolder({ encrypted_name, parent_id: currentFolderId });
      await refresh();
    },
    [getNameKey, currentFolderId, refresh]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const key = await getNameKey();
      if (!key) throw new Error("Unlock your vault to rename folders");
      const encrypted_name = await encryptName(name.trim(), key);
      await apiRenameFolder(id, encrypted_name);
      await refresh();
    },
    [getNameKey, refresh]
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      await apiDeleteFolder(id);
      await refresh();
    },
    [refresh]
  );

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
    loading,
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
