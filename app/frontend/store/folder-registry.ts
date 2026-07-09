import { create } from "zustand";
import type { Folder } from "@/types";

/**
 * Client-side registry of folder protection metadata, keyed by folder id.
 *
 * The backend only exposes `GET /api/folders?parent_id=` (list a level), not a
 * "get folder by id" endpoint. To route a file to the right password we need to
 * know whether ITS folder (`file.folder_id`) is protected and, if so, its
 * `pw_salt` / `pw_verifier`. We populate this registry from every folder listing
 * (useFolders.refresh, the move dialog's lazy tree) so any folder the user has
 * browsed to is recorded here.
 *
 * Stores ONLY the opaque base64 blobs the server already returned — never a
 * password or any derived key. Purely a lookup cache; resets on reload.
 */

interface FolderProtectionInfo {
  /** null when the folder is not password-protected. */
  pwSalt: string | null;
  pwVerifier: string | null;
}

interface FolderRegistryStore {
  /** folderId -> protection info (opaque base64 only). */
  byId: Record<string, FolderProtectionInfo>;

  /** Record (or refresh) the protection info for a batch of folders. */
  record: (folders: Folder[]) => void;
  /** Look up one folder's protection info, or null if unknown. */
  get: (folderId: string) => FolderProtectionInfo | null;
  /** True iff the folder is known to be protected (`pw_salt != null`). */
  isProtected: (folderId: string) => boolean;
}

export const useFolderRegistry = create<FolderRegistryStore>((set, get) => ({
  byId: {},

  record: (folders) => {
    if (folders.length === 0) return;
    set((s) => {
      const next = { ...s.byId };
      for (const f of folders) {
        next[f.id] = {
          pwSalt: f.pw_salt ?? null,
          pwVerifier: f.pw_verifier ?? null,
        };
      }
      return { byId: next };
    });
  },

  get: (folderId) => get().byId[folderId] ?? null,

  isProtected: (folderId) => {
    const info = get().byId[folderId];
    return info != null && info.pwSalt != null;
  },
}));
