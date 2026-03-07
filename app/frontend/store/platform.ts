import { create } from "zustand";
import type { PlatformStatus, RepoInfo } from "@/types";

interface PlatformStore {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
  loading: boolean;
  setStatuses: (statuses: PlatformStatus[]) => void;
  setRepos: (repos: RepoInfo[]) => void;
  setLoading: (loading: boolean) => void;
}

export const usePlatformStore = create<PlatformStore>((set) => ({
  statuses: [],
  repos: [],
  loading: false,
  setStatuses: (statuses) => set({ statuses }),
  setRepos: (repos) => set({ repos }),
  setLoading: (loading) => set({ loading }),
}));
