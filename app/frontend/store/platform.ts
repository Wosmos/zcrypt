import { create } from "zustand";
import type { PlatformStatus, RepoInfo } from "@/types";
import { getPlatformStatus, listRepos } from "@/lib/api";

interface PlatformStore {
  statuses: PlatformStatus[];
  repos: RepoInfo[];
  loading: boolean;
  lastFetched: number | null;
  setStatuses: (statuses: PlatformStatus[]) => void;
  setRepos: (repos: RepoInfo[]) => void;
  setLoading: (loading: boolean) => void;
  setLastFetched: (ts: number) => void;
}

export const usePlatformStore = create<PlatformStore>((set) => ({
  statuses: [],
  repos: [],
  loading: false,
  lastFetched: null,
  setStatuses: (statuses) => set({ statuses }),
  setRepos: (repos) => set({ repos }),
  setLoading: (loading) => set({ loading }),
  setLastFetched: (ts) => set({ lastFetched: ts }),
}));

const FRESH_MS = 30_000;
let inFlight: Promise<boolean> | null = null;

// Single deduped fetch of platform status + repos, shared by AuthGuard's
// onboarding check and usePlatformHealth, so a fresh dashboard load issues ONE
// request instead of two even when both fire at once. Skips entirely if a recent
// fetch is cached (unless forced). Resolves true if usable data is in the store.
export function fetchPlatformHealth(force = false): Promise<boolean> {
  const store = usePlatformStore.getState();
  if (!force && store.lastFetched && Date.now() - store.lastFetched < FRESH_MS) {
    return Promise.resolve(true);
  }
  if (inFlight) return inFlight;
  store.setLoading(true);
  inFlight = Promise.all([getPlatformStatus(), listRepos()])
    .then(([s, r]) => {
      const ps = usePlatformStore.getState();
      ps.setStatuses(s);
      ps.setRepos(r);
      ps.setLastFetched(Date.now());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      usePlatformStore.getState().setLoading(false);
      inFlight = null;
    });
  return inFlight;
}
