"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import {
  listFiles,
  listFolders,
  updateFileStyle as apiUpdateFileStyle,
  setFileName as apiSetFileName,
} from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { setListData, invalidateKey } from "@/lib/query-cache";
import { usePassphraseStore } from "@/store/passphrase";
import {
  decryptFileNames,
  ensureFileNames,
  resolveFileNames,
  subscribeNames,
  getNamesEpoch,
} from "@/lib/file-names";
import { encryptStyle, encryptName, type CustomStyle } from "@/lib/name-crypto";
import { requireNameKey } from "@/lib/sealed";
import { onDecryptCacheClear } from "@/lib/decrypt-cache";

// The cache holds the RAW list exactly as the server returns it (names are
// ciphertext), which is what makes it safe to persist. Names are resolved at
// read time from the in-memory name maps (lib/file-names).
function fetchFiles(): Promise<FileMetadata[]> {
  return listFiles();
}

/**
 * Files server-state, backed by TanStack Query.
 *
 * `/api/files` returns the entire flat file list (the explorer filters by folder
 * client-side), so this is ONE global query: `qk.files`. Being the single
 * source of truth is the whole point: every view reads this key and every
 * mutation invalidates it, so a delete/move can no longer leave a stale second
 * copy behind (the ghost-file bug class).
 */

/** Reactive files list for components, with names resolved for display. */
export function useFilesQuery() {
  const epoch = useSyncExternalStore(subscribeNames, getNamesEpoch, getNamesEpoch);
  const unlocked = usePassphraseStore((s) => s.cachedPassphrase != null);
  // A new select identity whenever names resolve or the vault locks/unlocks, so
  // the view re-derives from cache instead of refetching.
  const select = useCallback(
    (data: FileMetadata[]) => resolveFileNames(data, unlocked, epoch),
    [epoch, unlocked],
  );
  return useQuery({ queryKey: qk.files, queryFn: fetchFiles, select });
}

function getRawFiles(): FileMetadata[] {
  return queryClient.getQueryData<FileMetadata[]>(qk.files) ?? [];
}

/** Non-reactive snapshot (names resolved) for stores/handlers outside React. */
export function getFilesData(): FileMetadata[] {
  return resolveFileNames(getRawFiles());
}

/** Optimistically write the files cache (mutations + drag-to-move/delete). */
export function setFilesData(
  updater: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[]),
): void {
  setListData<FileMetadata>(qk.files, updater);
}

/** Force a refetch + reconcile of the files list (used as `refresh()`). */
export function invalidateFiles(): Promise<void> {
  return invalidateKey(qk.files);
}

/** Set/clear a file's custom card style (icon + color). Encrypts with the same
 *  per-user name key as file/folder names, calls the API, then invalidates the
 *  files list so the decrypted `style` is reconciled from the server response:
 *  mirrors useFolders' renameFolder (call, then invalidate; no manual patch). */
export async function updateFileStyle(fileId: string, style: CustomStyle | null): Promise<void> {
  const key = await requireNameKey().catch(() => {
    throw new Error("Unlock your vault to customize files");
  });
  const encrypted_style = style ? await encryptStyle(style, key) : null;
  await apiUpdateFileStyle(fileId, encrypted_style);
  await invalidateFiles();
}

/** Rename a file: encrypts the trimmed new name with the same per-user name
 *  key as folders, then calls the PATCH /api/files/{id}/name endpoint (also
 *  used for one-time legacy-name resealing) and invalidates the files list.
 *  Blocks a duplicate sibling name within the same folder, mirroring
 *  useFolders' renameFolder guard. */
export async function renameFile(fileId: string, name: string): Promise<void> {
  const key = await requireNameKey().catch(() => {
    throw new Error("Unlock your vault to rename files");
  });
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");

  const files = getFilesData();
  const target = files.find((f) => f.id === fileId);
  const folderId = target?.folder_id ?? null;
  const dup = files.some(
    (f) =>
      f.id !== fileId &&
      (f.folder_id ?? null) === folderId &&
      f.original_name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (dup) throw new Error(`A file named "${trimmed}" already exists here.`);

  const encrypted_name = await encryptName(trimmed, key);
  await apiSetFileName(fileId, encrypted_name);
  await invalidateFiles();
}

/**
 * Fetch-or-cache the file list, returning it with names resolved. For one-off
 * readers (integrity / snapshots / devices / shared-vault / expiring tabs) that
 * need the file list as a reference but aren't part of the reactive vault UI,
 * they share the one cache (instant if the vault was just open) instead of
 * issuing their own independent `/api/files`.
 */
export function ensureFiles(): Promise<FileMetadata[]> {
  return queryClient
    .ensureQueryData({ queryKey: qk.files, queryFn: fetchFiles })
    .then(decryptFileNames);
}

// Single deduped initial fetch, shared by AuthGuard's prefetch and useFileList's
// mount. prefetchQuery is a no-op when the cache is still fresh, and TanStack
// dedupes concurrent fetches of the same key, so a fresh dashboard load issues
// ONE /api/files even when both fire at once.
export function prefetchFileList(force = false): Promise<void> {
  if (force) {
    return queryClient.invalidateQueries({ queryKey: qk.files, refetchType: "all" });
  }
  return queryClient.prefetchQuery({ queryKey: qk.files, queryFn: fetchFiles });
}

/** Warm the two lists the vault paints first (all files + root folders) in one
 *  go. Called by AuthGuard in parallel with the session check. */
export function prefetchVault(): Promise<void> {
  return Promise.all([
    prefetchFileList(),
    queryClient.prefetchQuery({ queryKey: qk.folders(null), queryFn: () => listFolders(null) }),
  ]).then(() => undefined);
}

// Resolve names the moment they become resolvable: when the raw list lands (a
// fetch, a restore from disk, an optimistic write) and when the vault unlocks.
// Neither refetches: the list is already cached, only the names were missing.
if (typeof window !== "undefined") {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== "files") return;
    if (usePassphraseStore.getState().cachedPassphrase) void ensureFileNames(getRawFiles());
  });
  let wasUnlocked = usePassphraseStore.getState().cachedPassphrase != null;
  usePassphraseStore.subscribe((s) => {
    const unlocked = s.cachedPassphrase != null;
    if (unlocked && !wasUnlocked) {
      void ensureFileNames(getRawFiles());
      // Tools lists open sealed labels at fetch time: refetch any read while locked.
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
    }
    wasUnlocked = unlocked;
  });
  // ...and drop them on lock, like every other piece of decrypted plaintext.
  onDecryptCacheClear(() => queryClient.removeQueries({ queryKey: ["tools"] }));
}
