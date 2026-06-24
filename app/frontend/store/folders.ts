import { create } from "zustand";
import type { Folder } from "@/types";

export interface Crumb {
  id: string | null;
  name: string;
}

const ROOT_CRUMB: Crumb = { id: null, name: "My Vault" };

interface FolderStore {
  currentFolderId: string | null;
  breadcrumb: Crumb[];
  folders: Folder[];
  decryptedNames: Record<string, string>;
  loading: boolean;

  setFolders: (folders: Folder[]) => void;
  setDecryptedNames: (names: Record<string, string>) => void;
  setLoading: (loading: boolean) => void;

  // Navigation
  setCurrentFolder: (id: string | null, name: string) => void;
  pushCrumb: (crumb: Crumb) => void;
  navigateToCrumb: (index: number) => void;
  reset: () => void;
}

export const useFolderStore = create<FolderStore>((set, get) => ({
  currentFolderId: null,
  breadcrumb: [ROOT_CRUMB],
  folders: [],
  decryptedNames: {},
  loading: false,

  setFolders: (folders) => set({ folders }),
  setDecryptedNames: (decryptedNames) => set({ decryptedNames }),
  setLoading: (loading) => set({ loading }),

  // Open a folder: append it to the breadcrumb trail and make it current.
  setCurrentFolder: (id, name) => {
    if (id === null) {
      set({ currentFolderId: null, breadcrumb: [ROOT_CRUMB] });
      return;
    }
    const { breadcrumb } = get();
    // If we're re-opening a crumb already on the trail, truncate to it.
    const existing = breadcrumb.findIndex((c) => c.id === id);
    if (existing !== -1) {
      set({ currentFolderId: id, breadcrumb: breadcrumb.slice(0, existing + 1) });
      return;
    }
    set({ currentFolderId: id, breadcrumb: [...breadcrumb, { id, name }] });
  },

  pushCrumb: (crumb) =>
    set((s) => ({ currentFolderId: crumb.id, breadcrumb: [...s.breadcrumb, crumb] })),

  navigateToCrumb: (index) => {
    const { breadcrumb } = get();
    const target = breadcrumb[index];
    if (!target) return;
    set({ currentFolderId: target.id, breadcrumb: breadcrumb.slice(0, index + 1) });
  },

  reset: () => set({ currentFolderId: null, breadcrumb: [ROOT_CRUMB], folders: [], decryptedNames: {} }),
}));
