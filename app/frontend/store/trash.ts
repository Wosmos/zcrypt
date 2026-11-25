"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import { listTrash } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { setListData, invalidateKey } from "@/lib/query-cache";
import { usePassphraseStore } from "@/store/passphrase";
import { ensureFileNames, getNamesEpoch, resolveFileNames, subscribeNames } from "@/lib/file-names";

async function fetchTrash(): Promise<FileMetadata[]> {
  const list = await listTrash();
  if (usePassphraseStore.getState().cachedPassphrase) void ensureFileNames(list);
  return list;
}

/**
 * Trash server-state, backed by TanStack Query. Previously this lived in a
 * component-local useState "island" with no link to the vault file list, so a
 * restore updated trash but left the vault stale (and vice-versa). Now both read
 * shared query keys and mutations invalidate across them.
 */
export function useTrashQuery() {
  const epoch = useSyncExternalStore(subscribeNames, getNamesEpoch, getNamesEpoch);
  const unlocked = usePassphraseStore((s) => s.cachedPassphrase != null);
  // Names are sealed like the vault's: the cache keeps ciphertext and the
  // select resolves it, so a lock or a newly decrypted name re-renders.
  const select = useCallback(
    (data: FileMetadata[]) => resolveFileNames(data, unlocked, epoch),
    [epoch, unlocked],
  );
  useEffect(() => {
    const raw = queryClient.getQueryData<FileMetadata[]>(qk.trash);
    if (unlocked && raw) void ensureFileNames(raw);
  }, [unlocked]);
  return useQuery({ queryKey: qk.trash, queryFn: fetchTrash, select });
}

/** Optimistic write to the trash cache (drop-on-restore / drop-on-purge). */
export function setTrashData(
  updater: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[]),
): void {
  setListData<FileMetadata>(qk.trash, updater);
}

export function invalidateTrash(): Promise<void> {
  return invalidateKey(qk.trash);
}
