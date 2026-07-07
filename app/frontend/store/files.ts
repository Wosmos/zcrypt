"use client";

import { useQuery } from "@tanstack/react-query";
import type { FileMetadata } from "@/types";
import { listFiles } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth";
import { decryptFileNames } from "@/lib/file-names";

// Fetch the file list and resolve zero-knowledge names in one place, so every
// consumer of qk.files sees decrypted (or "[locked]") names without its own
// decrypt step. Legacy plaintext-name files pass through untouched.
function fetchFiles(): Promise<FileMetadata[]> {
  return listFiles().then(decryptFileNames);
}

/**
 * Files server-state, backed by TanStack Query.
 *
 * `/api/files` returns the entire flat file list (the explorer filters by folder
 * client-side), so this is ONE global query — `qk.files`. Being the single
 * source of truth is the whole point: every view reads this key and every
 * mutation invalidates it, so a delete/move can no longer leave a stale second
 * copy behind (the ghost-file bug class).
 *
 * The OPFS offline cache is integrated as (a) an instant cold-load seed and
 * (b) a write-through mirror that follows the query cache, so a remount can
 * never resurrect a row that was just deleted/moved.
 */

/** Reactive files list for components. */
export function useFilesQuery() {
  return useQuery({
    queryKey: qk.files,
    queryFn: fetchFiles,
  });
}

/** Non-reactive snapshot for stores/handlers outside the React tree. */
export function getFilesData(): FileMetadata[] {
  return queryClient.getQueryData<FileMetadata[]>(qk.files) ?? [];
}

/** Optimistically write the files cache (mutations + drag-to-move/delete). */
export function setFilesData(
  updater: FileMetadata[] | ((prev: FileMetadata[]) => FileMetadata[])
): void {
  queryClient.setQueryData<FileMetadata[]>(qk.files, (prev) => {
    const base = prev ?? [];
    return typeof updater === "function"
      ? (updater as (p: FileMetadata[]) => FileMetadata[])(base)
      : updater;
  });
}

/** Force a refetch + reconcile of the files list (used as `refresh()`). */
export function invalidateFiles(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: qk.files });
}

/**
 * Fetch-or-cache the file list, returning it directly. For one-off readers
 * (integrity / snapshots / devices / shared-vault / expiring tabs) that need the
 * file list as a reference but aren't part of the reactive vault UI — they share
 * the one cache (instant if the vault was just open) instead of issuing their own
 * independent `/api/files`.
 */
export function ensureFiles(): Promise<FileMetadata[]> {
  return queryClient.ensureQueryData({ queryKey: qk.files, queryFn: fetchFiles });
}

// Single deduped initial fetch, shared by AuthGuard's prefetch and useFileList's
// mount. prefetchQuery is a no-op when the cache is still fresh, and TanStack
// dedupes concurrent fetches of the same key — so a fresh dashboard load issues
// ONE /api/files even when both fire at once.
export function prefetchFileList(force = false): Promise<void> {
  if (force) {
    return queryClient.invalidateQueries({ queryKey: qk.files, refetchType: "all" });
  }
  return queryClient.prefetchQuery({ queryKey: qk.files, queryFn: fetchFiles });
}

// ── Offline cache (OPFS) integration ─────────────────────────────────────────

let hydrated = false;

/** Seed the files cache from OPFS for an instant cold start (before the network
 *  refetch lands). Only seeds when the query has no data yet, so it never
 *  overwrites fresher in-memory state. */
export async function hydrateFilesFromCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    hydrated = false; // allow a retry once the user resolves
    return;
  }
  if (getFilesData().length > 0) return;
  try {
    const { getOfflineCache } = await import("@/lib/offline-cache");
    const cache = await getOfflineCache();
    // OPFS stores ciphertext names (see the write-through below); decrypt on the
    // way in so an offline cold start shows real names when the vault is unlocked.
    const cached = await decryptFileNames(cache.getFiles(userId));
    if (cached.length > 0 && getFilesData().length === 0) {
      queryClient.setQueryData<FileMetadata[]>(qk.files, cached);
    }
  } catch {
    // OPFS unavailable — fall back to the network fetch only
  }
}

// Blank the decrypted name of zero-knowledge files before they touch disk, so the
// OPFS cache never persists plaintext names (it holds only the opaque
// encrypted_name, exactly like the server). Legacy plaintext-name files are
// unaffected — their name is already plaintext on the server.
function stripDecryptedNames(files: FileMetadata[]): FileMetadata[] {
  return files.map((f) => (f.encrypted_name ? { ...f, original_name: "" } : f));
}

// Re-resolve names when the vault locks or unlocks: encrypted-name files must
// flip between "[locked]" and their real name. A dynamic import avoids any load
// cycle; the passphrase store fires on unlock (cache set) and lock (cache clear).
if (typeof window !== "undefined") {
  let lastUnlocked: boolean | null = null;
  void import("@/store/passphrase").then(({ usePassphraseStore }) => {
    usePassphraseStore.subscribe((s) => {
      const unlocked = s.cachedPassphrase != null;
      if (unlocked !== lastUnlocked) {
        lastUnlocked = unlocked;
        void invalidateFiles(); // refetch → fetchFiles re-runs decryptFileNames
      }
    });
  });
}

// Write-through: whenever the files cache changes (network refetch OR an
// optimistic mutation), mirror it to OPFS so the next cold load is correct.
// Coalesced to one persist per tick to avoid thrashing on rapid updates.
if (typeof window !== "undefined") {
  let persistScheduled = false;
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.query.queryKey[0] !== "files") return;
    if (persistScheduled) return;
    persistScheduled = true;
    queueMicrotask(() => {
      persistScheduled = false;
      const userId = useAuthStore.getState().user?.id;
      const data = stripDecryptedNames(getFilesData());
      if (!userId) return;
      void import("@/lib/offline-cache")
        .then(({ getOfflineCache }) => getOfflineCache())
        .then((cache) => cache.setFiles(userId, data))
        .catch(() => {});
    });
  });
}
